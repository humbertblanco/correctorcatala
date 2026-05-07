import type { Message } from './types';

export type MessageHandler = (
  msg: Message,
  sender: chrome.runtime.MessageSender,
) => Promise<Message | undefined> | Message | undefined | void;

export function sendToBackground(msg: Message): Promise<Message | undefined> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp: Message | undefined) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(resp);
    });
  });
}

export function onMessage(handler: MessageHandler): () => void {
  const listener = (
    msg: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (r?: Message) => void,
  ): boolean => {
    let out: ReturnType<MessageHandler>;
    try {
      out = handler(msg as Message, sender);
    } catch {
      sendResponse(undefined);
      return false;
    }
    if (out instanceof Promise) {
      out
        .then(r => sendResponse(r ?? undefined))
        .catch(() => sendResponse(undefined));
      return true; // async response
    }
    sendResponse((out as Message | undefined) ?? undefined);
    return false;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
