package com.itznikk.tamagotchi;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private static final String UPDATES_DIR_NAME = "updates";
    private static final int MAX_REDIRECTS = 8;
    private static final long POST_INSTALL_CLEANUP_DELAY_MS = 4000L;

    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();
    private final AtomicBoolean updateInProgress = new AtomicBoolean(false);
    private volatile File pendingApkFile = null;
    private volatile ScheduledFuture<?> pendingCleanupTask = null;

    @Override
    public void load() {
        // Guaranteed cleanup of any downloaded APK immediately after an update relaunches the app
        executor.execute(this::deleteAllUpdateApks);
    }

    @Override
    protected void handleOnDestroy() {
        cancelScheduledCleanup();
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    private void cancelScheduledCleanup() {
        ScheduledFuture<?> task = pendingCleanupTask;
        if (task != null) {
            task.cancel(false);
            pendingCleanupTask = null;
        }
    }

    private File getUpdatesDir() {
        File dir = new File(getContext().getCacheDir(), UPDATES_DIR_NAME);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return dir;
    }

    private int deleteAllUpdateApks() {
        int deleted = 0;
        File dir = new File(getContext().getCacheDir(), UPDATES_DIR_NAME);
        if (!dir.exists() || !dir.isDirectory()) {
            pendingApkFile = null;
            return 0;
        }
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.isFile() && f.delete()) {
                    deleted++;
                }
            }
        }
        pendingApkFile = null;
        return deleted;
    }

    private boolean hasInstallPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return getContext().getPackageManager().canRequestPackageInstalls();
        }
        return true;
    }

    private void emitState(String state, String message) {
        JSObject payload = new JSObject();
        payload.put("state", state);
        if (message != null) {
            payload.put("message", message);
        }
        notifyListeners("updateState", payload);
    }

    private void emitProgress(long downloaded, long total) {
        JSObject payload = new JSObject();
        payload.put("bytesDownloaded", downloaded);
        payload.put("totalBytes", total);
        int percent = total > 0 ? (int) Math.min(100, (downloaded * 100L) / total) : -1;
        payload.put("percent", percent);
        notifyListeners("downloadProgress", payload);
    }

    private boolean isValidApkArchive(File file) {
        if (file == null || !file.exists() || file.length() < 1024) {
            return false;
        }
        try (FileInputStream fis = new FileInputStream(file)) {
            int b0 = fis.read();
            int b1 = fis.read();
            // APK files are ZIP archives starting with 'P' (0x50) 'K' (0x4B)
            return b0 == 0x50 && b1 == 0x4B;
        } catch (Exception e) {
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private long getLongVersionCodeCompat(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return info.getLongVersionCode();
        }
        return info.versionCode;
    }

    @SuppressWarnings("deprecation")
    private Signature[] extractSignatures(PackageInfo info) {
        if (info == null) return null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            SigningInfo signingInfo = info.signingInfo;
            if (signingInfo != null) {
                return signingInfo.hasMultipleSigners()
                        ? signingInfo.getApkContentsSigners()
                        : signingInfo.getSigningCertificateHistory();
            }
        }
        return info.signatures;
    }

    @SuppressWarnings("deprecation")
    private String validateDownloadedApk(File apkFile) {
        if (!isValidApkArchive(apkFile)) {
            return "Downloaded file is not a valid Android APK package.";
        }

        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? PackageManager.GET_SIGNING_CERTIFICATES
                : PackageManager.GET_SIGNATURES;

        PackageInfo archiveInfo = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), flags);
        if (archiveInfo == null) {
            // Fallback without signature flag in case OEM parser rejects signature query on archive
            archiveInfo = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), 0);
        }
        if (archiveInfo == null) {
            return "Downloaded APK could not be parsed. Please retry the update.";
        }

        String myPkg = getContext().getPackageName();
        if (!myPkg.equals(archiveInfo.packageName)) {
            return "Downloaded APK package (" + archiveInfo.packageName + ") does not match this app.";
        }

        try {
            PackageInfo installedInfo = pm.getPackageInfo(myPkg, flags);
            long installedCode = getLongVersionCodeCompat(installedInfo);
            long archiveCode = getLongVersionCodeCompat(archiveInfo);

            if (archiveCode > 0 && installedCode > 0 && archiveCode < installedCode) {
                return "Downloaded APK is an older build than the currently installed version.";
            }

            Signature[] installedSigs = extractSignatures(installedInfo);
            Signature[] archiveSigs = extractSignatures(archiveInfo);
            if (installedSigs != null && installedSigs.length > 0
                    && archiveSigs != null && archiveSigs.length > 0) {
                boolean matches = false;
                for (Signature a : archiveSigs) {
                    for (Signature b : installedSigs) {
                        if (a != null && b != null && Arrays.equals(a.toByteArray(), b.toByteArray())) {
                            matches = true;
                            break;
                        }
                    }
                    if (matches) break;
                }
                if (!matches) {
                    return "This update uses the consistent release signing key. Uninstall your older debug build once, then install the new release APK.";
                }
            }
        } catch (Exception ignored) {
            // Proceed to Android installer if PackageManager metadata lookup fails on a specific OEM
        }

        return null;
    }

    private HttpURLConnection openFollowingRedirects(String urlString) throws Exception {
        String currentUrl = urlString;
        for (int hops = 0; hops < MAX_REDIRECTS; hops++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(currentUrl).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("User-Agent", "Tamagotchi-Android-Updater");
            conn.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream, */*");

            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM
                    || code == HttpURLConnection.HTTP_MOVED_TEMP
                    || code == HttpURLConnection.HTTP_SEE_OTHER
                    || code == 307
                    || code == 308) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null || location.isEmpty()) {
                    throw new Exception("Redirect missing Location header");
                }
                currentUrl = new URL(new URL(currentUrl), location).toString();
                continue;
            }

            if (code < 200 || code >= 300) {
                conn.disconnect();
                throw new Exception("Download failed with HTTP " + code);
            }
            return conn;
        }
        throw new Exception("Too many redirects while downloading update");
    }

    private void launchInstaller(PluginCall call, File apkFile) {
        Activity activity = getActivity();
        if (activity == null) {
            updateInProgress.set(false);
            deleteAllUpdateApks();
            call.reject("Activity unavailable to launch installer");
            return;
        }

        try {
            Uri apkUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apkFile
            );

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.setClipData(ClipData.newRawUri("", apkUri));
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.putExtra(Intent.EXTRA_RETURN_RESULT, true);

            emitState("installing", "Opening Android package installer");
            startActivityForResult(call, installIntent, "onInstallActivityResult");
        } catch (Exception ex) {
            updateInProgress.set(false);
            deleteAllUpdateApks();
            call.reject("Could not launch Android installer: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void cleanupApks(PluginCall call) {
        executor.execute(() -> {
            if (updateInProgress.get()) {
                JSObject ret = new JSObject();
                ret.put("deletedCount", 0);
                call.resolve(ret);
                return;
            }
            int deleted = deleteAllUpdateApks();
            JSObject ret = new JSObject();
            ret.put("deletedCount", deleted);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasInstallPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("url");
        if (downloadUrl == null || downloadUrl.trim().isEmpty()) {
            call.reject("Missing APK download URL");
            return;
        }

        if (!updateInProgress.compareAndSet(false, true)) {
            call.reject("An update download is already in progress.");
            return;
        }

        cancelScheduledCleanup();

        String requestedName = call.getString("fileName", "tamagotchi-update.apk");
        String safeName = requestedName.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (!safeName.endsWith(".apk")) {
            safeName = safeName + ".apk";
        }
        final String finalFileName = safeName;

        executor.execute(() -> {
            HttpURLConnection conn = null;
            File targetFile = null;
            try {
                // Remove any older cached APKs before downloading the new release
                deleteAllUpdateApks();
                emitState("downloading", "Downloading update package");

                conn = openFollowingRedirects(downloadUrl.trim());
                long totalBytes = conn.getContentLengthLong();
                targetFile = new File(getUpdatesDir(), finalFileName);

                try (InputStream in = new BufferedInputStream(conn.getInputStream());
                     FileOutputStream out = new FileOutputStream(targetFile)) {
                    byte[] buffer = new byte[16384];
                    long downloaded = 0;
                    long lastEmitMs = 0;
                    int bytesRead;

                    while ((bytesRead = in.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                        downloaded += bytesRead;

                        long now = System.currentTimeMillis();
                        if (now - lastEmitMs >= 120) {
                            emitProgress(downloaded, totalBytes);
                            lastEmitMs = now;
                        }
                    }
                    out.flush();
                    emitProgress(downloaded, totalBytes > 0 ? totalBytes : downloaded);
                }

                String validationError = validateDownloadedApk(targetFile);
                if (validationError != null) {
                    updateInProgress.set(false);
                    deleteAllUpdateApks();
                    call.reject(validationError);
                    return;
                }

                pendingApkFile = targetFile;
                final File readyApk = targetFile;

                Activity activity = getActivity();
                if (activity == null) {
                    updateInProgress.set(false);
                    deleteAllUpdateApks();
                    call.reject("Activity unavailable");
                    return;
                }

                activity.runOnUiThread(() -> {
                    if (!hasInstallPermission() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        emitState(
                                "permission-required",
                                "Allow Tamagotchi to install updates in Android settings"
                        );
                        Intent permIntent = new Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getContext().getPackageName())
                        );
                        startActivityForResult(call, permIntent, "onInstallPermissionResult");
                    } else {
                        launchInstaller(call, readyApk);
                    }
                });
            } catch (Exception ex) {
                updateInProgress.set(false);
                deleteAllUpdateApks();
                call.reject("Update download failed: " + ex.getMessage(), ex);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }

    @ActivityCallback
    public void onInstallPermissionResult(PluginCall call, ActivityResult result) {
        File apk = pendingApkFile;
        if (apk == null || !apk.exists()) {
            updateInProgress.set(false);
            call.reject("Downloaded update package was cleared. Please try updating again.");
            return;
        }

        if (hasInstallPermission()) {
            launchInstaller(call, apk);
        } else {
            updateInProgress.set(false);
            deleteAllUpdateApks();
            JSObject ret = new JSObject();
            ret.put("status", "permission-denied");
            ret.put("deleted", true);
            call.resolve(ret);
        }
    }

    @ActivityCallback
    public void onInstallActivityResult(PluginCall call, ActivityResult result) {
        updateInProgress.set(false);
        int resultCode = result != null ? result.getResultCode() : Activity.RESULT_CANCELED;

        if (resultCode == Activity.RESULT_OK) {
            int deletedCount = deleteAllUpdateApks();
            JSObject ret = new JSObject();
            ret.put("status", "installed");
            ret.put("deleted", deletedCount > 0);
            ret.put("deletedCount", deletedCount);
            call.resolve(ret);
            return;
        }

        // Delay deletion briefly so Android 12-15 async PackageInstaller sessions finish reading the APK
        // before it is purged; successful self-updates also purge immediately on relaunch in load().
        cancelScheduledCleanup();
        pendingCleanupTask = executor.schedule(() -> {
            if (!updateInProgress.get()) {
                deleteAllUpdateApks();
            }
        }, POST_INSTALL_CLEANUP_DELAY_MS, TimeUnit.MILLISECONDS);

        JSObject ret = new JSObject();
        ret.put("status", "dismissed");
        ret.put("deleted", true);
        call.resolve(ret);
    }
}
