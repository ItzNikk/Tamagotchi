import { ArrowUpCircle, Loader2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  DownloadProgress,
  ReleaseInfo,
  UpdateStatus,
} from '../hooks/useAppUpdater';
import { LiquidGlassSurface } from './LiquidGlassSurface';

interface UpdateBannerProps {
  visible: boolean;
  latestRelease: ReleaseInfo | null;
  status: UpdateStatus;
  downloadProgress: DownloadProgress | null;
  updateNotice: string | null;
  onUpdateNow: () => void;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({
  visible,
  latestRelease,
  status,
  downloadProgress,
  updateNotice,
  onUpdateNow,
  onOpenSettings,
  onDismiss,
}: UpdateBannerProps) {
  const isDownloading = status === 'downloading';
  const isInstalling = status === 'installing';
  const isUpdating = status === 'updating';
  const isBusy = isDownloading || isInstalling || isUpdating;
  const percent = downloadProgress
    ? Math.max(0, Math.min(100, Math.round(downloadProgress.percent)))
    : 0;

  const heading = (() => {
    if (isDownloading) {
      return `Downloading${latestRelease ? ` v${latestRelease.version}` : ''}`;
    }
    if (isInstalling) {
      return 'Installing update';
    }
    if (isUpdating) {
      return 'Applying update';
    }
    return 'Update ready';
  })();

  const actionLabel = (() => {
    if (isDownloading) return `${percent}%`;
    if (isInstalling) return 'Installing…';
    if (isUpdating) return 'Updating…';
    return 'Update Now';
  })();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none fixed inset-x-0 bottom-[92px] z-30 flex justify-center px-4 sm:bottom-[104px]"
        >
          <div className="pointer-events-auto w-full max-w-[460px]">
            <LiquidGlassSurface
              variant="dock"
              cornerRadius={24}
              displacementScale={36}
              blurAmount={0.16}
              saturation={160}
              contentClassName="flex flex-col gap-2.5 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {isBusy ? (
                    <Loader2
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 animate-spin text-amber-200"
                    />
                  ) : (
                    <ArrowUpCircle
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 text-amber-200"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-semibold text-white">
                      {heading}
                      {isDownloading ? (
                        <span className="ml-1.5 font-normal tabular-nums text-white/90">
                          · {percent}%
                        </span>
                      ) : latestRelease && !isInstalling && !isUpdating ? (
                        <span className="ml-1.5 font-normal tabular-nums text-white/90">
                          · v{latestRelease.version}
                        </span>
                      ) : null}
                    </p>
                    {isBusy && updateNotice ? (
                      <p className="truncate text-xs text-white/88">
                        {updateNotice}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        className="cursor-pointer text-xs text-white/88 underline-offset-2 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                      >
                        View release details
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onUpdateNow}
                    className="ios-glass-button ios-glass-active-lens min-h-[40px] cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold tabular-nums text-white disabled:cursor-wait disabled:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85"
                  >
                    {actionLabel}
                  </button>
                  {!isDownloading ? (
                    <button
                      type="button"
                      aria-label="Dismiss update notification"
                      onClick={onDismiss}
                      className="ios-glass-button flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-white/85 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              {isDownloading ? (
                <div
                  role="progressbar"
                  aria-label="Update download progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-white/18"
                >
                  <div
                    className="h-full w-full origin-left rounded-full bg-gradient-to-r from-amber-200 via-white to-amber-100 transition-transform duration-150 ease-out"
                    style={{
                      transform: `scaleX(${Math.max(0.02, percent / 100)})`,
                    }}
                  />
                </div>
              ) : null}
            </LiquidGlassSurface>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
