// AI integration: uses the "sample" capability of the published claude.ai artifact when available,
// otherwise a local full-text search over the same data (prototype fallback).
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { ProcessModel } from './types';
import { parseElements, positionHolders, roleHolders } from './logic';
import type { OwnershipData } from './ownership';

// ---- access to the platform's AI -----------------------------------------------------

export interface SampleFn {
  (
    input: string | { role: 'user' | 'assistant'; content: string }[],
    options?: Record<string, unknown>,
  ): Promise<{ text: string; truncated: boolean }>;
  json: <T = unknown>(input: string | { role: 'user' | 'assistant'; content: string }[], options?: Record<string, unknown>) => Promise<T>;
}

export interface SampleError {
  code: string;
  message: string;
  text?: string;
}

let samplePromise: Promise<SampleFn | null> | null = null;

/** The AI of the claude.ai artifact viewer, or null where it is not available (local dev, other hosts). */
export function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    const claude = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
    samplePromise = claude?.use
      ? Promise.race([
          claude.use('sample').then(
            (s) => (s as SampleFn) ?? null,
            () => null,
          ),
          new Promise<null>((r) => setTimeout(() => r(null), 12_000)),
        ])
      : Promise.resolve(null);
  }
  return samplePromise;
}

/** Errors after which the AI stays off for this page view. */
const permanent = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'session_expired'];
let disabled = false;
export function noteAiError(e: SampleError) {
  if (permanent.includes(e.code)) disabled = true;
}

/** undefined while checking, null when no AI is available. */
export function useSample(): SampleFn | null | undefined {
  const [s, setS] = useState<SampleFn | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getSample().then((x) => alive && setS(disabled ? null : x));
    return () => {
      alive = false;
    };
  }, []);
  return disabled ? null : s;
}

// ---- links into the system -------------------------------------------------------------

/** A link target: an entity (kind:id), a process, or a process step (step:processId/elementId). */
export interface LinkRef {
  kind: string;
  id: string;
  label: string;
}

/** Splits text into plain parts and [[kind:id|label]] links. */
export function parseLinks(text: string): (string | LinkRef)[] {
  const out: (string | LinkRef)[] = [];
  const re = /\[\[([a-z]+):([^|\]]+)\|([^\]]+)\]\]/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ kind: m[1], id: m[2].trim(), label: m[3].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ---- catalog and local search ----------------------------------------------------------

export interface CatalogEntry extends LinkRef {
  sub: string;
  /** searchable text */
  text: string;
}

type Data = OwnershipData;

const roleName = (d: Data, id: string) => d.role.find((r) => r.id === id)?.title ?? '';

function stepEntries(d: Data, p: ProcessModel): CatalogEntry[] {
  return parseElements(p.xml)
    .filter((e) => /task|subProcess|callActivity|Gateway/i.test(e.type) || e.type === 'task')
    .map((e) => {
      const roles = (p.assignments[e.id]?.roles ?? []).map((r) => `${roleName(d, r.roleId)} (${r.raci})`).join(', ');
      return {
        kind: 'step',
        id: `${p.id}/${e.id}`,
        label: e.name,
        sub: `${p.title}${roles ? ` · ${roles}` : ''}`,
        text: `${e.name} ${p.title} ${roles}`,
      };
    });
}

