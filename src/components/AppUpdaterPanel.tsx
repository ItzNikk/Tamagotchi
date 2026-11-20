import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Download,
  ExternalLink,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import type { ReleaseInfo, UpdateStatus } from '../hooks/useAppUpdater';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { LiquidGlassSurface } from './LiquidGlassSurface';

interface AppUpdaterPanelProps {
  currentVersion: string;
  githubRepo: string;
  status: UpdateStatus;
  latestRelease: ReleaseInfo | null;
  updateAvailable: boolean;
  offlineReady: boolean;
  lastCheckedAt: Date | null;
  errorMessage: string | null;
  onCheckForUpdates: () => void;
  onApplyUpdate: () => void;
  onSaveGithubRepo: (repo: string) => { ok: true } | { ok: false; error: string };
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[index]}`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function AppUpdaterPanel({
  currentVersion,
  githubRepo,
  status,
  latestRelease,
  updateAvailable,
  offlineReady,
  lastCheckedAt,
  errorMessage,
  onCheckForUpdates,
  onApplyUpdate,
  onSaveGithubRepo,
}: AppUpdaterPanelProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [repoInput, setRepoInput] = useState(githubRepo);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repoSaved, setRepoSaved] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    setRepoInput(githubRepo);
  }, [githubRepo]);

  const isChecking = status === 'checking';
  const isUpdating = status === 'updating';

  const handleRepoSubmit = (event: FormEvent) => {
    event.preventDefault();
    setRepoError(null);
    setRepoSaved(false);
    const result = onSaveGithubRepo(repoInput);
    if (!result.ok) {
      setRepoError(result.error);
      return;
    }
    setRepoSaved(true);
    window.setTimeout(() => setRepoSaved(false), 2500);
  };

  const statusSummary = (() => {
    if (isUpdating) return 'Applying update…';
    if (isChecking) return 'Checking for updates…';
    if (updateAvailable && latestRelease) {
      return `v${latestRelease.version} available`;
    }
    if (updateAvailable) return 'New version ready to install';
    if (lastCheckedAt) {
      return `Up to date · Checked ${lastCheckedAt.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }
    return 'Ready to check';
  })();

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Primary Software Update & Multi-Platform Install Surface */}
      <LiquidGlassSurface
        cornerRadius={28}
        displacementScale={38}
        blurAmount={0.15}
        contentClassName="divide-y divide-white/15 px-5 sm:px-7"
      >
        {/* Row 1: Version & In-App Update Trigger */}
        <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-[15px] font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)]">
              App Updates
            </p>
            <p className="mt-1 text-sm tabular-nums text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)]">
              Installed v{currentVersion} <span aria-hidden="true">·</span>{' '}
              {statusSummary}
              {offlineReady ? (
                <>
                  {' '}
                  <span aria-hidden="true">·</span> Offline ready
                </>
              ) : null}
            </p>
            {errorMessage ? (
              <p className="mt-1.5 text-xs text-amber-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            {updateAvailable ? (
              <button
                type="button"
                disabled={isUpdating}
                onClick={onApplyUpdate}
                className="ios-glass-active-lens inline-flex min-h-[44px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`}
                />
                {isUpdating ? 'Updating…' : 'Update Now'}
              </button>
            ) : null}

            <button
              type="button"
              disabled={isChecking || isUpdating}
              onClick={onCheckForUpdates}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border border-white/30 bg-white/12 px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-white/20 active:scale-[0.98] disabled:cursor-wait disabled:opacity-65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`}
              />
              {isChecking ? 'Checking…' : 'Check for Updates'}
            </button>
          </div>
        </div>

        {/* Row 2: GitHub Release Repository Connection */}
        <div className="py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="github-repo-input"
                className="block font-display text-[15px] font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
              >
                GitHub Releases Source
              </label>
              <p className="mt-1 text-xs leading-relaxed text-white/75 drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
                Connect your public GitHub repository to check auto-generated
                releases and download files directly in-app.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleRepoSubmit}
            className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center"
          >
            <input
              id="github-repo-input"
              type="text"
              value={repoInput}
              onChange={(e) => {
                setRepoInput(e.target.value);
                if (repoError) setRepoError(null);
              }}
              placeholder="owner/tamagotchi"
              autoComplete="off"
              spellCheck={false}
              className="min-h-[44px] w-full flex-1 rounded-2xl border border-white/25 bg-black/20 px-4 py-2 text-sm text-white placeholder:text-white/45 focus:border-white/55 focus:outline-none focus:ring-2 focus:ring-white/40"
            />
            <button
              type="submit"
              className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-white/30 bg-white/15 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-white/25 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85"
            >
              {repoSaved ? (
                <>
                  <Check aria-hidden="true" className="h-4 w-4" />
                  Saved
                </>
              ) : (
                'Save & Check'
              )}
            </button>
          </form>

          {repoError ? (
            <p className="mt-2 text-xs text-amber-200">{repoError}</p>
          ) : null}
        </div>

        {/* Row 3: Multi-Platform App Installation (PWA) */}
        <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-[15px] font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)]">
              Install on Device
            </p>
            <p className="mt-1 text-sm text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)]">
              {isInstalled
                ? 'Running as an installed standalone app'
                : 'Add Tamagotchi to your home screen or desktop for offline access and instant OTA updates'}
            </p>
          </div>

          {!isInstalled && (isInstallable || isIOS) ? (
            <div className="shrink-0">
              {isInstallable ? (
                <button
                  type="button"
                  onClick={() => void install()}
                  className="ios-glass-active-lens inline-flex min-h-[44px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-150 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85"
                >
                  <Smartphone aria-hidden="true" className="h-4 w-4" />
                  Install App
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowIOSGuide((prev) => !prev)}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border border-white/30 bg-white/12 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85"
                >
                  <Smartphone aria-hidden="true" className="h-4 w-4" />
                  {showIOSGuide ? 'Hide iOS Steps' : 'Install on iOS'}
                </button>
              )}
            </div>
          ) : null}
        </div>

        {showIOSGuide && !isInstalled && isIOS ? (
          <div className="py-4 text-sm leading-relaxed text-white/88">
            <p className="font-medium text-white">Add to Home Screen on iOS</p>
            <ol className="mt-1.5 list-inside list-decimal space-y-1 text-white/80">
              <li>Tap the Share button in Safari.</li>
              <li>Scroll down and tap Add to Home Screen.</li>
              <li>Open Tamagotchi from your Home Screen for standalone mode.</li>
            </ol>
          </div>
        ) : null}
      </LiquidGlassSurface>

      {/* Auto-Generated GitHub Release & Download Files Surface */}
      {latestRelease ? (
        <LiquidGlassSurface
          cornerRadius={28}
          displacementScale={38}
          blurAmount={0.15}
          contentClassName="divide-y divide-white/15 px-5 sm:px-7"
        >
          <div className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-white/75">
                Latest Release <span aria-hidden="true">·</span>{' '}
                <span className="tabular-nums">{latestRelease.tag}</span>
                {latestRelease.publishedAt ? (
                  <>
                    {' '}
                    <span aria-hidden="true">·</span>{' '}
                    {formatDate(latestRelease.publishedAt)}
                  </>
                ) : null}
              </p>
              <h2 className="mt-1 font-display text-lg font-semibold text-white">
                {latestRelease.title}
              </h2>
            </div>

            {latestRelease.releaseUrl ? (
              <a
                href={latestRelease.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-white/88 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                Release Notes
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>

          {latestRelease.notes ? (
            <div className="py-4">
              <p className="whitespace-pre-line text-sm leading-relaxed text-white/82">
                {latestRelease.notes.slice(0, 480)}
                {latestRelease.notes.length > 480 ? '…' : ''}
              </p>
            </div>
          ) : null}

          {latestRelease.assets.length > 0 ? (
            <div className="py-4">
              <p className="mb-3 text-xs font-medium text-white/75">
                Auto-Generated Download Files
              </p>
              <div className="divide-y divide-white/10">
                {latestRelease.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {asset.name}
                      </p>
                      <p className="text-xs tabular-nums text-white/70">
                        {formatBytes(asset.size)}
                      </p>
                    </div>
                    <a
                      href={asset.downloadUrl}
                      download={asset.name}
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-white/28 bg-white/12 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-white/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85"
                    >
                      <Download aria-hidden="true" className="h-3.5 w-3.5" />
                      Download
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </LiquidGlassSurface>
      ) : null}
    </div>
  );
}
