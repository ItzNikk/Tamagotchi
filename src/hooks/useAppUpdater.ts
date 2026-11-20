import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  downloadUrl: string;
  downloadCount: number;
}

export interface ReleaseInfo {
  version: string;
  tag: string;
  title: string;
  notes: string;
  publishedAt: string;
  releaseUrl: string;
  assets: ReleaseAsset[];
  source: 'service-worker' | 'version-manifest' | 'github-release';
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'update-available'
  | 'downloading'
  | 'installing'
  | 'updating'
  | 'error';

export type DevicePlatform =
  | 'windows'
  | 'macos'
  | 'linux'
  | 'android'
  | 'ios'
  | 'web';

interface CapacitorPluginListenerHandle {
  remove: () => Promise<void> | void;
}

interface NativeApkUpdaterPlugin {
  downloadAndInstall: (options: {
    url: string;
    fileName?: string;
  }) => Promise<{
    status: 'installed' | 'dismissed' | 'permission-denied';
    deleted?: boolean;
    deletedCount?: number;
  }>;
  cleanupApks: () => Promise<{ deletedCount: number }>;
  canInstallPackages: () => Promise<{ granted: boolean }>;
  addListener?: (
    eventName: 'downloadProgress' | 'updateState',
    listenerFunc: (data: Record<string, unknown>) => void,
  ) => Promise<CapacitorPluginListenerHandle> | CapacitorPluginListenerHandle;
}

interface CapacitorWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    registerPlugin?: <T>(pluginName: string) => T;
    Plugins?: {
      ApkUpdater?: NativeApkUpdaterPlugin;
    };
  };
}

const DEFAULT_GITHUB_REPO = 'ItzNikk/Tamagotchi';
const REPO_STORAGE_KEY = 'tamagotchi:github-repo';
const REPO_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, '');
}

export function compareSemver(a: string, b: string): number {
  const pa = normalizeVersion(a)
    .split('-')[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  const pb = normalizeVersion(b)
    .split('-')[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);

  const length = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < length; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function getNativeApkUpdater(): NativeApkUpdaterPlugin | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as CapacitorWindow).Capacitor;
  if (!cap) return null;
  if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) {
    return null;
  }
  if (typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'android') {
    return null;
  }
  const plugin =
    cap.Plugins?.ApkUpdater ??
    (typeof cap.registerPlugin === 'function'
      ? cap.registerPlugin<NativeApkUpdaterPlugin>('ApkUpdater')
      : undefined);
  if (!plugin || typeof plugin.downloadAndInstall !== 'function') {
    return null;
  }
  return plugin;
}

function isCapacitorNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as CapacitorWindow).Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') {
    return cap.isNativePlatform();
  }
  const plat = cap.getPlatform?.();
  return plat === 'android' || plat === 'ios';
}

function getInitialRepo(): string {
  try {
    const saved = window.localStorage.getItem(REPO_STORAGE_KEY)?.trim();
    if (saved && REPO_PATTERN.test(saved)) return saved;
  } catch {
    // Ignore storage errors in restricted contexts
  }
  const envRepo = (import.meta.env.VITE_GITHUB_REPO ?? '').trim();
  if (REPO_PATTERN.test(envRepo)) return envRepo;
  return DEFAULT_GITHUB_REPO;
}

export function detectPlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'web';
  const cap = (window as CapacitorWindow).Capacitor;
  const capPlatform = cap?.getPlatform?.();
  if (capPlatform === 'android') return 'android';
  if (capPlatform === 'ios') return 'ios';

  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/win/.test(ua)) return 'windows';
  if (/mac/.test(ua)) return 'macos';
  if (/linux/.test(ua)) return 'linux';
  return 'web';
}

export function findRecommendedAsset(
  assets: ReleaseAsset[],
  platform: DevicePlatform,
): ReleaseAsset | null {
  if (assets.length === 0) return null;
  const matchers: Record<DevicePlatform, RegExp[]> = {
    windows: [/setup\.exe$/i, /\.exe$/i],
    android: [/\.apk$/i],
    ios: [/\.ipa$/i],
    macos: [/\.dmg$/i],
    linux: [/\.appimage$/i, /\.tar\.gz$/i],
    web: [/web\.zip$/i],
  };

  for (const pattern of matchers[platform]) {
    const found = assets.find((asset) => pattern.test(asset.name));
    if (found) return found;
  }
  return null;
}

interface VersionManifestResponse {
  version?: string;
  releasedAt?: string;
  repository?: string;
  releaseUrl?: string;
  notes?: string;
}

interface GitHubReleaseResponse {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string;
  html_url?: string;
  assets?: Array<{
    id: number;
    name: string;
    size: number;
    browser_download_url: string;
    download_count: number;
  }>;
}

