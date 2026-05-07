import { defineBackground } from 'wxt/utils/define-background';
import { check, fetchLanguages, HttpError, NetworkError } from '../lib/api';
import { LruCache } from '../lib/cache';
import { onMessage } from '../lib/messaging';
import { getSettings, setSettings } from '../lib/settings';
import type { LtMatch, Message } from '../lib/types';

export default defineBackground({
  type: 'module',
  main() {
    const cache = new LruCache(50);

    onMessage(async (msg): Promise<Message | undefined> => {
      switch (msg.type) {
        case 'check':
          return await handleCheck(msg);

        case 'settings:get': {
          const settings = await getSettings();
          return { type: 'settings:get:result', settings };
        }

        case 'settings:set':
          await setSettings(msg.patch);
          return { type: 'settings:saved' };

        case 'dict:add': {
          const settings = await getSettings();
          const w = msg.word.trim();
          if (w && !settings.customDict.some(e => e.toLowerCase() === w.toLowerCase())) {
            await setSettings({ customDict: [...settings.customDict, w] });
          }
          return { type: 'dict:added' };
        }

        case 'test:server':
          return await handleTest(msg);

        default:
          return undefined;
      }
    });

    async function handleCheck(
      msg: Extract<Message, { type: 'check' }>,
    ): Promise<Message> {
      const settings = await getSettings();
      const variant = msg.variantHint ?? 'ca-ES';

      if (!settings.enabled) {
        return { type: 'check:result', matches: [], variant };
      }

      const cached = await cache.get(msg.text, variant);
      if (cached) {
        return {
          type: 'check:result',
          matches: filterByDict(cached, settings.customDict, msg.text),
          variant,
        };
      }

      try {
        const matches = await check({
          serverUrl: settings.serverUrl,
          text: msg.text,
          variant,
        });
        await cache.set(msg.text, variant, matches);
        return {
          type: 'check:result',
          matches: filterByDict(matches, settings.customDict, msg.text),
          variant,
        };
      } catch (err) {
        if (err instanceof HttpError) {
          return {
            type: 'check:error',
            reason: err.status === 429 ? 'rate-limit' : 'unknown',
            status: err.status,
          };
        }
        if (err instanceof NetworkError) {
          return { type: 'check:error', reason: 'network' };
        }
        return { type: 'check:error', reason: 'unknown' };
      }
    }

    async function handleTest(
      msg: Extract<Message, { type: 'test:server' }>,
    ): Promise<Message> {
      try {
        const langs = await fetchLanguages(msg.serverUrl);
        return { type: 'test:server:result', ok: true, languages: langs };
      } catch (err) {
        return { type: 'test:server:result', ok: false, error: (err as Error).message };
      }
    }

    function filterByDict(matches: LtMatch[], dict: string[], text: string): LtMatch[] {
      if (dict.length === 0) return matches;
      const lower = new Set(dict.map(w => w.toLowerCase()));
      return matches.filter(m => {
        const word = text.slice(m.offset, m.offset + m.length).toLowerCase();
        return !lower.has(word);
      });
    }
  },
});
