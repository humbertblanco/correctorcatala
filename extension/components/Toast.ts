import { t } from '../lib/i18n';

const STYLES = /* css */ `
:host {
  all: initial;
  --bg: #ffffff;
  --ink: #1a1a1a;
  --ink-soft: #444;
  --line: #d8d3ca;
  --close: #999;
  --close-hover: #333;
  --red: #c8102e;
  --red-dark: #a30d24;
}
@media (prefers-color-scheme: dark) {
  :host {
    --bg: #232630;
    --ink: #ebe7df;
    --ink-soft: #c0bdb6;
    --line: #444751;
    --close: #6a6a6a;
    --close-hover: #c0bdb6;
    --red: #e1364f;
    --red-dark: #c8102e;
  }
}
.toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--ink);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 10px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.12);
  padding: 14px 38px 14px 16px;
  max-width: 340px;
  pointer-events: auto;
  animation: cc-slidein 0.2s ease-out;
}
@keyframes cc-slidein {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.title {
  font-weight: 600;
  margin: 0 0 4px 0;
  font-size: 13.5px;
  color: var(--red);
}
.body { margin: 0 0 10px 0; color: var(--ink-soft); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn {
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 5px 12px;
  border-radius: 4px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--ink-soft);
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}
.btn:hover { color: var(--red); border-color: var(--red); }
.btn-primary {
  background: var(--red);
  color: white;
  border-color: var(--red);
}
.btn-primary:hover { background: var(--red-dark); border-color: var(--red-dark); color: white; }
.close {
  position: absolute;
  top: 6px;
  right: 8px;
  background: transparent;
  border: none;
  color: var(--close);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
  font-family: inherit;
}
.close:hover { color: var(--close-hover); }
`;

export interface ToastOptions {
  title: string;
  body: string;
  primaryHref?: string;
  primaryLabel?: string;
  onDismiss: () => void;
}

export class Toast {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private autoHideTimer: number | null = null;

  constructor(opts: ToastOptions) {
    this.host = document.createElement('div');
    this.host.setAttribute('data-cc', 'toast');
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

    const toast = document.createElement('div');
    toast.className = 'toast';

    const close = document.createElement('button');
    close.className = 'close';
    close.setAttribute('aria-label', t('suggestion_dismiss'));
    close.textContent = '×';
    close.addEventListener('click', () => this.dismiss(opts.onDismiss));
    toast.appendChild(close);

    const title = document.createElement('p');
    title.className = 'title';
    title.textContent = opts.title;
    toast.appendChild(title);

    const body = document.createElement('p');
    body.className = 'body';
    body.textContent = opts.body;
    toast.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'actions';
    if (opts.primaryHref) {
      const a = document.createElement('a');
      a.className = 'btn btn-primary';
      a.href = opts.primaryHref;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = opts.primaryLabel ?? '';
      a.addEventListener('click', () => this.dismiss(opts.onDismiss));
      actions.appendChild(a);
    }
    const ok = document.createElement('button');
    ok.className = 'btn';
    ok.textContent = t('toast_dismiss');
    ok.addEventListener('click', () => this.dismiss(opts.onDismiss));
    actions.appendChild(ok);
    toast.appendChild(actions);

    this.root.appendChild(toast);

    // Auto-hide after 20 s if user ignores it. Doesn't count as "dismissed"
    // (so it could re-appear later). The explicit close button DOES dismiss.
    this.autoHideTimer = window.setTimeout(() => {
      this.host.remove();
    }, 20_000);
  }

  private dismiss(cb: () => void): void {
    if (this.autoHideTimer != null) window.clearTimeout(this.autoHideTimer);
    cb();
    this.host.remove();
  }
}
