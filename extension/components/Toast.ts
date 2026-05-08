import { t } from '../lib/i18n';

const STYLES = /* css */ `
:host { all: initial; }
.toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13.5px;
  line-height: 1.45;
  color: #1a1a1a;
  background: #ffffff;
  border: 1px solid #d8d3ca;
  border-radius: 10px;
  box-shadow: 0 10px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06);
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
  color: #c8102e;
}
.body { margin: 0 0 10px 0; color: #444; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn {
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 5px 12px;
  border-radius: 4px;
  border: 1px solid #d8d3ca;
  background: white;
  color: #444;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}
.btn:hover { color: #c8102e; border-color: #c8102e; }
.btn-primary {
  background: #c8102e;
  color: white;
  border-color: #c8102e;
}
.btn-primary:hover { background: #a30d24; border-color: #a30d24; color: white; }
.close {
  position: absolute;
  top: 6px;
  right: 8px;
  background: transparent;
  border: none;
  color: #999;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
  font-family: inherit;
}
.close:hover { color: #333; }
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
