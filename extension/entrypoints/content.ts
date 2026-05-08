import { defineContentScript } from 'wxt/utils/define-content-script';
import { createAdapter, EDITOR_SELECTOR, type EditorAdapter } from '../lib/editors';
import { detectVariant } from '../lib/dialect-detect';
import { sendToBackground } from '../lib/messaging';
import { getSettings, isDomainDisabled, onSettingsChanged, resolveVariant, setSettings } from '../lib/settings';
import { SuggestionCard } from '../components/SuggestionCard';
import { Toast } from '../components/Toast';
import { t } from '../lib/i18n';
import type { LtMatch, Message, ResolvedVariant, Settings } from '../lib/types';

// Pages where the document body is rendered as canvas / a sandboxed iframe and
// no Chrome extension can intercept text. We surface a friendly toast on these
// instead of failing silently.
const UNSUPPORTED_HOSTS: RegExp[] = [
  /^docs\.google\.com$/,            // Google Docs / Sheets / Slides
  /^(www\.)?notion\.so$/,           // Notion main editor (canvas)
  /^[^.]+\.notion\.site$/,          // Notion published sites with editor
];

const DEBOUNCE_MS = 700;
const MIN_TEXT_LEN = 4;
const MAX_TEXT_LEN = 50_000;
// 5 s grace after blur before tearing down an adapter — long enough for the
// user to click a suggestion popup that briefly takes focus from the editor.
const FOCUS_GRACE_MS = 5_000;
// Throttling for the global removal-observer (we only use it for cleanup now).
const MUTATION_BATCH_MS = 250;
// Run the orphan sweep at most every Nth processed batch to keep the cost
// bounded. Picking off mounted-then-unmounted SPA nodes the removed-nodes
// branch may have missed.
const SWEEP_EVERY_N_BATCHES = 10;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  allFrames: false,
  async main(ctx) {
    const initialSettings = await getSettings();
    if (!initialSettings.enabled) return;
    if (isDomainDisabled(initialSettings, location.hostname)) return;

    const origin = location.origin;
    let currentSettings: Settings = initialSettings;
    let card: SuggestionCard | null = null;
    const adapters = new Map<Element, AdapterState>();
    const ignoredHere = new WeakMap<Element, Set<string>>();
    const detachTimers = new Map<Element, number>();
    const initialCheckTimers = new Map<Element, number>();
    let batchCount = 0;

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

      // Kick off a first check after a small settle delay. Track the timer so
      // detach() can cancel it if the element disappears in the meantime.
      const id = window.setTimeout(() => {
        initialCheckTimers.delete(el);
        if (adapters.has(el)) scheduleCheck(state, true);
      }, 200);
      initialCheckTimers.set(el, id);
    }

    function detach(el: Element): void {
      const initId = initialCheckTimers.get(el);
      if (initId) {
        window.clearTimeout(initId);
        initialCheckTimers.delete(el);
      }
      const detachId = detachTimers.get(el);
      if (detachId) {
        window.clearTimeout(detachId);
        detachTimers.delete(el);
      }
      const state = adapters.get(el);
      if (!state) return;
      if (state.timer) window.clearTimeout(state.timer);
      state.unsubChange();
      state.unsubClick();
      state.adapter.destroy();
      adapters.delete(el);
    }

    function teardownAll(): void {
      for (const id of detachTimers.values()) window.clearTimeout(id);
      detachTimers.clear();
      for (const id of initialCheckTimers.values()) window.clearTimeout(id);
      initialCheckTimers.clear();
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
      if (state.adapter.getText() !== text) return;
      if (resp.type === 'check:result') {
        const localIgnore = ignoredHere.get(state.adapter.element);
        const filtered = localIgnore
          ? resp.matches.filter(m => !localIgnore.has(`${m.rule.id}@${m.offset}`))
          : resp.matches;
        state.currentMatches = filtered;
        state.adapter.setMatches(filtered);
      }
    }

    function showCardForMatch(state: AdapterState, idx: number, rect: DOMRect): void {
      const match = state.currentMatches[idx];
      if (!match) return;
      ensureCard().show(match, rect, {
        onApply: (replacement) => {
          state.adapter.applyReplacement(match.offset, match.length, replacement);
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

    // ---- Lazy attachment via focus -----------------------------------------
    // Why: a previous version eagerly scanned the whole document and attached
    // an adapter (with its own MutationObserver per contenteditable) to every
    // editor in the page. On Instagram (100+ active comment composers, DM
    // inputs, etc.) the cumulative observer load froze the tab.
    //
    // Now we only attach when the user actually focuses an editor. We detach
    // 5 s after blur (grace lets users click the SuggestionCard without
    // dropping the binding).

    function maybeAttachOnFocus(target: EventTarget | null): void {
      if (!(target instanceof Element)) return;
      let candidate: Element | null = target;
      // Walk up to find the closest matching editor: contenteditable focus
      // events sometimes target inner elements.
      while (candidate && !candidate.matches(EDITOR_SELECTOR)) {
        candidate = candidate.parentElement;
      }
      if (!candidate) return;
      const pendingDetach = detachTimers.get(candidate);
      if (pendingDetach) {
        window.clearTimeout(pendingDetach);
        detachTimers.delete(candidate);
      }
      attach(candidate);
    }

    function scheduleDetachOnBlur(target: EventTarget | null): void {
      if (!(target instanceof Element)) return;
      let candidate: Element | null = target;
      while (candidate && !adapters.has(candidate)) {
        candidate = candidate.parentElement;
      }
      if (!candidate) return;
      const id = window.setTimeout(() => {
        detachTimers.delete(candidate!);
        // Don't detach if the user re-focused into the editor before grace ran.
        if (document.activeElement && candidate!.contains(document.activeElement)) return;
        detach(candidate!);
      }, FOCUS_GRACE_MS);
      detachTimers.set(candidate, id);
    }

    document.addEventListener('focusin', e => maybeAttachOnFocus(e.target), true);
    document.addEventListener('focusout', e => scheduleDetachOnBlur(e.target), true);

    // If the page already has an editor focused at script-load time
    // (e.g. extension reload while user was typing), pick it up now.
    if (document.activeElement) maybeAttachOnFocus(document.activeElement);

    // ---- Unsupported-page toast --------------------------------------------
    // Surface a one-time toast on hosts we know we can't help (Google Docs,
    // Notion). Skipped if the user has dismissed this host before.
    if (UNSUPPORTED_HOSTS.some(re => re.test(location.hostname))) {
      const host = location.hostname.toLowerCase();
      if (!currentSettings.dismissedToasts.includes(host)) {
        // Wait a few seconds in case the page does eventually expose a
        // [contenteditable] we can attach to (some Notion templates do).
        window.setTimeout(() => {
          if (adapters.size > 0) return; // we found something; never mind.
          const webBase = currentSettings.serverUrl.replace(/\/+$/, '');
          new Toast({
            title: t('toast_unsupported_title'),
            body: t('toast_unsupported_body'),
            primaryHref: `${webBase}/`,
            primaryLabel: t('toast_open_web'),
            onDismiss: () => {
              const fresh = new Set(currentSettings.dismissedToasts);
              fresh.add(host);
              void setSettings({ dismissedToasts: [...fresh] });
            },
          });
        }, 3_500);
      }
    }

    // ---- Cleanup observer (removed nodes only) -----------------------------
    // We still need to know when an attached editor's host element leaves the
    // DOM so we can release its adapter. We do NOT attach new adapters from
    // here — focus does that. Throttled to keep the cost bounded.

    let pending: MutationRecord[] = [];
    let scheduled = false;
    type IdleScheduler = (cb: () => void) => void;
    const schedule: IdleScheduler =
      typeof window.requestIdleCallback === 'function'
        ? (cb) => {
            window.requestIdleCallback(cb, { timeout: MUTATION_BATCH_MS * 2 });
          }
        : (cb) => {
            window.setTimeout(cb, MUTATION_BATCH_MS);
          };

    function isOurOwn(node: Node | null): boolean {
      let cur: Node | null = node;
      while (cur) {
        if (cur instanceof Element && cur.hasAttribute('data-cc')) return true;
        cur = cur.parentNode;
      }
      return false;
    }

    function processBatch(records: MutationRecord[]): void {
      batchCount++;
      const real = records.filter(m => !isOurOwn(m.target));

      for (const m of real) {
        for (const node of m.removedNodes) {
          if (!(node instanceof Element)) continue;
          if (adapters.has(node)) detach(node);
          if (adapters.size > 0) {
            for (const candidate of adapters.keys()) {
              if (node.contains(candidate)) detach(candidate);
            }
          }
        }
      }

      // Periodic orphan sweep: belt-and-braces in case removedNodes missed an
      // element (SPA tear-downs occasionally do that). Cheap because adapters
      // is normally tiny (1 element typed-in at a time).
      if (batchCount % SWEEP_EVERY_N_BATCHES === 0 && adapters.size > 0) {
        for (const el of adapters.keys()) {
          if (!document.contains(el)) detach(el);
        }
      }
    }

    const observer = new MutationObserver(muts => {
      pending.push(...muts);
      if (scheduled) return;
      scheduled = true;
      schedule(() => {
        scheduled = false;
        const batch = pending;
        pending = [];
        try {
          processBatch(batch);
        } catch {
          // Never let an exception break the observer chain.
        }
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    ctx.onInvalidated(() => {
      observer.disconnect();
      unsubSettings();
      teardownAll();
    });
  },
});
