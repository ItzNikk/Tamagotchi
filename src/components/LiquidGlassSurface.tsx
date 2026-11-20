import { useEffect, useRef, useState, type ReactNode } from 'react';
import LiquidGlass from 'liquid-glass-react';

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
}

export function LiquidGlassSurface({
  children,
  className = '',
  contentClassName = '',
  cornerRadius = 28,
  displacementScale = 48,
  blurAmount = 0.14,
  saturation = 155,
  aberrationIntensity = 1.6,
  elasticity = 0,
  mode = 'standard',
  variant = 'panel',
}: LiquidGlassSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    let resizeTimer: number | undefined;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      const nextWidth = Math.round(rect.width);
      const nextHeight = Math.round(rect.height);

      let changedAfterMount = false;
      setSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }
        if (prev.width > 0 && prev.height > 0) {
          changedAfterMount = true;
        }
        return { width: nextWidth, height: nextHeight };
      });

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

  const shellClass =
    variant === 'dock' ? 'ios-glass-dock-shell' : 'ios-glass-shell';
  const radiusStyle = { borderRadius: `${cornerRadius}px` };

  return (
    <div
      ref={hostRef}
      style={radiusStyle}
      className={`liquid-glass-host relative overflow-hidden ${shellClass} ${className}`}
    >
      {/* True SVG refraction & specular rim layer from open-source liquid-glass-react */}
      {size.width > 0 && size.height > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          style={radiusStyle}
        >
          <LiquidGlass
            displacementScale={displacementScale}
            blurAmount={blurAmount}
            saturation={saturation}
            aberrationIntensity={aberrationIntensity}
            elasticity={elasticity}
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

      {/* Subtle top-edge caustic highlight for iOS 26 liquid glass depth */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-0 z-[1] h-px bg-gradient-to-r from-transparent via-white/70 to-transparent"
      />

      {/* Crisp foreground content */}
      <div className={`relative z-10 ${contentClassName}`}>{children}</div>
    </div>
  );
}
