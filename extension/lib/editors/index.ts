import type { AdapterFactory, EditorAdapter } from './types';
import { textareaAdapterFactory } from './textarea';
import { contentEditableAdapterFactory } from './contenteditable';

const FACTORIES: AdapterFactory[] = [
  textareaAdapterFactory,
  contentEditableAdapterFactory,
];

export function createAdapter(el: Element): EditorAdapter | null {
  for (const f of FACTORIES) {
    const adapter = f(el);
    if (adapter) return adapter;
  }
  return null;
}

export const EDITOR_SELECTOR = [
  'textarea',
  'input[type=text]',
  'input[type=search]',
  'input[type=url]',
  'input[type=email]',
  'input:not([type])',
  '[contenteditable=""]',
  '[contenteditable=true]',
  '[contenteditable=plaintext-only]',
].join(', ');

export type { EditorAdapter };
