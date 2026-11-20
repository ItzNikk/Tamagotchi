import { ArrowUpCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReleaseInfo } from '../hooks/useAppUpdater';
import { LiquidGlassSurface } from './LiquidGlassSurface';

interface UpdateBannerProps {
  visible: boolean;
  latestRelease: ReleaseInfo | null;
  isUpdating: boolean;
  onUpdateNow: () => void;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({
  visible,
  latestRelease,
  isUpdating,
  onUpdateNow,
  onOpenSettings,
  onDismiss,
}: UpdateBannerProps) {
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
              contentClassName="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <ArrowUpCircle
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-amber-200"
                />
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-semibold text-white">
                    Update ready
                    {latestRelease ? (
                      <span className="ml-1.5 font-normal tabular-nums text-white/90">
                        · v{latestRelease.version}
                      </span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="cursor-pointer text-xs text-white/88 underline-offset-2 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  >
                    View release details
                  </button>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={onUpdateNow}
                  className="ios-glass-button ios-glass-active-lens min-h-[40px] cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85"
                >
                  {isUpdating ? 'Updating…' : 'Update Now'}
                </button>
                <button
                  type="button"
                  aria-label="Dismiss update notification"
                  onClick={onDismiss}
                  className="ios-glass-button flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-white/85 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </LiquidGlassSurface>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
