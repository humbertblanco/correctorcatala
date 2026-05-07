import type { LtMatch } from '../lib/types';
import { t } from '../lib/i18n';

export interface SuggestionCardActions {
  onApply: (replacement: string) => void;
  onAddToDictionary: () => void;
  onIgnoreHere: () => void;
  onDismiss: () => void;
}

const STYLES = /* css */ `
:host {
  all: initial;
}
.card {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  color: #1f1f1f;
  background: #ffffff;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08);
  padding: 12px;
  width: 320px;
  max-width: calc(100vw - 16px);
  position: fixed;
  z-index: 2147483647;
  box-sizing: border-box;
  line-height: 1.4;
}
.message { margin: 0 0 8px 0; color: #333; }
.short { font-weight: 600; color: #c8102e; margin-bottom: 4px; }
.replacements { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
.repl {
  background: #c8102e; color: white;
  border: none; border-radius: 4px;
  padding: 4px 10px; font-size: 12px;
  cursor: pointer; font-family: inherit;
}
.repl:hover { background: #a30d24; }
.no-repl { color: #888; font-style: italic; font-size: 12px; padding: 4px 0; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; border-top: 1px solid #eee; padding-top: 8px; }
.btn {
  background: transparent; border: none;
  color: #555; font-size: 11.5px;
  cursor: pointer; padding: 2px 4px;
  font-family: inherit;
}
.btn:hover { color: #c8102e; }
.close {
  position: absolute; top: 6px; right: 8px;
  background: transparent; border: none;
  color: #999; font-size: 16px; line-height: 1; cursor: pointer;
}
.close:hover { color: #333; }
`;

export class SuggestionCard {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private outsideClickListener: (e: MouseEvent) => void;
  private hidden = true;

  constructor() {
    this.host = document.createElement('div');
    this.host.style.position = 'fixed';
    this.host.style.zIndex = '2147483647';
    this.host.style.top = '0';
    this.host.style.left = '0';
    this.host.style.pointerEvents = 'none';
    document.body.appendChild(this.host);
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    this.root.appendChild(style);

    this.outsideClickListener = (e) => {
      if (this.hidden) return;
      const path = e.composedPath();
      if (path.includes(this.host)) return;
      this.hide();
    };
    document.addEventListener('click', this.outsideClickListener, true);
  }

  show(match: LtMatch, anchor: DOMRect, actions: SuggestionCardActions): void {
    this.hidden = false;
    // Re-mount fresh content
    const existing = this.root.querySelector('.card');
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.className = 'card';
    card.style.pointerEvents = 'auto';

    const close = document.createElement('button');
    close.className = 'close';
    close.setAttribute('aria-label', t('suggestion_dismiss'));
    close.textContent = '×';
    close.addEventListener('click', () => {
      actions.onDismiss();
      this.hide();
    });
    card.appendChild(close);

    if (match.shortMessage) {
      const sm = document.createElement('div');
      sm.className = 'short';
      sm.textContent = match.shortMessage;
      card.appendChild(sm);
    }
    const msg = document.createElement('p');
    msg.className = 'message';
    msg.textContent = match.message;
    card.appendChild(msg);

    if (match.replacements.length > 0) {
      const reps = document.createElement('div');
      reps.className = 'replacements';
      for (const r of match.replacements.slice(0, 6)) {
        const btn = document.createElement('button');
        btn.className = 'repl';
        btn.textContent = r.value;
        btn.addEventListener('click', () => {
          actions.onApply(r.value);
          this.hide();
        });
        reps.appendChild(btn);
      }
      card.appendChild(reps);
    } else {
      const empty = document.createElement('div');
      empty.className = 'no-repl';
      empty.textContent = t('suggestion_no_replacements');
      card.appendChild(empty);
    }

    const actionsRow = document.createElement('div');
    actionsRow.className = 'actions';
    const dictBtn = document.createElement('button');
    dictBtn.className = 'btn';
    dictBtn.textContent = t('suggestion_add_to_dictionary');
    dictBtn.addEventListener('click', () => {
      actions.onAddToDictionary();
      this.hide();
    });
    const ignoreBtn = document.createElement('button');
    ignoreBtn.className = 'btn';
    ignoreBtn.textContent = t('suggestion_ignore_here');
    ignoreBtn.addEventListener('click', () => {
      actions.onIgnoreHere();
      this.hide();
    });
    actionsRow.appendChild(dictBtn);
    actionsRow.appendChild(ignoreBtn);
    card.appendChild(actionsRow);

    this.root.appendChild(card);

    // Position: below the underline, clamped to viewport
    const cardWidth = 320;
    const cardHeight = card.getBoundingClientRect().height || 140;
    let top = anchor.bottom + 6;
    let left = anchor.left;
    if (left + cardWidth > window.innerWidth - 8) {
      left = window.innerWidth - cardWidth - 8;
    }
    if (left < 8) left = 8;
    if (top + cardHeight > window.innerHeight - 8) {
      top = anchor.top - cardHeight - 6;
    }
    if (top < 8) top = 8;
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  hide(): void {
    this.hidden = true;
    const card = this.root.querySelector('.card');
    if (card) card.remove();
  }

  destroy(): void {
    document.removeEventListener('click', this.outsideClickListener, true);
    this.host.remove();
  }
}
