"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "veilend-extra-position-ids";
const EMPTY: string[] = [];

type ExtraMap = Record<string, string[]>;

let memory: ExtraMap = {};
const listeners = new Set<() => void>();

function readStorage(): ExtraMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ExtraMap;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: ExtraMap = {};
    for (const [wallet, ids] of Object.entries(parsed)) {
      if (!Array.isArray(ids)) continue;
      const cleaned = ids.filter((id) => typeof id === "string" && /^\d+$/.test(id));
      if (cleaned.length > 0) next[wallet.toLowerCase()] = cleaned;
    }
    return next;
  } catch {
    return {};
  }
}

if (typeof window !== "undefined") {
  memory = readStorage();
}

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    /* private mode / quota */
  }
}

export function rememberPositionId(wallet: string, id: string) {
  if (!wallet || !/^\d+$/.test(id)) return;
  const key = wallet.toLowerCase();
  const current = memory[key] ?? EMPTY;
  if (current.includes(id)) return;
  memory = { ...memory, [key]: [...current, id] };
  persist();
  emit();
}

export function extraIdsFor(wallet?: string): string[] {
  if (!wallet) return EMPTY;
  return memory[wallet.toLowerCase()] ?? EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useExtraPositionIds(wallet?: string) {
  return useSyncExternalStore(
    subscribe,
    () => extraIdsFor(wallet),
    () => EMPTY,
  );
}
