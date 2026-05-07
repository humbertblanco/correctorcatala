import { defineContentScript } from 'wxt/utils/define-content-script';
import { createAdapter, EDITOR_SELECTOR, type EditorAdapter } from '../lib/editors';
import { detectVariant } from '../lib/dialect-detect';
import { sendToBackground } from '../lib/messaging';
import { getSettings, isDomainDisabled, onSettingsChanged, resolveVariant } from '../lib/settings';
import { SuggestionCard } from '../components/SuggestionCard';
import type { LtMatch, Message, ResolvedVariant, Settings } from '../lib/types';

const DEBOUNCE_MS = 700;
const MIN_TEXT_LEN = 4;
const MAX_TEXT_LEN = 50_000;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  allFrames: false,
  async main(ctx) {
    const settings = await getSettings();
    if (!settings.enabled) return;
    if (isDomainDisabled(settings, location.hostname)) return;

    const origin = location.origin;
    let currentSettings: Settings = settings;
    let card: SuggestionCard | null = null;
    const adapters = new Map<Element, AdapterState>();
    const ignoredHere = new WeakMap<Element, Set<string>>(); // ruleId+offset

    interface AdapterState {
      adapter: EditorAdapter;
      lastCheckedText: string;
      timer: number | null;
      currentMatches: LtMatch[];
      variant: ResolvedVariant;
      unsubChange: () => void;
      unsubClick: () => void;
    }

    const unsubSettings = onSettingsChanged(s => {
      currentSettings = s;
      if (!s.enabled || isDomainDisabled(s, location.hostname)) {
        teardownAll();
      } else {
        // Re-check all adapters with new variant resolution.
        for (const state of adapters.values()) {
          scheduleCheck(state, true);
        }
      }
    });

    function ensureCard(): SuggestionCard {
      if (!card) card = new SuggestionCard();
      return card;
    }

    function attach(el: Element): void {
      if (adapters.has(el)) return;
      const adapter = createAdapter(el);
      if (!adapter) return;

      const state: AdapterState = {
        adapter,
        lastCheckedText: '',
        timer: null,
        currentMatches: [],
        variant: 'ca-ES',
        unsubChange: () => {},
        unsubClick: () => {},
      };
      adapters.set(el, state);

      state.unsubChange = adapter.onTextChange(() => scheduleCheck(state, false));
      state.unsubClick = adapter.onMatchClick((idx, rect) => showCardForMatch(state, idx, rect));

      // Initial check (after a small delay to let the page settle)
      window.setTimeout(() => scheduleCheck(state, true), 200);
    }

    function detach(el: Element): void {
      const state = adapters.get(el);
      if (!state) return;
      if (state.timer) window.clearTimeout(state.timer);
      state.unsubChange();
      state.unsubClick();
      state.adapter.destroy();
      adapters.delete(el);
    }

    function teardownAll(): void {
      for (const el of [...adapters.keys()]) detach(el);
      card?.destroy();
      card = null;
    }

    function scheduleCheck(state: AdapterState, immediate: boolean): void {
      if (state.timer != null) {
        window.clearTimeout(state.timer);
        state.timer = null;
      }
      const run = () => {
        state.timer = null;
        void runCheck(state);
      };
      if (immediate) run();
      else state.timer = window.setTimeout(run, DEBOUNCE_MS);
    }

    async function runCheck(state: AdapterState): Promise<void> {
      const text = state.adapter.getText();
      if (text.length < MIN_TEXT_LEN) {
        state.adapter.setMatches([]);
        state.currentMatches = [];
        return;
      }
      if (text.length > MAX_TEXT_LEN) return;
      if (text === state.lastCheckedText) return;
      state.lastCheckedText = text;

      const detected = detectVariant(text).variant;
      const variant = resolveVariant(currentSettings, origin, detected);
      state.variant = variant;

      let resp: Message | undefined;
      try {
        resp = await sendToBackground({
          type: 'check',
          text,
          variantHint: variant,
          origin,
        });
      } catch {
        return;
      }
      if (!resp) return;
      // Drop stale results: text may have changed since we sent.
      if (state.adapter.getText() !== text) return;
      if (resp.type === 'check:result') {
        const localIgnore = ignoredHere.get(state.adapter.element);
        const filtered = localIgnore
          ? resp.matches.filter(m => !localIgnore.has(`${m.rule.id}@${m.offset}`))
          : resp.matches;
        state.currentMatches = filtered;
        state.adapter.setMatches(filtered);
      } else if (resp.type === 'check:error') {
        // Silent failure for v1 (no toast spam). Could surface in popup.
      }
    }

    function showCardForMatch(state: AdapterState, idx: number, rect: DOMRect): void {
      const match = state.currentMatches[idx];
      if (!match) return;
      ensureCard().show(match, rect, {
        onApply: (replacement) => {
          state.adapter.applyReplacement(match.offset, match.length, replacement);
          // Force re-check on next tick (text changed)
          state.lastCheckedText = '';
          scheduleCheck(state, false);
        },
        onAddToDictionary: () => {
          const word = state.adapter.getText().slice(match.offset, match.offset + match.length);
          void sendToBackground({ type: 'dict:add', word });
          state.lastCheckedText = '';
          scheduleCheck(state, true);
        },
        onIgnoreHere: () => {
          let set = ignoredHere.get(state.adapter.element);
          if (!set) {
            set = new Set();
            ignoredHere.set(state.adapter.element, set);
          }
          set.add(`${match.rule.id}@${match.offset}`);
          state.currentMatches = state.currentMatches.filter(m => m !== match);
          state.adapter.setMatches(state.currentMatches);
        },
        onDismiss: () => {},
      });
    }

    // Initial scan + observer for dynamically added editors
    function scan(root: ParentNode): void {
      for (const el of root.querySelectorAll(EDITOR_SELECTOR)) attach(el);
    }
    scan(document);

    const observer = new MutationObserver(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node instanceof Element) {
            if (node.matches(EDITOR_SELECTOR)) attach(node);
            scan(node);
          }
        }
        for (const node of m.removedNodes) {
          if (node instanceof Element) {
            if (adapters.has(node)) detach(node);
            for (const inner of node.querySelectorAll(EDITOR_SELECTOR)) {
              if (adapters.has(inner)) detach(inner);
            }
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    ctx.onInvalidated(() => {
      observer.disconnect();
      unsubSettings();
      teardownAll();
    });
  },
});
