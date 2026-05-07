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
): number | null {
  const { nodes } = flattenText(el);
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

  constructor(el: HTMLElement) {
    this.element = el;
    ContentEditableAdapter.injectStylesOnce();

    this.inputListener = () => {
      this.render();
      for (const cb of this.textChangeCallbacks) cb();
    };
    el.addEventListener('input', this.inputListener);

    this.observer = new MutationObserver(() => {
      // External DOM mutation (paste, framework rerender) — re-render highlights against new offsets.
      this.render();
      for (const cb of this.textChangeCallbacks) cb();
    });
    this.observer.observe(el, { childList: true, characterData: true, subtree: true });

    this.clickListener = (e) => {
      const offset = pointToOffset(el, e.clientX, e.clientY);
      if (offset == null) return;
      // Find smallest match containing offset
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
      const { nodes } = flattenText(el);
      const range = offsetToRange(m.offset, m.length, nodes);
      if (!range) return;
      const rect = range.getBoundingClientRect();
      for (const cb of this.matchClickCallbacks) cb(bestIdx, rect);
    };
    el.addEventListener('click', this.clickListener);
  }

  getText(): string {
    return flattenText(this.element).text;
  }

  setMatches(matches: LtMatch[]): void {
    this.matches = matches;
    this.render();
  }

  applyReplacement(offset: number, length: number, value: string): void {
    const { nodes } = flattenText(this.element);
    const range = offsetToRange(offset, length, nodes);
    if (!range) return;
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
    this.element.removeEventListener('input', this.inputListener);
    this.element.removeEventListener('click', this.clickListener);
    this.observer.disconnect();
    this.clearHighlight();
  }

  private render(): void {
    if (!ContentEditableAdapter.highlightSupported) return;
    if (this.matches.length === 0) {
      this.clearHighlight();
      return;
    }
    const { nodes } = flattenText(this.element);
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
