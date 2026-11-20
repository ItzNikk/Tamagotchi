import type {
  DevicePlatform,
  ReleaseAsset,
  ReleaseInfo,
  UpdateStatus,
} from '../hooks/useAppUpdater';
import type { TabId } from '../types/navigation';
import { AppUpdaterPanel } from './AppUpdaterPanel';
import { GlassSettingsPanel } from './GlassSettingsPanel';
import { LiquidGlassSurface } from './LiquidGlassSurface';

export interface UpdaterViewProps {
  currentVersion: string;
  platform: DevicePlatform;
  recommendedAsset: ReleaseAsset | null;
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

interface TabViewsProps {
  activeTab: TabId;
  updater: UpdaterViewProps;
}

const HOME_PILLARS = [
  {
    title: 'Companion',
    caption: 'Sanctuary space',
    description:
      'A calm home for your study companion that evolves alongside steady daily focus.',
  },
  {
    title: 'Study Studio',
    caption: 'Notes & review',
    description:
      'Dedicated workspace for deep reading, active recall, and distraction-free sessions.',
  },
  {
    title: 'Daily Rhythm',
    caption: 'Progress & balance',
    description:
      'Gentle pacing and milestones designed to stay consistent across every screen.',
  },
] as const;

const COMMUNITY_SPACES = [
  {
    title: 'Quiet Study Halls',
    caption: 'Shared presence',
    description:
      'Ambient focus rooms where learners and professionals work side by side at their own pace.',
  },
  {
    title: 'Shared Library',
    caption: 'Open resources',
    description:
      'Curated study guides, structured templates, and community decks built for long-term mastery.',
  },
] as const;

const SETTINGS_ROWS = [
  {
    label: 'Navigation Gesture',
    detail: 'Tap or drag the Liquid Glass dock pill to switch tabs',
  },
  {
    label: 'Multi-Platform Layout',
    detail: 'Responsive across Mobile, Tablet, and Desktop',
  },
  {
    label: 'Focus & Reminders',
    detail: 'Quiet hours and gentle study check-ins',
  },
] as const;

export function TabViews({ activeTab, updater }: TabViewsProps) {
  if (activeTab === 'home') {
    return (
      <section
        id="panel-home"
        role="tabpanel"
        aria-labelledby="tab-home"
        className="w-full space-y-5 sm:space-y-6"
      >
        <LiquidGlassSurface
          cornerRadius={32}
          displacementScale={44}
          blurAmount={0.14}
          contentClassName="px-6 py-7 sm:px-9 sm:py-10"
        >
          <p className="text-xs font-medium text-white/88 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
            Home <span aria-hidden="true">·</span> Sanctuary
          </p>
          <h1 className="mt-2.5 max-w-2xl text-balance font-display text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
            Welcome to Tamagotchi
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/94 sm:text-base drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)]">
            A serene, multi-platform study and professional companion workspace
            shaped with optical Liquid Glass surfaces.
          </p>
        </LiquidGlassSurface>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {HOME_PILLARS.map((pillar) => (
            <LiquidGlassSurface
              key={pillar.title}
              cornerRadius={26}
              displacementScale={38}
              blurAmount={0.15}
              className="h-full"
              contentClassName="flex h-full flex-col justify-between p-5 sm:p-6"
            >
              <div>
                <p className="text-xs font-medium text-white/85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
                  {pillar.caption}
                </p>
                <h2 className="mt-1.5 font-display text-lg font-semibold tracking-[-0.015em] text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]">
                  {pillar.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/92 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
                  {pillar.description}
                </p>
              </div>
            </LiquidGlassSurface>
          ))}
        </div>
      </section>
    );
  }

  if (activeTab === 'community') {
    return (
      <section
        id="panel-community"
        role="tabpanel"
        aria-labelledby="tab-community"
        className="w-full space-y-5 sm:space-y-6"
      >
        <LiquidGlassSurface
          cornerRadius={32}
          displacementScale={44}
          blurAmount={0.14}
          contentClassName="px-6 py-7 sm:px-9 sm:py-10"
        >
          <p className="text-xs font-medium text-white/88 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
            Community <span aria-hidden="true">·</span> Shared Spaces
          </p>
          <h1 className="mt-2.5 max-w-2xl text-balance font-display text-[clamp(2rem,4.5vw,3.1rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
            Study together in calm company
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/94 sm:text-base drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)]">
            Sample layout for quiet focus halls, peer study groups, and shared
            reference libraries.
          </p>
        </LiquidGlassSurface>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5">
          {COMMUNITY_SPACES.map((space) => (
            <LiquidGlassSurface
              key={space.title}
              cornerRadius={26}
              displacementScale={38}
              blurAmount={0.15}
              className="h-full"
              contentClassName="flex h-full flex-col justify-between p-5 sm:p-7"
            >
              <div>
                <p className="text-xs font-medium text-white/85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
                  {space.caption}
                </p>
                <h2 className="mt-1.5 font-display text-xl font-semibold tracking-[-0.015em] text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]">
                  {space.title}
                </h2>
                <p className="mt-2.5 text-sm leading-relaxed text-white/92 sm:text-[15px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
                  {space.description}
                </p>
              </div>
            </LiquidGlassSurface>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      id="panel-settings"
      role="tabpanel"
      aria-labelledby="tab-settings"
      className="w-full space-y-5 sm:space-y-6"
    >
      <LiquidGlassSurface
        cornerRadius={32}
        displacementScale={44}
        blurAmount={0.14}
        contentClassName="px-6 py-7 sm:px-9 sm:py-10"
      >
        <p className="text-xs font-medium text-white/88 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
          Settings <span aria-hidden="true">·</span> Preferences &amp; Updates
        </p>
        <h1 className="mt-2.5 max-w-2xl text-balance font-display text-[clamp(2rem,4.5vw,3.1rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
          Workspace settings
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/94 sm:text-base drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)]">
          Customize Liquid Glass optics, manage in-app updates, and download
          multi-platform releases.
        </p>
      </LiquidGlassSurface>

      <GlassSettingsPanel />

      <AppUpdaterPanel {...updater} />

      <LiquidGlassSurface
        cornerRadius={28}
        displacementScale={38}
        blurAmount={0.15}
        contentClassName="divide-y divide-white/15 px-5 sm:px-7"
      >
        {SETTINGS_ROWS.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-5"
          >
            <span className="font-display text-[15px] font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
              {row.label}
            </span>
            <span className="text-sm text-white/88 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
              {row.detail}
            </span>
          </div>
        ))}
      </LiquidGlassSurface>
    </section>
  );
}
