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
  private wrapper: HTMLDivElement;
  private matches: LtMatch[] = [];
  private inputListener: () => void;
  private scrollListener: () => void;
  private resizeObserver: ResizeObserver;
  private textChangeCallbacks = new Set<() => void>();
  private matchClickCallbacks = new Set<(idx: number, rect: DOMRect) => void>();
  private destroyed = false;

  constructor(el: HTMLTextAreaElement | HTMLInputElement) {
    this.element = el;

    // Wrap the textarea in a position:relative container so we can absolutely position the mirror.
    // We avoid mutating layout: insert wrapper around element, move element inside.
    const parent = el.parentElement;
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'cc-wrapper';
    // data-cc lets the global mutation observer skip our own DOM mutations
    // (otherwise wrapping/unwrapping triggers re-scans → feedback loop).
    this.wrapper.setAttribute('data-cc', 'wrapper');
    this.wrapper.style.position = 'relative';
    this.wrapper.style.display = 'inline-block';
    this.wrapper.style.width = '100%';
    if (parent) parent.insertBefore(this.wrapper, el);
    this.wrapper.appendChild(el);

    this.mirror = document.createElement('div');
    this.mirror.className = MIRROR_CLASS;
    this.mirror.setAttribute('aria-hidden', 'true');
    this.mirror.setAttribute('data-cc', 'mirror');
    Object.assign(this.mirror.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      color: 'transparent',
      background: 'transparent',
      zIndex: '1',
      margin: '0',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);
    this.wrapper.appendChild(this.mirror);

    this.syncStyles();
    this.render();

    this.inputListener = () => {
      this.render();
      for (const cb of this.textChangeCallbacks) cb();
    };
    el.addEventListener('input', this.inputListener);
    el.addEventListener('change', this.inputListener);

    this.scrollListener = () => {
      this.mirror.scrollTop = el.scrollTop;
      this.mirror.scrollLeft = el.scrollLeft;
    };
    el.addEventListener('scroll', this.scrollListener, { passive: true });

    this.resizeObserver = new ResizeObserver(() => {
      this.syncStyles();
    });
    this.resizeObserver.observe(el);

    this.mirror.addEventListener('click', this.handleMirrorClick);
  }

  getText(): string {
    return this.element.value;
  }

  setMatches(matches: LtMatch[]): void {
    this.matches = matches;
    this.render();
  }

  applyReplacement(offset: number, length: number, value: string): void {
    const el = this.element;
    const before = el.value.slice(0, offset);
    const after = el.value.slice(offset + length);
    const next = before + value + after;
    const caret = offset + value.length;

    // Use the input event to keep React/Vue/etc state in sync.
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
    this.element.removeEventListener('input', this.inputListener);
    this.element.removeEventListener('change', this.inputListener);
    this.element.removeEventListener('scroll', this.scrollListener);
    this.resizeObserver.disconnect();
    this.mirror.removeEventListener('click', this.handleMirrorClick);
    // Restore original DOM (move element out of wrapper, remove wrapper).
    const parent = this.wrapper.parentElement;
    if (parent) {
      parent.insertBefore(this.element, this.wrapper);
      parent.removeChild(this.wrapper);
    }
  }

  private syncStyles(): void {
    const cs = window.getComputedStyle(this.element);
    for (const prop of MIRROR_STYLE_PROPS) {
      this.mirror.style.setProperty(prop, cs.getPropertyValue(prop));
    }
    // The textarea may set width via `cols`; mirror should match its actual rendered size.
    const rect = this.element.getBoundingClientRect();
    const wrapRect = this.wrapper.getBoundingClientRect();
    this.mirror.style.top = `${rect.top - wrapRect.top}px`;
    this.mirror.style.left = `${rect.left - wrapRect.left}px`;
    this.mirror.style.width = `${rect.width}px`;
    this.mirror.style.height = `${rect.height}px`;
    this.mirror.style.color = 'transparent';
  }

  private render(): void {
    const text = this.element.value;
    if (this.matches.length === 0) {
      this.mirror.textContent = text;
      return;
    }
    // Sort matches by offset and clip to text length to avoid stale-render artifacts.
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
      this.mirror.appendChild(span);
      cursor = m.offset + m.length;
    });
    if (cursor < text.length) {
      this.mirror.appendChild(document.createTextNode(text.slice(cursor)));
    }
    // Sync scroll
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
