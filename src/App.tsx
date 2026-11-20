import { useState } from 'react';
import { WifiOff } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { BottomNav } from './components/BottomNav';
import { LiquidGlassSurface } from './components/LiquidGlassSurface';
import { TabViews } from './components/TabViews';
import { UpdateBanner } from './components/UpdateBanner';
import { useAppUpdater } from './hooks/useAppUpdater';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { NAV_TABS, type TabId } from './types/navigation';

const BACKDROP_IMAGE_PATH = `${import.meta.env.BASE_URL}assets/aistudio/upsampled_img_14256803433111796_f3e6cb2d.png`;

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [backdropFailed, setBackdropFailed] = useState(false);
  const isOnline = useOnlineStatus();
  const updater = useAppUpdater();

  const activeLabel =
    NAV_TABS.find((tab) => tab.id === activeTab)?.label ?? 'Home';

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-[100dvh] w-full overflow-x-hidden">
        {/* Full-viewport scenic forest & waterfall backdrop with fallback gradient */}
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10 bg-gradient-to-b from-[#2b3b22] via-[#5d542d] to-[#1a2417]"
        >
          {!backdropFailed && (
            <img
              src={BACKDROP_IMAGE_PATH}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setBackdropFailed(true)}
              className="h-full w-full object-cover object-center"
            />
          )}
          {/* Measured contrast scrim preserving golden sunlight while ensuring WCAG AA legibility */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/32 via-black/14 to-black/48" />
        </div>

        {/* Main responsive layout shell */}
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pb-32 sm:pt-7 lg:px-8">
          {/* Minimal single-row floating Liquid Glass top bar */}
          <header className="flex items-center justify-between gap-4">
            <LiquidGlassSurface
              mode="shader"
              cornerRadius={999}
              displacementScale={36}
              blurAmount={0.14}
              saturation={155}
              aberrationIntensity={1.4}
              contentClassName="px-5 py-2.5"
            >
              <span className="block whitespace-nowrap font-display text-[15px] font-semibold tracking-[-0.015em] text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">
                Tamagotchi
              </span>
            </LiquidGlassSurface>

            <div className="flex items-center gap-3 text-sm font-medium text-white/88 drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
              {!isOnline ? (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-amber-200">
                  <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />
                  Offline
                </span>
              ) : null}
              <span className="whitespace-nowrap">{activeLabel}</span>
            </div>
          </header>

          {/* Spacious, vertically balanced tab showcase stage */}
          <main className="flex flex-1 flex-col justify-center py-8 sm:py-12">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="w-full"
              >
                <TabViews
                  activeTab={activeTab}
                  updater={{
                    currentVersion: updater.currentVersion,
                    platform: updater.platform,
                    recommendedAsset: updater.recommendedAsset,
                    githubRepo: updater.githubRepo,
                    status: updater.status,
                    latestRelease: updater.latestRelease,
                    updateAvailable: updater.updateAvailable,
                    offlineReady: updater.offlineReady,
                    lastCheckedAt: updater.lastCheckedAt,
                    errorMessage: updater.errorMessage,
                    onCheckForUpdates: () => void updater.checkForUpdates(),
                    onApplyUpdate: () => void updater.applyUpdate(),
                    onSaveGithubRepo: updater.setGithubRepo,
                  }}
                />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* Floating iOS Liquid Glass Update Prompt (only shown when a newer release/build is available) */}
        <UpdateBanner
          visible={updater.updateAvailable && !updater.bannerDismissed}
          latestRelease={updater.latestRelease}
          isUpdating={updater.status === 'updating'}
          onUpdateNow={() => void updater.applyUpdate()}
          onOpenSettings={() => {
            setActiveTab('settings');
            updater.dismissBanner();
          }}
          onDismiss={updater.dismissBanner}
        />

        {/* Floating iOS 26 Liquid Glass 3-way Bottom Navigation Dock */}
        <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />
      </div>
    </MotionConfig>
  );
}

export default App;
