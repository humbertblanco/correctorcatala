import type { LtMatch, LtResponse, ResolvedVariant } from './types';

export class HttpError extends Error {
  constructor(public status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = 'HttpError';
  }
}

export class NetworkError extends Error {
  constructor(message = 'network error') {
    super(message);
    this.name = 'NetworkError';
  }
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function check(opts: {
  serverUrl: string;
  text: string;
  variant: ResolvedVariant;
  signal?: AbortSignal;
}): Promise<LtMatch[]> {
  const { serverUrl, text, variant, signal } = opts;
  if (!text.trim()) return [];

  const body = new URLSearchParams();
  body.set('text', text);
  body.set('language', variant);

  const url = `${trimTrailingSlash(serverUrl)}/v2/check`;
  let res: Response;
  try {
    const init: RequestInit = {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    };
    if (signal) init.signal = signal;
    res = await fetch(url, init);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new NetworkError((err as Error).message);
  }

  if (!res.ok) {
    throw new HttpError(res.status);
  }

  const data = (await res.json()) as LtResponse;
  return data.matches ?? [];
}

export async function fetchLanguages(serverUrl: string, signal?: AbortSignal): Promise<string[]> {
  const url = `${trimTrailingSlash(serverUrl)}/v2/languages`;
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  const res = await fetch(url, init);
  if (!res.ok) throw new HttpError(res.status);
  const data = (await res.json()) as { longCode: string }[];
  return data.map(l => l.longCode);
}
