import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type GlassPresetId = 'clear' | 'balanced' | 'frosted' | 'custom';

export interface GlassSettings {
  preset: GlassPresetId;
  /** 0.15 - 0.75: Smoked dark backing opacity for text readability */
  tint: number;
  /** 0 - 100: Backdrop frost/blur intensity */
  blur: number;
  /** 0 - 100: Optical refraction displacement & chromatic edge dispersion */
  refraction: number;
  /** 0 - 100: Elastic liquid stretchability across all glass elements */
  stretch: number;
  /** 0 - 100: iOS specular pointer glow & luminous bevel rim intensity */
  glow: number;
}

export const GLASS_PRESETS: Record<
  Exclude<GlassPresetId, 'custom'>,
  Omit<GlassSettings, 'preset'>
> = {
  clear: {
    tint: 0.28,
    blur: 36,
    refraction: 76,
    stretch: 72,
    glow: 80,
  },
  balanced: {
    tint: 0.48,
    blur: 56,
    refraction: 62,
    stretch: 68,
    glow: 74,
  },
  frosted: {
    tint: 0.66,
    blur: 84,
    refraction: 38,
    stretch: 52,
    glow: 62,
  },
};

export const DEFAULT_GLASS_SETTINGS: GlassSettings = {
  preset: 'balanced',
  ...GLASS_PRESETS.balanced,
};

const STORAGE_KEY = 'tamagotchi:liquid-glass-settings:v1';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadSettings(): GlassSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GLASS_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GlassSettings>;
    const preset: GlassPresetId =
      parsed.preset === 'clear' ||
      parsed.preset === 'balanced' ||
      parsed.preset === 'frosted' ||
      parsed.preset === 'custom'
        ? parsed.preset
        : 'balanced';

    return {
      preset,
      tint:
        typeof parsed.tint === 'number'
          ? clamp(parsed.tint, 0.15, 0.78)
          : DEFAULT_GLASS_SETTINGS.tint,
      blur:
        typeof parsed.blur === 'number'
          ? clamp(parsed.blur, 0, 100)
          : DEFAULT_GLASS_SETTINGS.blur,
      refraction:
        typeof parsed.refraction === 'number'
          ? clamp(parsed.refraction, 0, 100)
          : DEFAULT_GLASS_SETTINGS.refraction,
      stretch:
        typeof parsed.stretch === 'number'
          ? clamp(parsed.stretch, 0, 100)
          : DEFAULT_GLASS_SETTINGS.stretch,
      glow:
        typeof parsed.glow === 'number'
          ? clamp(parsed.glow, 0, 100)
          : DEFAULT_GLASS_SETTINGS.glow,
    };
  } catch {
    return DEFAULT_GLASS_SETTINGS;
  }
}

interface LiquidGlassContextValue {
  settings: GlassSettings;
  updateSetting: <K extends Exclude<keyof GlassSettings, 'preset'>>(
    key: K,
    value: GlassSettings[K],
  ) => void;
  applyPreset: (preset: Exclude<GlassPresetId, 'custom'>) => void;
  resetSettings: () => void;
}

const LiquidGlassContext = createContext<LiquidGlassContextValue | null>(null);

export function LiquidGlassProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<GlassSettings>(loadSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage failures in private/restricted browsers
    }
  }, [settings]);

  const updateSetting = useCallback(
    <K extends Exclude<keyof GlassSettings, 'preset'>>(
      key: K,
      value: GlassSettings[K],
    ) => {
      setSettings((prev) => ({
        ...prev,
        preset: 'custom',
        [key]: value,
      }));
    },
    [],
  );

  const applyPreset = useCallback((preset: Exclude<GlassPresetId, 'custom'>) => {
    setSettings({
      preset,
      ...GLASS_PRESETS[preset],
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_GLASS_SETTINGS);
  }, []);

  const value = useMemo(
    () => ({
      settings,
      updateSetting,
      applyPreset,
      resetSettings,
    }),
    [settings, updateSetting, applyPreset, resetSettings],
  );

  return (
    <LiquidGlassContext.Provider value={value}>
      {children}
    </LiquidGlassContext.Provider>
  );
}

export function useLiquidGlass(): LiquidGlassContextValue {
  const ctx = useContext(LiquidGlassContext);
  if (!ctx) {
    return {
      settings: DEFAULT_GLASS_SETTINGS,
      updateSetting: () => {},
      applyPreset: () => {},
      resetSettings: () => {},
    };
  }
  return ctx;
}
