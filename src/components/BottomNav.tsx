import type { KeyboardEvent } from 'react';
import { Home, Settings, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { NAV_TABS, type TabId } from '../types/navigation';
import { LiquidGlassSurface } from './LiquidGlassSurface';

interface BottomNavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}

const TAB_ICONS: Record<TabId, typeof Home> = {
  home: Home,
  community: Users,
  settings: Settings,
};

export function BottomNav({ activeTab, onSelectTab }: BottomNavProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = NAV_TABS.findIndex((t) => t.id === activeTab);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = NAV_TABS[(currentIndex + 1) % NAV_TABS.length];
      onSelectTab(next.id);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prev =
        NAV_TABS[(currentIndex - 1 + NAV_TABS.length) % NAV_TABS.length];
      onSelectTab(prev.id);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onSelectTab(NAV_TABS[0].id);
    } else if (event.key === 'End') {
      event.preventDefault();
      onSelectTab(NAV_TABS[NAV_TABS.length - 1].id);
    }
  };

  return (
    <nav
      aria-label="Primary navigation"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:pb-6"
    >
      <div className="pointer-events-auto w-full max-w-[360px] sm:max-w-[396px]">
        <LiquidGlassSurface
          variant="dock"
          mode="shader"
          cornerRadius={999}
          displacementScale={52}
          blurAmount={0.16}
          saturation={165}
          aberrationIntensity={2}
          elasticity={0.05}
          contentClassName="p-1.5"
        >
          <div
            role="tablist"
            aria-label="Main sections"
            onKeyDown={handleKeyDown}
            className="grid grid-cols-3 items-center gap-1"
          >
            {NAV_TABS.map((tab) => {
              const Icon = TAB_ICONS[tab.id];
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`panel-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => onSelectTab(tab.id)}
                  className={`group relative flex min-h-[52px] min-w-[44px] cursor-pointer flex-col items-center justify-center rounded-full px-3 py-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85 ${
                    isActive
                      ? 'text-white'
                      : 'text-white/75 hover:text-white active:scale-[0.97]'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="liquid-nav-active-lens"
                      aria-hidden="true"
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 32,
                        mass: 0.8,
                      }}
                      className="ios-glass-active-lens absolute inset-0 rounded-full"
                    />
                  )}

                  <Icon
                    aria-hidden="true"
                    strokeWidth={isActive ? 2.25 : 1.85}
                    className={`relative z-10 h-[21px] w-[21px] transition-transform duration-150 ${
                      isActive
                        ? 'scale-[1.04] drop-shadow-[0_1px_6px_rgba(255,255,255,0.35)]'
                        : 'group-hover:scale-[1.03]'
                    }`}
                  />
                  <span className="relative z-10 mt-1 whitespace-nowrap text-[11px] font-medium leading-none tracking-[-0.01em] drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </LiquidGlassSurface>
      </div>
    </nav>
  );
}
