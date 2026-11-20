package com.itznikk.tamagotchi;

import android.app.Activity;
import android.content.Intent;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private static final String UPDATES_DIR_NAME = "updates";
    private static final int MAX_REDIRECTS = 8;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile File pendingApkFile = null;

    @Override
    public void load() {
        // Guaranteed cleanup of any downloaded APK immediately after an update relaunches the app
        executor.execute(this::deleteAllUpdateApks);
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
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
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.putExtra(Intent.EXTRA_RETURN_RESULT, true);

            emitState("installing", "Opening Android package installer");
            startActivityForResult(call, installIntent, "onInstallActivityResult");
        } catch (Exception ex) {
            deleteAllUpdateApks();
            call.reject("Could not launch Android installer: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void cleanupApks(PluginCall call) {
        executor.execute(() -> {
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

                if (!isValidApkArchive(targetFile)) {
                    deleteAllUpdateApks();
                    call.reject("Downloaded file is not a valid Android APK package.");
                    return;
                }

                pendingApkFile = targetFile;
                final File readyApk = targetFile;

                Activity activity = getActivity();
                if (activity == null) {
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
    private void onInstallPermissionResult(PluginCall call, ActivityResult result) {
        File apk = pendingApkFile;
        if (apk == null || !apk.exists()) {
            call.reject("Downloaded update package was cleared. Please try updating again.");
            return;
        }

        if (hasInstallPermission()) {
            launchInstaller(call, apk);
        } else {
            deleteAllUpdateApks();
            JSObject ret = new JSObject();
            ret.put("status", "permission-denied");
            ret.put("deleted", true);
            call.resolve(ret);
        }
    }

    @ActivityCallback
    private void onInstallActivityResult(PluginCall call, ActivityResult result) {
        // Delete the temporary APK immediately once the Android Package Installer finishes or is dismissed
        int deletedCount = deleteAllUpdateApks();
        int resultCode = result != null ? result.getResultCode() : Activity.RESULT_CANCELED;

        JSObject ret = new JSObject();
        ret.put("status", resultCode == Activity.RESULT_OK ? "installed" : "dismissed");
        ret.put("deleted", deletedCount > 0);
        ret.put("deletedCount", deletedCount);
        call.resolve(ret);
    }
}
