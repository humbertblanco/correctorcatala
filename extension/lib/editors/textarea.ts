import type { LtMatch } from '../types';
import type { AdapterFactory, EditorAdapter } from './types';

const MIRROR_CLASS = 'cc-mirror';
const MARK_CLASS = 'cc-mark';

const MIRROR_STYLE_PROPS = [
  'box-sizing', 'width', 'height', 'overflow-x', 'overflow-y', 'border-top-width',
  'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'font-stretch', 'font-size-adjust', 'line-height', 'letter-spacing', 'word-spacing',
  'tab-size', 'text-transform', 'text-indent', 'text-align',
  'white-space', 'word-wrap', 'overflow-wrap', 'word-break',
  'direction', 'writing-mode',
] as const;

class TextareaAdapter implements EditorAdapter {
  readonly element: HTMLTextAreaElement | HTMLInputElement;
  private mirror: HTMLDivElement;
  private matches: LtMatch[] = [];
  private inputListener: () => void;
  private internalScrollListener: () => void;
  private windowScrollListener: () => void;
  private repositionRaf: number | null = null;
  private resizeObserver: ResizeObserver;
  private textChangeCallbacks = new Set<() => void>();
  private matchClickCallbacks = new Set<(idx: number, rect: DOMRect) => void>();
  private destroyed = false;
  private renderTimer: number | null = null;
  private static readonly RENDER_DEBOUNCE_MS = 80;

  constructor(el: HTMLTextAreaElement | HTMLInputElement) {
    this.element = el;

    // IMPORTANT: do NOT wrap the user's element. Wrapping it (the original
    // approach) caused two production bugs on Google search and similar sites:
    //
    //   1. With lazy-attach, attach() runs *during* focusin. Wrapping moves the
    //      element via wrapper.appendChild(el) — which detaches it from its
    //      current parent and re-attaches under the wrapper. That detach
    //      blurs the element mid-focus, so the user's first keystroke goes
    //      nowhere.
    //   2. Inserting a <div> between a flex/grid container and the input
    //      breaks the site's layout (e.g. the search bar disappears or
    //      collapses to width 0).
    //
    // Solution: the mirror lives at document.body level with position: fixed,
    // and we re-align it to the textarea's bounding rect on scroll/resize.
    // The user's textarea/input stays exactly where the site put it.

    this.mirror = document.createElement('div');
    this.mirror.className = MIRROR_CLASS;
    this.mirror.setAttribute('aria-hidden', 'true');
    this.mirror.setAttribute('data-cc', 'mirror');
    Object.assign(this.mirror.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      color: 'transparent',
      background: 'transparent',
      // Below the absolute max so site dialogs at 2147483647 still win.
      zIndex: '2147483646',
      margin: '0',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.mirror);

    this.syncStylesAndPosition();
    this.render();

    this.inputListener = () => {
      this.scheduleRender();
      for (const cb of this.textChangeCallbacks) cb();
    };
    el.addEventListener('input', this.inputListener);
    el.addEventListener('change', this.inputListener);

    // textarea's own scroll: re-sync mirror's internal scroll (rAF coalesced)
    this.internalScrollListener = () => this.scheduleReposition();
    el.addEventListener('scroll', this.internalScrollListener, { passive: true });

    // ANY scroll on the page (capture catches all ancestors) → textarea has
    // moved on screen → mirror must follow. Same for window resize.
    this.windowScrollListener = () => this.scheduleReposition();
    window.addEventListener('scroll', this.windowScrollListener, { capture: true, passive: true });
    window.addEventListener('resize', this.windowScrollListener, { passive: true });

    this.resizeObserver = new ResizeObserver(() => this.scheduleReposition());
    this.resizeObserver.observe(el);

    this.mirror.addEventListener('click', this.handleMirrorClick);
  }

  getText(): string {
    return this.element.value;
  }

