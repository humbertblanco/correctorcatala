export type Variant = 'auto' | 'ca-ES' | 'ca-ES-valencia' | 'ca-ES-balear' | 'es';
export type ResolvedVariant = Exclude<Variant, 'auto'>;

export interface LtReplacement {
  value: string;
  shortDescription?: string;
}

export interface LtMatch {
  message: string;
  shortMessage?: string;
  replacements: LtReplacement[];
  offset: number;
  length: number;
  context: { text: string; offset: number; length: number };
  sentence: string;
  type?: { typeName?: string };
  rule: {
    id: string;
    subId?: string;
    description?: string;
    issueType?: string;
    category: { id: string; name: string };
    urls?: { value: string }[];
    isPremium?: boolean;
  };
}

export interface LtResponse {
  language: {
    name: string;
    code: string;
    detectedLanguage?: { name: string; code: string };
  };
  matches: LtMatch[];
  software: { name: string; version: string };
}

export interface Settings {
  enabled: boolean;
  variant: Variant;
  serverUrl: string;
  customDict: string[];
  disabledDomains: string[];
  perOriginVariant: Partial<Record<string, ResolvedVariant>>;
}

export type Message =
  | { type: 'check'; text: string; variantHint?: ResolvedVariant; origin: string }
  | { type: 'check:result'; matches: LtMatch[]; variant: ResolvedVariant }
  | { type: 'check:error'; reason: 'network' | 'rate-limit' | 'unknown'; status?: number }
  | { type: 'settings:get' }
  | { type: 'settings:get:result'; settings: Settings }
  | { type: 'settings:set'; patch: Partial<Settings> }
  | { type: 'settings:saved' }
  | { type: 'dict:add'; word: string }
  | { type: 'dict:added' }
  | { type: 'test:server'; serverUrl: string }
  | { type: 'test:server:result'; ok: boolean; languages?: string[]; error?: string };
