/**
 * Tiny status pip near the focused editor.
 *
 * Visible while a check is in flight ("checking…"). Vanishes when results
 * arrive. Single instance per page; reused across editors.
 */

const STYLES = /* css */ `
:host { all: initial; }
.pip {
  position: fixed;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(200, 16, 46, 0.18);
  pointer-events: none;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
}
.pip::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c8102e;
  animation: cc-pulse 1.1s ease-in-out infinite;
}
@keyframes cc-pulse {
  0%, 100% { transform: scale(1); opacity: 0.55; }
  50% { transform: scale(1.4); opacity: 1; }
}
.pip.hidden { opacity: 0; }
`;

export class StatusIndicator {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private pip: HTMLDivElement;

  constructor() {
    this.host = document.createElement('div');
    this.host.setAttribute('data-cc', 'status');
    this.host.style.position = 'fixed';
    this.host.style.zIndex = '2147483646';
    this.host.style.top = '0';
    this.host.style.left = '0';
    this.host.style.pointerEvents = 'none';
    document.body.appendChild(this.host);
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    this.root.appendChild(style);
    this.pip = document.createElement('div');
    this.pip.className = 'pip hidden';
    this.root.appendChild(this.pip);
  }

  /** Position near the top-right corner of the editor's bounding rect. */
  show(editor: Element): void {
    const rect = editor.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      this.hide();
      return;
    }
    // Top-right inside corner, with small inset so it doesn't cover content.
    const left = Math.max(0, rect.right - 22);
    const top = Math.max(0, rect.top + 4);
    this.pip.style.left = `${left}px`;
    this.pip.style.top = `${top}px`;
    this.pip.classList.remove('hidden');
  }

  hide(): void {
    this.pip.classList.add('hidden');
  }

  destroy(): void {
    this.host.remove();
  }
}