  setMatches(matches: LtMatch[]): void {
    this.matches = matches;
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.renderTimer != null) return;
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      if (!this.destroyed) this.render();
    }, TextareaAdapter.RENDER_DEBOUNCE_MS);
  }

  private scheduleReposition(): void {
    if (this.repositionRaf != null) return;
    this.repositionRaf = window.requestAnimationFrame(() => {
      this.repositionRaf = null;
      if (!this.destroyed) this.syncStylesAndPosition();
    });
  }

  applyReplacement(offset: number, length: number, value: string): void {
    const el = this.element;
    const before = el.value.slice(0, offset);
    const after = el.value.slice(offset + length);
    const next = before + value + after;
    const caret = offset + value.length;

    const setter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value',
    )?.set;
    if (setter) setter.call(el, next);
    else el.value = next;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
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
    if (this.repositionRaf) window.cancelAnimationFrame(this.repositionRaf);
    this.element.removeEventListener('input', this.inputListener);
    this.element.removeEventListener('change', this.inputListener);
    this.element.removeEventListener('scroll', this.internalScrollListener);
    window.removeEventListener('scroll', this.windowScrollListener, true);
    window.removeEventListener('resize', this.windowScrollListener);
    this.resizeObserver.disconnect();
    this.mirror.removeEventListener('click', this.handleMirrorClick);
    this.mirror.remove();
  }

  private syncStylesAndPosition(): void {
    const el = this.element;
    const rect = el.getBoundingClientRect();

    // Element invisible/detached → hide mirror, no point in drawing.
    if (rect.width === 0 || rect.height === 0 || !document.contains(el)) {
      this.mirror.style.visibility = 'hidden';
      return;
    }
    this.mirror.style.visibility = 'visible';

    const cs = window.getComputedStyle(el);
    for (const prop of MIRROR_STYLE_PROPS) {
      this.mirror.style.setProperty(prop, cs.getPropertyValue(prop));
    }
    this.mirror.style.top = `${rect.top}px`;
    this.mirror.style.left = `${rect.left}px`;
    this.mirror.style.width = `${rect.width}px`;
    this.mirror.style.height = `${rect.height}px`;
    this.mirror.style.color = 'transparent';
    // Mirror reuses the *visual* scroll of the textarea, since both share text.
    this.mirror.scrollTop = el.scrollTop;
    this.mirror.scrollLeft = el.scrollLeft;
  }

  private render(): void {
    const text = this.element.value;
    if (this.matches.length === 0) {
      this.mirror.textContent = text;
      return;
    }
    const sorted = [...this.matches]
      .filter(m => m.offset < text.length && m.offset + m.length <= text.length)
      .sort((a, b) => a.offset - b.offset);

    this.mirror.replaceChildren();
    let cursor = 0;
    sorted.forEach((m, idx) => {
      if (m.offset > cursor) {
        this.mirror.appendChild(document.createTextNode(text.slice(cursor, m.offset)));
      }
      const span = document.createElement('span');
      span.className = MARK_CLASS;
      span.dataset.idx = String(idx);
      span.dataset.kind = severityFromMatch(m);
      span.textContent = text.slice(m.offset, m.offset + m.length);
      span.style.pointerEvents = 'auto';
      span.style.cursor = 'pointer';
      // Style the underline directly so we don't depend on a stylesheet
      // injection (some sites strip our styles).
      span.style.textDecoration = 'underline wavy #c8102e';
      span.style.textDecorationSkipInk = 'none';
      span.style.textUnderlineOffset = '2px';
      this.mirror.appendChild(span);
      cursor = m.offset + m.length;
    });
    if (cursor < text.length) {
      this.mirror.appendChild(document.createTextNode(text.slice(cursor)));
    }
    this.mirror.scrollTop = this.element.scrollTop;
    this.mirror.scrollLeft = this.element.scrollLeft;
  }

  private handleMirrorClick = (ev: MouseEvent): void => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains(MARK_CLASS)) return;
    const idx = Number(target.dataset.idx);
    if (Number.isNaN(idx)) return;
    const rect = target.getBoundingClientRect();
    for (const cb of this.matchClickCallbacks) cb(idx, rect);
    ev.stopPropagation();
  };
}

function severityFromMatch(m: LtMatch): string {
  const cat = m.rule.category.id;
  if (cat === 'TYPOS' || m.rule.id.includes('MORFOLOGIK')) return 'spelling';
  if (cat === 'GRAMMAR' || cat === 'CONFUSIONS' || cat === 'DIACRITICS') return 'grammar';
  return 'style';
}

export const textareaAdapterFactory: AdapterFactory = (el) => {
  if (el instanceof HTMLTextAreaElement) return new TextareaAdapter(el);
  if (el instanceof HTMLInputElement) {
    const t = (el.type || '').toLowerCase();
    if (t === '' || t === 'text' || t === 'search' || t === 'url' || t === 'email') {
      return new TextareaAdapter(el);
    }
  }
  return null;
};
