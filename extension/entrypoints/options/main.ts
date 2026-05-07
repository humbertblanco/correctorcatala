import { t, type MessageKey } from '../../lib/i18n';
import { sendToBackground } from '../../lib/messaging';
import { getSettings, setSettings } from '../../lib/settings';
import type { Message } from '../../lib/types';

function applyI18n(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as MessageKey | undefined;
    if (!key) continue;
    el.textContent = t(key);
  }
}

async function init(): Promise<void> {
  applyI18n();

  const serverInput = document.getElementById('server-url') as HTMLInputElement;
  const dictArea = document.getElementById('dict') as HTMLTextAreaElement;
  const domainsArea = document.getElementById('domains') as HTMLTextAreaElement;
  const testBtn = document.getElementById('test-server') as HTMLButtonElement;
  const testResult = document.getElementById('test-result') as HTMLSpanElement;
  const saveBtn = document.getElementById('save') as HTMLButtonElement;
  const savedFlash = document.getElementById('saved-flash') as HTMLSpanElement;

  const settings = await getSettings();
  serverInput.value = settings.serverUrl;
  dictArea.value = settings.customDict.join('\n');
  domainsArea.value = settings.disabledDomains.join('\n');

  testBtn.addEventListener('click', async () => {
    testResult.textContent = '…';
    testResult.dataset.kind = '';
    const url = serverInput.value.trim();
    if (!url) {
      testResult.textContent = '';
      return;
    }
    let resp: Message | undefined;
    try {
      resp = await sendToBackground({ type: 'test:server', serverUrl: url });
    } catch (err) {
      testResult.textContent = t('options_server_fail', (err as Error).message);
      testResult.dataset.kind = 'fail';
      return;
    }
    if (resp?.type === 'test:server:result' && resp.ok) {
      const catalans = (resp.languages ?? []).filter(c => c.startsWith('ca-ES'));
      testResult.textContent = t('options_server_ok', catalans.join(', '));
      testResult.dataset.kind = 'ok';
    } else if (resp?.type === 'test:server:result') {
      testResult.textContent = t('options_server_fail', resp.error ?? '');
      testResult.dataset.kind = 'fail';
    } else {
      testResult.textContent = t('options_server_fail', 'no response');
      testResult.dataset.kind = 'fail';
    }
  });

  saveBtn.addEventListener('click', async () => {
    const url = serverInput.value.trim();
    const dict = dictArea.value.split('\n').map(l => l.trim()).filter(Boolean);
    const domains = domainsArea.value
      .split('\n')
      .map(l => l.trim().toLowerCase())
      .filter(Boolean);

    await setSettings({
      serverUrl: url,
      customDict: dict,
      disabledDomains: domains,
    });

    savedFlash.hidden = false;
    setTimeout(() => {
      savedFlash.hidden = true;
    }, 1500);
  });
}

void init();
