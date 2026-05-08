import type { LtMatch } from '../types';
import type { AdapterFactory, EditorAdapter } from './types';

/**
 * Contenteditable adapter using the CSS Custom Highlight API.
 * - No DOM mutation of user content (huge advantage over span-wrapping).
 * - Click hit-testing via document.caretRangeFromPoint (or caretPositionFromPoint).
 *
 * Available in Chromium ≥ 105 (universal in 2026 for our target audience).
 * If unavailable we silently skip — Google Docs canvas is unsupported anyway.
 */

const HIGHLIGHT_NAME = 'cc-error';

function flattenText(root: Element): { text: string; nodes: { node: Text; start: number; end: number }[] } {
  let acc = '';
  const nodes: { node: Text; start: number; end: number }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip text inside elements that won't be edited (UI chrome injected by sites)
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest('[aria-hidden="true"]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Text | null = walker.nextNode() as Text | null;
  while (n) {
    const txt = n.data;
    nodes.push({ node: n, start: acc.length, end: acc.length + txt.length });
    acc += txt;
    n = walker.nextNode() as Text | null;
  }
  return { text: acc, nodes };
}

function offsetToRange(
  offset: number,
  length: number,
  nodes: { node: Text; start: number; end: number }[],
): Range | null {
  const startNode = nodes.find(n => offset >= n.start && offset < n.end);
  const endNode = nodes.find(n => offset + length > n.start && offset + length <= n.end);
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode.node, offset - startNode.start);
  range.setEnd(endNode.node, offset + length - endNode.start);
  return range;
}

function pointToOffset(
  el: Element,
  x: number,
  y: number,
  cachedNodes?: { node: Text; start: number; end: number }[],
): number | null {
  const nodes = cachedNodes ?? flattenText(el).nodes;
  // Try caretPositionFromPoint (newer) then caretRangeFromPoint (Chromium legacy).
  type DocWithCaretPos = Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const docWith = document as DocWithCaretPos;
  let node: Node | null = null;
  let offsetInNode = 0;
  if (typeof docWith.caretPositionFromPoint === 'function') {
    const pos = docWith.caretPositionFromPoint(x, y);
    if (pos) {
      node = pos.offsetNode;
      offsetInNode = pos.offset;
    }
  } else if (typeof document.caretRangeFromPoint === 'function') {
    const range = document.caretRangeFromPoint(x, y);
    if (range) {
      node = range.startContainer;
      offsetInNode = range.startOffset;
    }
  }
  if (!node) return null;
  const found = nodes.find(n => n.node === node);
  if (!found) return null;
  return found.start + offsetInNode;
}

// Wait this many ms after the last mutation before re-rendering highlights.
// Editing in React/Slate/ProseMirror typically fires bursts of mutations per
// keystroke; without coalescing we'd run flattenText() (a TreeWalker pass) on
// every one of them.
const RENDER_DEBOUNCE_MS = 80;

class ContentEditableAdapter implements EditorAdapter {
  readonly element: HTMLElement;
  private matches: LtMatch[] = [];
  private observer: MutationObserver;
  private clickListener: (e: MouseEvent) => void;
  private inputListener: () => void;
  private textChangeCallbacks = new Set<() => void>();
  private matchClickCallbacks = new Set<(idx: number, rect: DOMRect) => void>();
  private destroyed = false;
  private highlight: Highlight | null = null;
  private renderTimer: number | null = null;
  private changeTimer: number | null = null;
  // Cached flatten of the editor's text. Avoids re-walking the DOM on each
  // getText() / click / replace within a single debounce window. Cleared by
  // scheduleRender() (i.e., whenever the DOM might have changed).
  private flatCache: { text: string; nodes: { node: Text; start: number; end: number }[] } | null = null;

  constructor(el: HTMLElement) {
    this.element = el;
    ContentEditableAdapter.injectStylesOnce();

    this.inputListener = () => {
      this.scheduleRender();
      this.scheduleChangeFanout();
    };
    el.addEventListener('input', this.inputListener);

    this.observer = new MutationObserver((records) => {
      // Skip mutations that are entirely caused by us (e.g., applyReplacement
      // dispatching events in same task). Without this we get a feedback loop.
      const external = records.some((r) => {
        const t = r.target;
        if (!(t instanceof Element)) return true;
        return !t.closest('[data-cc]');
      });
      if (!external) return;
      this.scheduleRender();
      this.scheduleChangeFanout();
    });
    this.observer.observe(el, { childList: true, characterData: true, subtree: true });

    this.clickListener = (e) => {
      const flat = this.getFlat();
      const offset = pointToOffset(el, e.clientX, e.clientY, flat.nodes);
      if (offset == null) return;
      let bestIdx = -1;
      let bestLen = Number.POSITIVE_INFINITY;
      this.matches.forEach((m, i) => {
        if (offset >= m.offset && offset < m.offset + m.length) {
          if (m.length < bestLen) {
            bestLen = m.length;
            bestIdx = i;
          }
        }
      });
      if (bestIdx === -1) return;
      const m = this.matches[bestIdx]!;
      const range = offsetToRange(m.offset, m.length, flat.nodes);
      if (!range) return;
      const rect = range.getBoundingClientRect();
      for (const cb of this.matchClickCallbacks) cb(bestIdx, rect);
    };
    el.addEventListener('click', this.clickListener);
  }

