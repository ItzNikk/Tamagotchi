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

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'update-available'
  | 'updating'
  | 'error';

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

function getInitialRepo(): string {
  try {
    const saved = window.localStorage.getItem(REPO_STORAGE_KEY)?.trim();
    if (saved && REPO_PATTERN.test(saved)) return saved;
  } catch {
    // Ignore storage errors in restricted contexts
  }
  const envRepo = (import.meta.env.VITE_GITHUB_REPO ?? '').trim();
  return REPO_PATTERN.test(envRepo) ? envRepo : '';
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

export type DevicePlatform =
  | 'windows'
  | 'macos'
  | 'linux'
  | 'android'
  | 'ios'
  | 'web';

export function detectPlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'web';
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

export function useAppUpdater() {
  const currentVersion = normalizeVersion(__APP_VERSION__);
  const platform = detectPlatform();
  const [githubRepo, setGithubRepoState] = useState<string>(getInitialRepo);
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [latestRelease, setLatestRelease] = useState<ReleaseInfo | null>(null);
  const [swUpdateReady, setSwUpdateReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(
    null,
  );
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const isFileProtocol = window.location.protocol === 'file:';
    const isCapacitorNative = 'Capacitor' in window;
    if (isFileProtocol || isCapacitorNative || !('serviceWorker' in navigator)) {
      return;
    }

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
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
  }, []);

  const checkForUpdates = useCallback(
    async (repoOverride?: string) => {
      const targetRepo = (repoOverride ?? githubRepo).trim();
      setStatus('checking');
      setErrorMessage(null);

      let foundUpdate = swUpdateReady;
      let resolvedRelease: ReleaseInfo | null = null;
      let discoveredRepo = targetRepo;

      // 1. Trigger live Service Worker check if registered
      if (swRegistrationRef.current) {
        try {
          await swRegistrationRef.current.update();
        } catch {
          // Ignore transient SW check errors in dev/offline environments
        }
      }

      // 2. Check deployed version.json (always bypassed from cache)
      try {
        const res = await fetch(
          `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`,
          {
            cache: 'no-store',
          },
        );
        if (res.ok) {
          const manifest = (await res.json()) as VersionManifestResponse;
          if (!discoveredRepo && manifest.repository && REPO_PATTERN.test(manifest.repository)) {
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

      // 3. Check public GitHub Releases API (free, no key needed) when repo is configured
      if (discoveredRepo && REPO_PATTERN.test(discoveredRepo)) {
        try {
          const ghRes = await fetch(
            `https://api.github.com/repos/${discoveredRepo}/releases/latest`,
            {
              headers: {
                Accept: 'application/vnd.github+json',
              },
            },
          );

          if (ghRes.ok) {
            const release = (await ghRes.json()) as GitHubReleaseResponse;
            const releaseVersion = normalizeVersion(release.tag_name ?? '');

            if (releaseVersion) {
              const releaseInfo: ReleaseInfo = {
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

              resolvedRelease = releaseInfo;
              if (compareSemver(releaseVersion, currentVersion) > 0) {
                foundUpdate = true;
              }
            }
          } else if (ghRes.status === 404) {
            setErrorMessage(
              `No published GitHub Releases found yet for ${discoveredRepo}.`,
            );
          } else if (ghRes.status === 403) {
            setErrorMessage(
              'GitHub API rate limit reached. Try checking again shortly.',
            );
          } else {
            setErrorMessage(
              `Could not check GitHub Releases (HTTP ${ghRes.status}).`,
            );
          }
        } catch {
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
        setStatus((prev) => (prev === 'updating' ? prev : 'up-to-date'));
      }
    },
    [currentVersion, githubRepo, swUpdateReady],
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
          error: 'Enter a repository as owner/repo (for example: octocat/tamagotchi).',
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
          swRegistrationRef.current.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    } catch {
      // Fallback directly to fresh reload
    }

    window.location.reload();
  }, [swUpdateReady]);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
  }, []);

  const updateAvailable =
    status === 'update-available' ||
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
    recommendedAsset,
    githubRepo,
    status,
    latestRelease,
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
