import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Home, Settings, Users } from 'lucide-react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useLiquidGlass } from '../context/LiquidGlassContext';
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

const PILL_SPRING = {
  stiffness: 430,
  damping: 32,
  mass: 0.72,
};

const SCALE_SPRING = {
  stiffness: 380,
  damping: 24,
  mass: 0.65,
};

export function BottomNav({ activeTab, onSelectTab }: BottomNavProps) {
  const { settings } = useLiquidGlass();
  const prefersReducedMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);

  const [trackWidth, setTrackWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressing, setIsPressing] = useState(false);

  const activeIndex = Math.max(
    0,
    NAV_TABS.findIndex((t) => t.id === activeTab),
  );
  const slotWidth = trackWidth > 0 ? trackWidth / NAV_TABS.length : 0;
  const stretchFactor = prefersReducedMotion ? 0 : settings.stretch / 100;
  const glowFactor = settings.glow / 100;

  const rawX = useMotionValue(0);
  const rawScaleX = useMotionValue(1);
  const rawScaleY = useMotionValue(1);

  const springX = useSpring(rawX, PILL_SPRING);
  const springScaleX = useSpring(rawScaleX, SCALE_SPRING);
  const springScaleY = useSpring(rawScaleY, SCALE_SPRING);

  const dragStateRef = useRef<{
    active: boolean;
    dragging: boolean;
    pointerId: number;
    startX: number;
    lastClientX: number;
    rectLeft: number;
    width: number;
    lastTabIndex: number;
  } | null>(null);

  const suppressClickRef = useRef(false);

  useEffect(() => {
    const node = trackRef.current;
    if (!node) return;

    const updateWidth = () => {
      const nextWidth = node.getBoundingClientRect().width;
      setTrackWidth(nextWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Snap pill smoothly to the active tab whenever not actively dragging
  useEffect(() => {
    if (slotWidth <= 0 || isDragging) return;
    rawX.set(activeIndex * slotWidth);
  }, [activeIndex, slotWidth, isDragging, rawX]);

  const handleTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const node = trackRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    dragStateRef.current = {
      active: true,
      dragging: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      lastClientX: event.clientX,
      rectLeft: rect.left,
      width: rect.width,
      lastTabIndex: activeIndex,
    };

    setIsPressing(true);
    if (stretchFactor > 0) {
      rawScaleX.set(1 + 0.045 * stretchFactor);
      rawScaleY.set(1 + 0.045 * stretchFactor);
    }
  };

  const handleTrackPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || !state.active || state.pointerId !== event.pointerId) return;

    const totalDelta = event.clientX - state.startX;
    const stepDelta = event.clientX - state.lastClientX;
    state.lastClientX = event.clientX;

    if (!state.dragging && Math.abs(totalDelta) > 5) {
      state.dragging = true;
      setIsDragging(true);
      try {
        trackRef.current?.setPointerCapture(event.pointerId);
      } catch {
        // Ignore if pointer capture isn't supported
      }
    }

    if (!state.dragging || state.width <= 0) return;

    const currentSlot = state.width / NAV_TABS.length;
    const maxLeft = state.width - currentSlot;
    const rawLeft = event.clientX - state.rectLeft - currentSlot / 2;

    // Soft iOS rubber-band overdrag resistance past dock edges
    let displayLeft = rawLeft;
    if (rawLeft < 0) {
      displayLeft = rawLeft * (0.18 + 0.1 * stretchFactor);
    } else if (rawLeft > maxLeft) {
      displayLeft = maxLeft + (rawLeft - maxLeft) * (0.18 + 0.1 * stretchFactor);
    }

    rawX.set(displayLeft);

    // Liquid horizontal droplet stretch driven by drag speed & edge overpull
    if (stretchFactor > 0) {
      const overpull =
        rawLeft < 0
          ? Math.abs(rawLeft) / currentSlot
          : rawLeft > maxLeft
            ? (rawLeft - maxLeft) / currentSlot
            : 0;
      const velocityStretch = Math.min(0.14, Math.abs(stepDelta) * 0.0085);
      const edgeStretch = Math.min(0.12, overpull * 0.18);
      const extraX = (velocityStretch + edgeStretch) * stretchFactor;

      rawScaleX.set(1 + 0.055 * stretchFactor + extraX);
      rawScaleY.set(1 + 0.045 * stretchFactor - extraX * 0.42);
    }

    // Live tab switching as the glass pill crosses into another tab slot
    const clampedLeft = Math.max(0, Math.min(maxLeft, rawLeft));
    const hoveredIndex = Math.max(
      0,
      Math.min(NAV_TABS.length - 1, Math.round(clampedLeft / currentSlot)),
    );

    if (hoveredIndex !== state.lastTabIndex) {
      state.lastTabIndex = hoveredIndex;
      onSelectTab(NAV_TABS[hoveredIndex].id);
    }
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const wasDragging = state.dragging;
    const finalIndex = state.lastTabIndex;
    const currentSlot =
      state.width > 0 ? state.width / NAV_TABS.length : slotWidth;

    dragStateRef.current = null;
    setIsPressing(false);
    setIsDragging(false);

    rawScaleX.set(1);
    rawScaleY.set(1);

    if (wasDragging) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 90);

      try {
        if (trackRef.current?.hasPointerCapture(event.pointerId)) {
          trackRef.current.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore release errors
      }

      if (currentSlot > 0) {
        rawX.set(finalIndex * currentSlot);
      }
      onSelectTab(NAV_TABS[finalIndex].id);
    }
  };

  const handleTabClick = (tabId: TabId) => {
    if (suppressClickRef.current) return;
    onSelectTab(tabId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = NAV_TABS[(activeIndex + 1) % NAV_TABS.length];
      onSelectTab(next.id);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prev =
        NAV_TABS[(activeIndex - 1 + NAV_TABS.length) % NAV_TABS.length];
      onSelectTab(prev.id);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onSelectTab(NAV_TABS[0].id);
    } else if (event.key === 'End') {
      event.preventDefault();
      onSelectTab(NAV_TABS[NAV_TABS.length - 1].id);
    }
  };

  const isLoupeElevated = isPressing || isDragging;

  return (
    <nav
      aria-label="Primary navigation"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:pb-6"
    >
      <div className="pointer-events-auto w-full max-w-[368px] sm:max-w-[404px]">
        <LiquidGlassSurface
          variant="dock"
          mode="shader"
          cornerRadius={999}
          displacementScale={54}
          blurAmount={0.18}
          saturation={168}
          aberrationIntensity={2}
          elasticity={0.06}
          contentClassName="p-1.5"
        >
          <div
            ref={trackRef}
            role="tablist"
            aria-label="Main sections — tap or drag pill to switch tabs"
            onKeyDown={handleKeyDown}
            onPointerDown={handleTrackPointerDown}
            onPointerMove={handleTrackPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            style={{ touchAction: 'none' }}
            className={`relative grid select-none grid-cols-3 items-center ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            {/* Draggable iOS 26 Liquid Glass Loupe Pill */}
            {slotWidth > 0 ? (
              <motion.div
                aria-hidden="true"
                style={{
                  width: slotWidth,
                  x: springX,
                  scaleX: springScaleX,
                  scaleY: springScaleY,
                  boxShadow:
                    glowFactor > 0
                      ? `inset 0 1.5px 1px 0 rgba(255, 255, 255, ${(isLoupeElevated ? 0.92 : 0.72).toFixed(2)}), 0 0 ${Math.round((isLoupeElevated ? 32 : 22) * glowFactor)}px ${isLoupeElevated ? 2 : -2}px rgba(255, 246, 214, ${(glowFactor * (isLoupeElevated ? 0.55 : 0.34)).toFixed(2)}), 0 8px 18px rgba(0, 0, 0, 0.28)`
                      : undefined,
                }}
                className={`pointer-events-none absolute inset-y-0 left-0 z-0 rounded-full will-change-transform transition-[background,border-color] duration-150 ${
                  isLoupeElevated
                    ? 'ios-glass-active-lens-dragging'
                    : 'ios-glass-active-lens'
                }`}
              >
                {/* Specular droplet gleam inside the draggable glass pill */}
                <span
                  className="pointer-events-none absolute inset-x-3 top-0.5 h-3 rounded-full bg-gradient-to-b from-white/50 to-transparent blur-[1px]"
                  style={{ opacity: 0.4 + glowFactor * 0.5 }}
                />
              </motion.div>
            ) : null}

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
                  onClick={() => handleTabClick(tab.id)}
                  className={`group relative z-10 flex min-h-[54px] min-w-[44px] flex-col items-center justify-center rounded-full px-3 py-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 ${
                    isDragging ? 'cursor-grabbing' : 'cursor-pointer'
                  } ${
                    isActive
                      ? 'text-white'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  <Icon
                    aria-hidden="true"
                    strokeWidth={isActive ? 2.3 : 1.9}
                    className={`h-[21px] w-[21px] transition-transform duration-150 ${
                      isActive
                        ? 'scale-[1.07] drop-shadow-[0_1px_8px_rgba(255,255,255,0.45)]'
                        : 'group-hover:scale-[1.04]'
                    }`}
                  />
                  <span className="mt-1 whitespace-nowrap text-[11px] font-semibold leading-none tracking-[-0.01em] drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
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