function triggerBrowserFileDownload(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function useAppUpdater() {
  const currentVersion = normalizeVersion(__APP_VERSION__);
  const platform = detectPlatform();
  const isNativeAndroid = Boolean(getNativeApkUpdater());
  const isNativeApp = isCapacitorNativeApp() || window.location.protocol === 'file:';

  const [githubRepo, setGithubRepoState] = useState<string>(getInitialRepo);
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [latestRelease, setLatestRelease] = useState<ReleaseInfo | null>(null);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [updateNotice, setUpdateNotice] = useState<string | null>(null);
  const [swUpdateReady, setSwUpdateReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(
    null,
  );
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const swUpdateReadyRef = useRef(false);

  // On native Android launch, guarantee any temporary update APK from a prior install is deleted
  useEffect(() => {
    const apkUpdater = getNativeApkUpdater();
    if (!apkUpdater) return;
    void apkUpdater.cleanupApks().catch(() => {
      // Non-fatal cleanup error
    });
  }, []);

  // Register PWA Service Worker on web/PWA environments only (skip inside file:// Electron or Capacitor APK/IPA)
  useEffect(() => {
    if (isNativeApp || !('serviceWorker' in navigator)) {
      return;
    }

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        swUpdateReadyRef.current = true;
        setSwUpdateReady(true);
        setStatus('update-available');
        setBannerDismissed(false);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
      onRegisteredSW(_swUrl, registration) {
        if (registration) {
          swRegistrationRef.current = registration;
        }
      },
    });

    updateSWRef.current = updateSW;
  }, [isNativeApp]);

  const checkForUpdates = useCallback(
    async (repoOverride?: string): Promise<ReleaseInfo | null> => {
      const targetRepo = (repoOverride ?? githubRepo).trim();
      setStatus('checking');
      setErrorMessage(null);

      let foundUpdate = swUpdateReadyRef.current;
      let resolvedRelease: ReleaseInfo | null = null;
      let discoveredRepo = targetRepo;
      let hadError = false;

      // 1. Trigger live Service Worker check if registered (web/PWA)
      if (swRegistrationRef.current) {
        try {
          await swRegistrationRef.current.update();
        } catch {
          // Ignore transient SW check errors in dev/offline environments
        }
      }

      // 2. Check deployed version.json on web/PWA (bypass cache)
      if (!isNativeApp) {
        try {
          const res = await fetch(
            `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`,
            {
              cache: 'no-store',
            },
          );
          if (res.ok) {
            const manifest = (await res.json()) as VersionManifestResponse;
            if (
              !discoveredRepo &&
              manifest.repository &&
              REPO_PATTERN.test(manifest.repository)
            ) {
              discoveredRepo = manifest.repository;
              setGithubRepoState(manifest.repository);
            }

            if (
              manifest.version &&
              compareSemver(manifest.version, currentVersion) > 0
            ) {
              foundUpdate = true;
              resolvedRelease = {
                version: normalizeVersion(manifest.version),
                tag: `v${normalizeVersion(manifest.version)}`,
                title: `Tamagotchi v${normalizeVersion(manifest.version)}`,
                notes: manifest.notes ?? 'A newer build is ready to apply.',
                publishedAt: manifest.releasedAt ?? new Date().toISOString(),
                releaseUrl: manifest.releaseUrl ?? '',
                assets: [],
                source: 'version-manifest',
              };
            }
          }
        } catch {
          // Offline or manifest unavailable
        }
      }

      // 3. Check public GitHub Releases API (free, no API key needed, bypass HTTP cache)
      if (discoveredRepo && REPO_PATTERN.test(discoveredRepo)) {
        const mapGitHubRelease = (release: GitHubReleaseResponse): ReleaseInfo | null => {
          const releaseVersion = normalizeVersion(release.tag_name ?? '');
          if (!releaseVersion) return null;
          return {
            version: releaseVersion,
            tag: release.tag_name ?? `v${releaseVersion}`,
            title: release.name || `Tamagotchi v${releaseVersion}`,
            notes: (release.body ?? '').trim(),
            publishedAt: release.published_at ?? '',
            releaseUrl:
              release.html_url ??
              `https://github.com/${discoveredRepo}/releases/latest`,
            assets: (release.assets ?? []).map((asset) => ({
              id: asset.id,
              name: asset.name,
              size: asset.size,
              downloadUrl: asset.browser_download_url,
              downloadCount: asset.download_count,
            })),
            source: 'github-release',
          };
        };

        try {
          const ghRes = await fetch(
            `https://api.github.com/repos/${discoveredRepo}/releases/latest`,
            {
              cache: 'no-store',
              headers: {
                Accept: 'application/vnd.github+json',
              },
            },
          );

          if (ghRes.ok) {
            const release = (await ghRes.json()) as GitHubReleaseResponse;
            let releaseInfo = mapGitHubRelease(release);

            // On native Android, if latest release doesn't have an APK yet, check recent releases for the newest APK
            if (
              isNativeAndroid &&
              releaseInfo &&
              !releaseInfo.assets.some((a) => /\.apk$/i.test(a.name))
            ) {
              try {
                const listRes = await fetch(
                  `https://api.github.com/repos/${discoveredRepo}/releases?per_page=5`,
                  {
                    cache: 'no-store',
                    headers: { Accept: 'application/vnd.github+json' },
                  },
                );
                if (listRes.ok) {
                  const list = (await listRes.json()) as GitHubReleaseResponse[];
                  const withApk = list
                    .map(mapGitHubRelease)
                    .find(
                      (r): r is ReleaseInfo =>
                        r !== null &&
                        r.assets.some((a) => /\.apk$/i.test(a.name)),
                    );
                  if (withApk) {
                    releaseInfo = withApk;
                  }
                }
              } catch {
                // Keep latest release info if list fallback fails
              }
            }

            if (releaseInfo) {
              resolvedRelease = releaseInfo;
              if (compareSemver(releaseInfo.version, currentVersion) > 0) {
                foundUpdate = true;
              }
            }
          } else if (ghRes.status === 404) {
            hadError = true;
            setErrorMessage(
              `No published GitHub Releases found yet for ${discoveredRepo}.`,
            );
          } else if (ghRes.status === 403) {
            hadError = true;
            setErrorMessage(
              'GitHub API rate limit reached. Try checking again shortly.',
            );
          } else {
            hadError = true;
            setErrorMessage(
              `Could not check GitHub Releases (HTTP ${ghRes.status}).`,
            );
          }
        } catch {
          hadError = true;
          setErrorMessage(
            'Unable to reach GitHub Releases. Check your network connection.',
          );
        }
      }

      setLatestRelease(resolvedRelease);
      setLastCheckedAt(new Date());

      if (foundUpdate) {
        setStatus('update-available');
        setBannerDismissed(false);
      } else {
        setStatus((prev) =>
          prev === 'downloading' || prev === 'installing' || prev === 'updating'
            ? prev
            : hadError
              ? 'error'
              : 'up-to-date',
        );
      }

      return resolvedRelease;
    },
    [currentVersion, githubRepo, isNativeAndroid, isNativeApp],
  );

  // Silent startup check + periodic 30-minute background check
  useEffect(() => {
    void checkForUpdates();
    const intervalId = window.setInterval(
      () => {
        void checkForUpdates();
      },
      30 * 60 * 1000,
    );
    return () => window.clearInterval(intervalId);
  }, [checkForUpdates]);

  const setGithubRepo = useCallback(
    (rawRepo: string) => {
      const cleaned = rawRepo
        .trim()
        .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
        .replace(/\.git$/i, '')
        .replace(/\/+$/, '');

      if (!cleaned) {
        setGithubRepoState('');
        setLatestRelease(null);
        setErrorMessage(null);
        try {
          window.localStorage.removeItem(REPO_STORAGE_KEY);
        } catch {
          // Ignore storage error
        }
        return { ok: true as const };
      }

      if (!REPO_PATTERN.test(cleaned)) {
        return {
          ok: false as const,
          error:
            'Enter a repository as owner/repo (for example: ItzNikk/Tamagotchi).',
        };
      }

      setGithubRepoState(cleaned);
      try {
        window.localStorage.setItem(REPO_STORAGE_KEY, cleaned);
      } catch {
        // Ignore storage error
      }
      void checkForUpdates(cleaned);
      return { ok: true as const };
    },
    [checkForUpdates],
  );

  const applyUpdate = useCallback(async () => {
    setErrorMessage(null);
    setUpdateNotice(null);

    const apkUpdater = getNativeApkUpdater();

    // PATH A: Native Android APK — download inside app, launch Android installer, then auto-delete APK
    if (apkUpdater) {
      let release = latestRelease;
      if (!release || release.assets.length === 0) {
        release = await checkForUpdates();
      }

      const apkAsset = release?.assets.find((asset) =>
        /\.apk$/i.test(asset.name),
      );
      if (!apkAsset) {
        setStatus('error');
        setErrorMessage(
          'The Android APK for this release is still building on GitHub Actions. Try again in a minute.',
        );
        return;
      }

      setStatus('downloading');
      setDownloadProgress({ bytesDownloaded: 0, totalBytes: apkAsset.size, percent: 0 });
      setUpdateNotice(`Downloading ${apkAsset.name}…`);

      const listeners: CapacitorPluginListenerHandle[] = [];
      try {
        if (typeof apkUpdater.addListener === 'function') {
          const progressHandle = await apkUpdater.addListener(
            'downloadProgress',
            (data) => {
              const bytesDownloaded = Math.max(0, Number(data.bytesDownloaded ?? 0));
              const rawTotal = Number(data.totalBytes ?? -1);
              const totalBytes = rawTotal > 0 ? rawTotal : apkAsset.size;
              const rawPercent = Number(data.percent ?? -1);
              const percent =
                rawPercent >= 0
                  ? Math.min(100, rawPercent)
                  : totalBytes > 0
                    ? Math.min(100, Math.round((bytesDownloaded * 100) / totalBytes))
                    : 0;
              setDownloadProgress({ bytesDownloaded, totalBytes, percent });
            },
          );
          listeners.push(progressHandle);

          const stateHandle = await apkUpdater.addListener(
            'updateState',
            (data) => {
              const state = String(data.state ?? '');
              const message =
                typeof data.message === 'string' ? data.message : null;
              if (state === 'installing') {
                setStatus('installing');
                setUpdateNotice(message ?? 'Opening Android installer…');
              } else if (state === 'permission-required') {
                setStatus('installing');
                setUpdateNotice(
                  message ??
                    'Enable "Allow from this source" in Android settings to install updates.',
                );
              }
            },
          );
          listeners.push(stateHandle);
        }

        const result = await apkUpdater.downloadAndInstall({
          url: apkAsset.downloadUrl,
          fileName: apkAsset.name,
        });

        setDownloadProgress(null);

        if (result.status === 'permission-denied') {
          setStatus('update-available');
          setErrorMessage(
            'Install permission was not granted. Enable "Allow from this source" for Tamagotchi and tap Update Now again.',
          );
        } else if (result.status === 'installed') {
          setStatus('up-to-date');
          setUpdateNotice('Update installed and temporary APK deleted.');
        } else {
          // Installer returned (cancelled or completed in background); APK already deleted natively
          setStatus('update-available');
          setUpdateNotice('Installer closed · temporary APK deleted.');
        }
      } catch (err) {
        setDownloadProgress(null);
        setStatus('error');
        const msg =
          err instanceof Error ? err.message : 'Unable to download or install APK.';
        setErrorMessage(msg);
        await apkUpdater.cleanupApks().catch(() => {});
      } finally {
        for (const handle of listeners) {
          try {
            await handle.remove();
          } catch {
            // Ignore listener removal errors
          }
        }
      }
      return;
    }

    // PATH B: Native Desktop (Electron file://) or Native iOS — download platform installer directly
    if (isNativeApp) {
      const release = latestRelease ?? (await checkForUpdates());
      const asset = release
        ? findRecommendedAsset(release.assets, platform)
        : null;
      if (asset) {
        setUpdateNotice(`Downloading ${asset.name}…`);
        triggerBrowserFileDownload(asset.downloadUrl, asset.name);
      } else {
        setErrorMessage(
          'No installer file found yet for this platform on the latest release.',
        );
      }
      return;
    }

    // PATH C: Web / Installed PWA — apply live Service Worker OTA update & reload
    setStatus('updating');
    try {
      if (swUpdateReady && updateSWRef.current) {
        await updateSWRef.current(true);
        return;
      }

      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((key) => window.caches.delete(key)));
      }

      if (swRegistrationRef.current) {
        await swRegistrationRef.current.update();
        if (swRegistrationRef.current.waiting) {
          swRegistrationRef.current.waiting.postMessage({
            type: 'SKIP_WAITING',
          });
        }
      }
    } catch {
      // Fallback directly to reload
    }

    window.location.reload();
  }, [checkForUpdates, isNativeApp, latestRelease, platform, swUpdateReady]);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
  }, []);

  const updateAvailable =
    status === 'update-available' ||
    status === 'downloading' ||
    status === 'installing' ||
    swUpdateReady ||
    Boolean(
      latestRelease && compareSemver(latestRelease.version, currentVersion) > 0,
    );

  const recommendedAsset = latestRelease
    ? findRecommendedAsset(latestRelease.assets, platform)
    : null;

  return {
    currentVersion,
    platform,
    isNativeAndroid,
    recommendedAsset,
    githubRepo,
    status,
    latestRelease,
    downloadProgress,
    updateNotice,
    updateAvailable,
    swUpdateReady,
    offlineReady,
    lastCheckedAt,
    errorMessage,
    bannerDismissed,
    checkForUpdates,
    applyUpdate,
    setGithubRepo,
    dismissBanner,
  };
}
