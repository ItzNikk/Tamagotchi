import { RotateCcw } from 'lucide-react';
import {
  useLiquidGlass,
  type GlassPresetId,
} from '../context/LiquidGlassContext';
import { LiquidGlassSurface } from './LiquidGlassSurface';

const PRESET_OPTIONS: ReadonlyArray<{
  id: Exclude<GlassPresetId, 'custom'>;
  label: string;
}> = [
  { id: 'clear', label: 'Clear' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'frosted', label: 'Frosted' },
];

export function GlassSettingsPanel() {
  const { settings, updateSetting, applyPreset, resetSettings } =
    useLiquidGlass();

  const tintPercent = Math.round(settings.tint * 100);

  return (
    <LiquidGlassSurface
      cornerRadius={28}
      displacementScale={38}
      blurAmount={0.15}
      contentClassName="divide-y divide-white/15 px-5 sm:px-7"
    >
      {/* Header + Presets */}
      <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-[15px] font-semibold text-white">
            Liquid Glass Appearance
          </p>
          <p className="mt-1 text-sm text-white/85">
            Tune glass readability, blur, refraction, stretchiness, and iOS edge
            glow in real time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Liquid Glass presets"
            className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/25 p-1"
          >
            {PRESET_OPTIONS.map((option) => {
              const active = settings.preset === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => applyPreset(option.id)}
                  className={`ios-glass-button min-h-[38px] cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85 ${
                    active
                      ? 'ios-glass-active-lens text-white'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={resetSettings}
            aria-label="Reset Liquid Glass to default"
            className="ios-glass-button inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-white/28 bg-white/12 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85"
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Live Sliders */}
      <div className="grid grid-cols-1 gap-5 py-5 sm:grid-cols-2 sm:gap-x-8">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              htmlFor="glass-tint-slider"
              className="text-sm font-medium text-white"
            >
              Readability Tint
            </label>
            <span className="text-xs font-medium tabular-nums text-white/85">
              {tintPercent}%
            </span>
          </div>
          <input
            id="glass-tint-slider"
            type="range"
            min={15}
            max={78}
            step={1}
            value={tintPercent}
            onChange={(e) =>
              updateSetting('tint', Number(e.target.value) / 100)
            }
            className="ios-glass-slider"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              htmlFor="glass-blur-slider"
              className="text-sm font-medium text-white"
            >
              Blur &amp; Frost
            </label>
            <span className="text-xs font-medium tabular-nums text-white/85">
              {settings.blur}%
            </span>
          </div>
          <input
            id="glass-blur-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={settings.blur}
            onChange={(e) => updateSetting('blur', Number(e.target.value))}
            className="ios-glass-slider"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              htmlFor="glass-refraction-slider"
              className="text-sm font-medium text-white"
            >
              Refraction &amp; Dispersion
            </label>
            <span className="text-xs font-medium tabular-nums text-white/85">
              {settings.refraction}%
            </span>
          </div>
          <input
            id="glass-refraction-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={settings.refraction}
            onChange={(e) =>
              updateSetting('refraction', Number(e.target.value))
            }
            className="ios-glass-slider"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              htmlFor="glass-stretch-slider"
              className="text-sm font-medium text-white"
            >
              Stretchiness
            </label>
            <span className="text-xs font-medium tabular-nums text-white/85">
              {settings.stretch}%
            </span>
          </div>
          <input
            id="glass-stretch-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={settings.stretch}
            onChange={(e) => updateSetting('stretch', Number(e.target.value))}
            className="ios-glass-slider"
          />
        </div>

        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              htmlFor="glass-glow-slider"
              className="text-sm font-medium text-white"
            >
              iOS Edge Glow
            </label>
            <span className="text-xs font-medium tabular-nums text-white/85">
              {settings.glow}%
            </span>
          </div>
          <input
            id="glass-glow-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={settings.glow}
            onChange={(e) => updateSetting('glow', Number(e.target.value))}
            className="ios-glass-slider"
          />
        </div>
      </div>
    </LiquidGlassSurface>
  );
}
