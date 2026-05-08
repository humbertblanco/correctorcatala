import { t, type MessageKey } from '../../lib/i18n';
import { getSettings, setSettings } from '../../lib/settings';
import type { Variant } from '../../lib/types';

function applyI18n(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as MessageKey | undefined;
    if (!key) continue;
    el.textContent = t(key);
  }
}

async function init(): Promise<void> {
  applyI18n();

  const enabledInput = document.getElementById('enabled') as HTMLInputElement;
  const variantSelect = document.getElementById('variant') as HTMLSelectElement;
  const disableDomainBtn = document.getElementById('disable-domain') as HTMLButtonElement;
  const openWebBtn = document.getElementById('open-web') as HTMLButtonElement;
  const openOptionsLink = document.getElementById('open-options') as HTMLAnchorElement;
  const donateLink = document.getElementById('donate') as HTMLAnchorElement;

  const settings = await getSettings();
  enabledInput.checked = settings.enabled;
  variantSelect.value = settings.variant;
  donateLink.href = t('donate_url');

  document.body.dataset.enabled = String(settings.enabled);

  enabledInput.addEventListener('change', async () => {
    await setSettings({ enabled: enabledInput.checked });
    document.body.dataset.enabled = String(enabledInput.checked);
  });

  variantSelect.addEventListener('change', async () => {
    await setSettings({ variant: variantSelect.value as Variant });
  });

  disableDomainBtn.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.url) return;
    let host: string;
    try {
      host = new URL(tab.url).hostname;
    } catch {
      return;
    }
    const fresh = await getSettings();
    if (!fresh.disabledDomains.includes(host)) {
      await setSettings({ disabledDomains: [...fresh.disabledDomains, host] });
    }
    disableDomainBtn.textContent = `✓ ${host}`;
    disableDomainBtn.disabled = true;
  });

  openWebBtn.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    let selected = '';
    if (tab?.id) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.getSelection()?.toString() ?? '',
        });
        selected = results?.[0]?.result ?? '';
      } catch {
        // executeScript can fail on chrome:// or restricted pages — open empty.
      }
    }
    const settings = await getSettings();
    const base = settings.serverUrl.replace(/\/+$/, '');
    const url = selected
      ? `${base}/?text=${encodeURIComponent(selected.slice(0, 4000))}`
      : `${base}/`;
    await chrome.tabs.create({ url });
    window.close();
  });

  openOptionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

void init();
