export type TabId = 'home' | 'community' | 'settings';

export interface NavTabItem {
  id: TabId;
  label: string;
}

export const NAV_TABS: readonly NavTabItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'community', label: 'Community' },
  { id: 'settings', label: 'Settings' },
] as const;
