// Minimal i18n: German UI strings are the keys, English translations live in ./i18n.en.ts.
// Entered data (names, descriptions) is not translated.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { en } from './i18n.en';

export type Lang = 'de' | 'en';

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>()(
  persist((set) => ({ lang: 'de', setLang: (lang) => set({ lang }) }), { name: 'grc-lang' }),
);

const missing = new Set<string>();

/** Translates a German UI string; `{name}` placeholders are filled from `vars`. */
export function t(de: string, vars?: Record<string, string | number>): string {
  let out = de;
  if (useLang.getState().lang === 'en') {
    const hit = en[de];
    if (hit !== undefined) out = hit;
    else if (import.meta.env.DEV && de.trim() && !missing.has(de)) {
      missing.add(de);
      console.warn(`[i18n] missing: ${de}`);
    }
  }
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : out;
}

export function dateLocale() {
  return useLang.getState().lang === 'en' ? 'en-GB' : 'de-DE';
}
