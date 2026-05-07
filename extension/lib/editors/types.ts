import type { LtMatch } from '../types';

export interface EditorAdapter {
  readonly element: Element;
  /** Return the current text content of the editor. */
  getText(): string;
  /** Render underlines for these matches; replaces any existing ones. */
  setMatches(matches: LtMatch[]): void;
  /** Apply a replacement at a character offset/length, preserving caret if possible. */
  applyReplacement(offset: number, length: number, value: string): void;
  /** Subscribe to text changes (raw, no debounce). Returns unsubscribe fn. */
  onTextChange(cb: () => void): () => void;
  /**
   * Subscribe to clicks on a rendered match.
   * Receives the match index and a viewport-anchored rect for popup placement.
   */
  onMatchClick(cb: (matchIndex: number, anchorRect: DOMRect) => void): () => void;
  /** Tear down all listeners and DOM artifacts. */
  destroy(): void;
}

/** Try to construct an adapter for a given element. Returns null if not handled. */
export type AdapterFactory = (el: Element) => EditorAdapter | null;