  private getFlat(): { text: string; nodes: { node: Text; start: number; end: number }[] } {
    if (this.flatCache) return this.flatCache;
    this.flatCache = flattenText(this.element);
    return this.flatCache;
  }

  getText(): string {
    return this.getFlat().text;
  }

  setMatches(matches: LtMatch[]): void {
    this.matches = matches;
    this.render();
  }

  applyReplacement(offset: number, length: number, value: string): void {
    const flat = this.getFlat();
    const range = offsetToRange(offset, length, flat.nodes);
    if (!range) return;
    // Mutating the DOM invalidates the cache.
    this.flatCache = null;
    range.deleteContents();
    range.insertNode(document.createTextNode(value));
    // Move caret to end of insertion
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const after = document.createRange();
      const last = range.endContainer;
      after.setStart(last, range.endOffset);
      after.collapse(true);
      sel.addRange(after);
    }
    // Fire input so frameworks re-sync
    this.element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: value }));
  }

  onTextChange(cb: () => void): () => void {
    this.textChangeCallbacks.add(cb);
    return () => this.textChangeCallbacks.delete(cb);
  }

  onMatchClick(cb: (idx: number, rect: DOMRect) => void): () => void {
    this.matchClickCallbacks.add(cb);
    return () => this.matchClickCallbacks.delete(cb);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
    if (this.changeTimer) window.clearTimeout(this.changeTimer);
    this.element.removeEventListener('input', this.inputListener);
    this.element.removeEventListener('click', this.clickListener);
    this.observer.disconnect();
    this.clearHighlight();
  }

  private scheduleRender(): void {
    // The DOM may have changed; invalidate cache eagerly so getText() and
    // click hit-testing don't return stale offsets between scheduleRender()
    // and the actual render().
    this.flatCache = null;
    if (this.renderTimer != null) return;
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      if (!this.destroyed) this.render();
    }, RENDER_DEBOUNCE_MS);
  }

  private scheduleChangeFanout(): void {
    if (this.changeTimer != null) return;
    this.changeTimer = window.setTimeout(() => {
      this.changeTimer = null;
      if (this.destroyed) return;
      for (const cb of this.textChangeCallbacks) cb();
    }, RENDER_DEBOUNCE_MS);
  }

  private render(): void {
    if (!ContentEditableAdapter.highlightSupported) return;
    if (this.matches.length === 0) {
      this.clearHighlight();
      return;
    }
    const { nodes } = this.getFlat();
    const ranges: Range[] = [];
    for (const m of this.matches) {
      const r = offsetToRange(m.offset, m.length, nodes);
      if (r) ranges.push(r);
    }
    if (this.highlight) {
      this.highlight.clear();
      for (const r of ranges) this.highlight.add(r);
    } else {
      this.highlight = new Highlight(...ranges);
      CSS.highlights.set(HIGHLIGHT_NAME, this.highlight);
    }
  }

  private clearHighlight(): void {
    if (this.highlight) {
      this.highlight.clear();
    }
  }

  static get highlightSupported(): boolean {
    return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
  }

  private static stylesInjected = false;

  private static injectStylesOnce(): void {
    if (ContentEditableAdapter.stylesInjected) return;
    ContentEditableAdapter.stylesInjected = true;
    const style = document.createElement('style');
    style.dataset.cc = 'highlight';
    style.textContent = `::highlight(${HIGHLIGHT_NAME}){text-decoration: underline wavy #c8102e; text-decoration-skip-ink: none; text-underline-offset: 2px;}`;
    document.head.appendChild(style);
  }
}

export const contentEditableAdapterFactory: AdapterFactory = (el) => {
  if (!(el instanceof HTMLElement)) return null;
  // Honor explicit contenteditable; skip plaintext-only is fine but we still handle it.
  const ce = el.getAttribute('contenteditable');
  if (ce === null) return null;
  if (ce === 'false') return null;
  // Skip elements that are themselves descendants of another contenteditable (avoid nested adapters).
  const ancestor = el.parentElement?.closest('[contenteditable=""], [contenteditable=true], [contenteditable=plaintext-only]');
  if (ancestor) return null;
  if (!ContentEditableAdapter.highlightSupported) return null;
  return new ContentEditableAdapter(el);
};