/** Everything the assistant may point to, with a short context line each. */
export function buildCatalog(d: Data): CatalogEntry[] {
  const holders = (roleId: string) => {
    const r = d.role.find((x) => x.id === roleId);
    return r ? [...new Set(roleHolders(r, d).map((h) => h.user.title))].join(', ') : '';
  };
  const out: CatalogEntry[] = [];
  for (const p of d.processes) {
    const sub = `${p.category}${p.area ? ` · ${p.area}` : ''}${p.ownerRoleId ? ` · Owner: ${roleName(d, p.ownerRoleId)}` : ''}`;
    out.push({ kind: 'processes', id: p.id, label: p.title, sub, text: `${p.title} ${p.description} ${sub}` });
    out.push(...stepEntries(d, p));
  }
  for (const r of d.role) {
    const sub = `Rolle · Inhaber: ${holders(r.id) || '–'}`;
    out.push({ kind: 'role', id: r.id, label: r.title, sub, text: `${r.title} ${r.description} ${r.responsibilities} ${r.authorities} ${sub}` });
  }
  for (const p of d.position) {
    const sub = `Stelle · Inhaber: ${
      positionHolders(p, d.user)
        .map((u) => u.title)
        .join(', ') || 'unbesetzt'
    }`;
    out.push({ kind: 'position', id: p.id, label: p.title, sub, text: `${p.title} ${p.purpose} ${p.tasks} ${sub}` });
  }
  for (const r of d.risk)
    out.push({ kind: 'risk', id: r.id, label: r.title, sub: `Risiko · ${r.category}`, text: `${r.title} ${r.description} ${r.cause} ${r.category}` });
  for (const c of d.control)
    out.push({ kind: 'control', id: c.id, label: c.title, sub: 'Control (IKS)', text: `${c.title} ${c.description} ${c.objective}` });
  for (const k of d.kpi) out.push({ kind: 'kpi', id: k.id, label: k.title, sub: 'KPI', text: `${k.title} ${k.objective} ${k.formula}` });
  for (const m of d.mandate) {
    const who = d.user.find((u) => u.id === m.recipientUserId)?.title ?? '';
    out.push({ kind: 'mandate', id: m.id, label: m.title, sub: `${m.mandateType} · ${who}`, text: `${m.title} ${m.mandateType} ${who} ${m.scope}` });
  }
  return out;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ');

const stop = new Set(
  'wo finde ich die der das den dem des und oder in im ein eine einen welchem welcher welche welches wer ist sind fuer was wie mit von zu zum zur bei auf an mein meine meinen mir mich gibt es kann man where find the and which who what how for process prozess prozessen schritt aktivitaet activity step'.split(
    ' ',
  ),
);

/** Local full-text search (fallback without AI); also used to give the AI a focused context. */
export function searchCatalog(catalog: CatalogEntry[], query: string, limit = 8): CatalogEntry[] {
  const tokens = fold(query)
    .split(' ')
    .filter((w) => w.length >= 3 && !stop.has(w));
  if (!tokens.length) return [];
  return catalog
    .map((e) => {
      const label = fold(e.label);
      const text = fold(e.text);
      const labelWords = label.split(' ').filter((x) => x.length >= 5);
      let score = 0;
      for (const w of tokens) {
        const stem = w.slice(0, Math.max(4, w.length - 2));
        if (label.includes(w)) score += 4;
        else if (label.includes(stem)) score += 3;
        // compound words: "sanktionslistenpruefung" contains "sanktionslisten" and "pruef…"
        else {
          const covered = labelWords
            .filter((x) => w.includes(x.slice(0, Math.max(5, x.length - 2))))
            .reduce((n, x) => n + Math.max(5, x.length - 2), 0);
          if (covered) score += 4 * Math.min(1, covered / w.length);
          else if (text.includes(w)) score += 1.5;
          else if (text.includes(stem)) score += 1;
        }
      }
      // prefer steps and processes for "where" questions
      if (score && (e.kind === 'step' || e.kind === 'processes')) score += 0.5;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}

/** Compact catalog text for the AI prompt. */
export function catalogText(catalog: CatalogEntry[]) {
  return catalog.map((e) => `[[${e.kind}:${e.id}|${e.label}]] — ${e.sub}`).join('\n');
}

// ---- chat state (kept across views) ----------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  /** answer from the local search instead of the AI */
  hits?: CatalogEntry[];
  mode?: 'ai' | 'search';
  pending?: boolean;
  error?: string;
}

interface ChatState {
  messages: ChatMessage[];
  open: boolean;
  setOpen: (open: boolean) => void;
  push: (m: ChatMessage) => number;
  patch: (i: number, m: Partial<ChatMessage>) => void;
  clear: () => void;
}

export const useChat = create<ChatState>()((set, get) => ({
  messages: [],
  open: false,
  setOpen: (open) => set({ open }),
  push: (m) => {
    set((s) => ({ messages: [...s.messages, m] }));
    return get().messages.length - 1;
  },
  patch: (i, m) => set((s) => ({ messages: s.messages.map((x, j) => (j === i ? { ...x, ...m } : x)) })),
  clear: () => set({ messages: [] }),
}));
