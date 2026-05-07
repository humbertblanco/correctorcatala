import type { ResolvedVariant, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  variant: 'auto',
  serverUrl: 'https://corrector.damosenelblanco.com',
  customDict: [],
  disabledDomains: [],
  perOriginVariant: {},
};

const KEYS: (keyof Settings)[] = [
  'enabled',
  'variant',
  'serverUrl',
  'customDict',
  'disabledDomains',
  'perOriginVariant',
];

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.sync.get(KEYS);
  return sanitize({ ...DEFAULT_SETTINGS, ...raw });
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(patch);
}

export function onSettingsChanged(handler: (s: Settings) => void): () => void {
  const listener = (
    changes: { [k: string]: chrome.storage.StorageChange },
    area: string,
  ): void => {
    if (area !== 'sync') return;
    if (Object.keys(changes).some(k => (KEYS as string[]).includes(k))) {
      void getSettings().then(handler);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

function sanitize(s: Settings): Settings {
  if (typeof s.serverUrl !== 'string' || !s.serverUrl) {
    s.serverUrl = DEFAULT_SETTINGS.serverUrl;
  }
  s.serverUrl = s.serverUrl.trim();
  if (!Array.isArray(s.customDict)) s.customDict = [];
  s.customDict = s.customDict.map(w => w.trim()).filter(Boolean);
  if (!Array.isArray(s.disabledDomains)) s.disabledDomains = [];
  s.disabledDomains = s.disabledDomains
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
  if (typeof s.perOriginVariant !== 'object' || s.perOriginVariant === null) {
    s.perOriginVariant = {};
  }
  return s;
}

export function resolveVariant(
  s: Settings,
  origin: string,
  autoDetected: ResolvedVariant,
): ResolvedVariant {
  const override = s.perOriginVariant[origin];
  if (override) return override;
  if (s.variant === 'auto') return autoDetected;
  return s.variant;
}

export function isDomainDisabled(s: Settings, hostname: string): boolean {
  const host = hostname.toLowerCase();
  return s.disabledDomains.some(d => host === d || host.endsWith('.' + d));
}

export function isInCustomDict(s: Settings, word: string): boolean {
  const w = word.toLowerCase();
  return s.customDict.some(entry => entry.toLowerCase() === w);
}
