import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import LiquidGlass from 'liquid-glass-react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useLiquidGlass } from '../context/LiquidGlassContext';

interface LiquidGlassSurfaceProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  cornerRadius?: number;
  displacementScale?: number;
  blurAmount?: number;
  saturation?: number;
  aberrationIntensity?: number;
  elasticity?: number;
  mode?: 'standard' | 'polar' | 'prominent' | 'shader';
  variant?: 'panel' | 'dock';
  /** Enable interactive iOS elastic stretch & pointer-tracking glow (defaults true) */
  interactiveStretch?: boolean;
}

const SPRING_CONFIG = {
  stiffness: 340,
  damping: 22,
  mass: 0.72,
};

export function LiquidGlassSurface({
  children,
  className = '',
  contentClassName = '',
  cornerRadius = 28,
  displacementScale = 44,
  blurAmount = 0.14,
  saturation = 155,
  aberrationIntensity = 1.6,
  elasticity = 0.04,
  mode = 'standard',
  variant = 'panel',
  interactiveStretch = true,
}: LiquidGlassSurfaceProps) {
  const { settings } = useLiquidGlass();
  const prefersReducedMotion = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const prevSizeRef = useRef({ width: 0, height: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [isPointerInside, setIsPointerInside] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // Compositor-only elastic stretch MotionValues (volume-preserving squash & stretch)
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rawScaleX = useMotionValue(1);
  const rawScaleY = useMotionValue(1);

  const springX = useSpring(rawX, SPRING_CONFIG);
  const springY = useSpring(rawY, SPRING_CONFIG);
  const springScaleX = useSpring(rawScaleX, SPRING_CONFIG);
  const springScaleY = useSpring(rawScaleY, SPRING_CONFIG);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    let resizeTimer: number | undefined;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      const nextWidth = Math.round(rect.width);
      const nextHeight = Math.round(rect.height);

      const prev = prevSizeRef.current;
      if (prev.width === nextWidth && prev.height === nextHeight) {
        return;
      }

      const changedAfterMount = prev.width > 0 && prev.height > 0;
      prevSizeRef.current = { width: nextWidth, height: nextHeight };
      setSize({ width: nextWidth, height: nextHeight });

      if (changedAfterMount) {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 60);
      }
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => {
      observer.disconnect();
      window.clearTimeout(resizeTimer);
    };
  }, []);

  const stretchFactor =
    interactiveStretch && !prefersReducedMotion ? settings.stretch / 100 : 0;
  const glowFactor = settings.glow / 100;

  // Map user-adjustable Liquid Glass settings smoothly onto optical parameters
  const effectiveBlur = Math.max(
    0.02,
    blurAmount * 0.45 + (settings.blur / 100) * 0.46,
  );
  const effectiveDisplacement = Math.round(
    displacementScale * (settings.refraction / 62),
  );
  const effectiveAberration = Number(
    (aberrationIntensity * (settings.refraction / 62)).toFixed(2),
  );
  const effectiveElasticity = Number(
    (elasticity * (settings.stretch / 68)).toFixed(3),
  );

  // Calibrated smoked backing for crisp WCAG AA readability over bright sunlight/waterfall
  const smokedAlpha =
    variant === 'dock'
      ? Math.min(0.84, settings.tint + 0.08)
      : settings.tint;

  const updatePointerGlowAndStretch = (
    clientX: number,
    clientY: number,
    pressed: boolean,
  ) => {
    const node = hostRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    // Direct CSS variable update for zero-rerender 60/120fps specular glow
    node.style.setProperty('--glow-x', `${localX}px`);
    node.style.setProperty('--glow-y', `${localY}px`);

    if (stretchFactor <= 0) return;

    const normX = Math.max(-1, Math.min(1, (localX / rect.width) * 2 - 1));
    const normY = Math.max(-1, Math.min(1, (localY / rect.height) * 2 - 1));

    const maxShift = variant === 'dock' ? 3.5 : 4.5;
    const stretchMag = variant === 'dock' ? 0.018 : 0.022;
    const pressSquish = pressed ? 0.02 : 0;

    rawX.set(normX * maxShift * stretchFactor);
    rawY.set(normY * maxShift * stretchFactor);

    // Volume-preserving iOS gelatinous stretch along pointer axis
    const sx =
      1 +
      (Math.abs(normX) * stretchMag - Math.abs(normY) * stretchMag * 0.45) *
        stretchFactor +
      pressSquish * stretchFactor;
    const sy =
      1 +
      (Math.abs(normY) * stretchMag - Math.abs(normX) * stretchMag * 0.45) *
        stretchFactor -
      pressSquish * 0.85 * stretchFactor;

    rawScaleX.set(sx);
    rawScaleY.set(sy);
  };

  const resetStretch = () => {
    rawX.set(0);
    rawY.set(0);
    rawScaleX.set(1);
    rawScaleY.set(1);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    setIsPointerInside(true);
    updatePointerGlowAndStretch(event.clientX, event.clientY, isPressed);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    setIsPointerInside(true);
    setIsPressed(true);
    updatePointerGlowAndStretch(event.clientX, event.clientY, true);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    setIsPressed(false);
    updatePointerGlowAndStretch(event.clientX, event.clientY, false);
  };

  const handlePointerLeave = () => {
    setIsPointerInside(false);
    setIsPressed(false);
    resetStretch();
  };

  const shellClass =
    variant === 'dock' ? 'ios-glass-dock-shell' : 'ios-glass-shell';
  const radiusStyle = { borderRadius: `${cornerRadius}px` };

  const activeGlowOpacity =
    glowFactor * (isPressed ? 1 : isPointerInside ? 0.82 : 0);

  return (
    <motion.div
      ref={hostRef}
      style={{
        ...radiusStyle,
        x: stretchFactor > 0 ? springX : 0,
        y: stretchFactor > 0 ? springY : 0,
        scaleX: stretchFactor > 0 ? springScaleX : 1,
        scaleY: stretchFactor > 0 ? springScaleY : 1,
        boxShadow:
          glowFactor > 0
            ? `inset 0 1px 0.5px 0 rgba(255, 255, 255, ${(0.34 + glowFactor * 0.34).toFixed(2)}), inset 0 -1px 0 0 rgba(255, 255, 255, ${(0.1 + glowFactor * 0.14).toFixed(2)}), 0 0 ${Math.round(28 * glowFactor)}px -8px rgba(255, 248, 224, ${(glowFactor * (isPointerInside ? 0.32 : 0.16)).toFixed(2)}), 0 20px 46px -14px rgba(6, 10, 6, 0.58)`
            : undefined,
      }}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerLeave}
      onPointerLeave={handlePointerLeave}
      className={`liquid-glass-host relative overflow-hidden will-change-transform ${shellClass} ${className}`}
    >
      {/* True SVG optical refraction layer from open-source liquid-glass-react */}
      {size.width > 0 && size.height > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          style={radiusStyle}
        >
          <LiquidGlass
            displacementScale={effectiveDisplacement}
            blurAmount={effectiveBlur}
            saturation={saturation}
            aberrationIntensity={effectiveAberration}
            elasticity={effectiveElasticity}
            cornerRadius={cornerRadius}
            padding="0px"
            mode={mode}
            mouseContainer={hostRef}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
            }}
          >
            <div style={{ width: size.width, height: size.height }} />
          </LiquidGlass>
        </div>
      )}

      {/* Calibrated smoked optical tint plate ensuring effortless text readability */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] transition-colors duration-200"
        style={{
          ...radiusStyle,
          background: `linear-gradient(155deg, rgba(16, 24, 15, ${(smokedAlpha * 0.88).toFixed(3)}) 0%, rgba(12, 18, 12, ${(smokedAlpha * 1.06).toFixed(3)}) 60%, rgba(18, 26, 16, ${(smokedAlpha * 0.94).toFixed(3)}) 100%)`,
        }}
      />

      {/* Ambient iOS glass luminance sheen */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          ...radiusStyle,
          background: `linear-gradient(140deg, rgba(255, 255, 255, ${(0.1 + glowFactor * 0.12).toFixed(3)}) 0%, rgba(255, 255, 255, 0.02) 45%, rgba(255, 248, 224, ${(0.04 + glowFactor * 0.06).toFixed(3)}) 100%)`,
        }}
      />

      {/* Interactive pointer-tracking iOS interior specular glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[3] transition-opacity duration-200"
        style={{
          ...radiusStyle,
          opacity: activeGlowOpacity,
          background:
            'radial-gradient(300px circle at var(--glow-x, 50%) var(--glow-y, 0%), rgba(255, 252, 240, 0.22) 0%, rgba(255, 245, 214, 0.08) 42%, transparent 72%)',
        }}
      />

      {/* Interactive pointer-tracking iOS glowing bevel rim */}
      <div
        aria-hidden="true"
        className="ios-glass-rim-glow pointer-events-none absolute inset-0 z-[4] transition-opacity duration-200"
        style={{
          ...radiusStyle,
          opacity: Math.min(1, activeGlowOpacity * 1.15),
          background:
            'radial-gradient(240px circle at var(--glow-x, 50%) var(--glow-y, 0%), rgba(255, 255, 255, 0.95) 0%, rgba(255, 244, 210, 0.45) 42%, transparent 72%)',
        }}
      />

      {/* Subtle top-edge caustic highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-5 top-0 z-[5] h-px bg-gradient-to-r from-transparent via-white/80 to-transparent"
        style={{ opacity: 0.4 + glowFactor * 0.55 }}
      />

      {/* Crisp foreground content */}
      <div className={`relative z-10 ${contentClassName}`}>{children}</div>
    </motion.div>
  );
}
