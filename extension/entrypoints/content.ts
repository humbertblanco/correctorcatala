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
// Mutation throttling: process at most once per ~150 ms in idle time. SPAs can
// fire thousands of mutations per second; running attach()/scan() on each one
// is what triggers Chrome's "this extension is slowing your browser" warning.
const MUTATION_BATCH_MS = 150;
// If a single batch carries more mutations than this, the page is doing heavy
// DOM churn and our incremental scan would dominate the main thread. Skip the
// addedNodes pass for that batch (we'll still pick up new editors on the next
// quieter batch). 500 ≈ Twitter/Drive in worst case.
const MUTATION_OVERLOAD = 500;

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

    function scan(root: ParentNode): void {
      for (const el of root.querySelectorAll(EDITOR_SELECTOR)) attach(el);
    }
    scan(document);

    // ---- Throttled DOM-mutation scanner -------------------------------------
    // Why throttle: SPAs (Drive, Twitter, Gmail, Reddit) emit thousands of
    // mutations per second. Synchronously scanning subtrees on each one was the
    // root cause of Chrome's "this extension is slowing your browser" warning.
    //
    // Strategy:
    //  1. Buffer mutations.
    //  2. Coalesce processing into one batch every MUTATION_BATCH_MS in idle
    //     time (requestIdleCallback when available; setTimeout fallback).
    //  3. Skip mutations whose subtree is entirely our own injected DOM
    //     (mirror, suggestion popup, wrapper). They produce a feedback loop
    //     otherwise.
    //  4. If a batch is huge (>MUTATION_OVERLOAD), skip the addedNodes scan to
    //     avoid blocking the main thread; new editors will be picked up on the
    //     next calmer batch.
    //  5. Always honor removals (cheap and necessary for cleanup).

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
      // Filter out our own DOM noise (mirror updates, popup show/hide).
      const real = records.filter(m => !isOurOwn(m.target));
      if (real.length === 0) return;

      const overloaded = real.length > MUTATION_OVERLOAD;
      let totalAdded = 0;

      for (const m of real) {
        // Removals first (always run; cheap and prevents leaks).
        for (const node of m.removedNodes) {
          if (!(node instanceof Element)) continue;
          if (adapters.has(node)) detach(node);
          // Also detach any nested editors that left the DOM with this node.
          if (adapters.size > 0) {
            for (const candidate of adapters.keys()) {
              if (node.contains(candidate)) detach(candidate);
            }
          }
        }

        if (overloaded) continue;

        for (const node of m.addedNodes) {
          totalAdded++;
          if (totalAdded > MUTATION_OVERLOAD) break;
          if (!(node instanceof Element)) continue;
          if (isOurOwn(node)) continue;
          if (node.matches(EDITOR_SELECTOR)) attach(node);
          // Only descend into the new subtree if it could plausibly contain
          // editors. Most added nodes are plain text or attribute updates.
          if (node.firstElementChild) scan(node);
        }
      }
    }

    const observer = new MutationObserver(muts => {
      // Append to pending buffer; coalesce into one idle pass.
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
