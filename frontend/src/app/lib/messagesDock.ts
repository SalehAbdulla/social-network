'use client';

import { useSyncExternalStore } from 'react';

export type DockTarget = { kind: 'dm' | 'group'; id: string } | null;

export interface DockState {
  open: boolean;
  target: DockTarget;
  draft: string;
}

const STORAGE_KEY = 'social-network:messages-dock';
const CLOSED: DockState = { open: false, target: null, draft: '' };

function read(): DockState {
  if (typeof window === 'undefined') return CLOSED;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return CLOSED;
    const parsed = JSON.parse(raw) as Partial<DockState>;
    const target = parsed.target;
    const valid = target && (target.kind === 'dm' || target.kind === 'group') && typeof target.id === 'string';
    return {
      open: !!parsed.open,
      target: valid ? { kind: target.kind, id: target.id } : null,
      draft: typeof parsed.draft === 'string' ? parsed.draft : '',
    };
  } catch {
    return CLOSED;
  }
}

let state: DockState = read();
let snapshot: DockState = state;
const listeners = new Set<() => void>();

function emit() {
  snapshot = { ...state };
  for (const listener of listeners) listener();
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode, or the quota is full */ }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return snapshot;
}

const serverSnapshot: DockState = CLOSED;
function getServerSnapshot() {
  return serverSnapshot;
}

export const messagesDock = {
  openList() {
    state = { open: true, target: null, draft: '' };
    emit();
  },
  open(target: DockTarget) {
    const same = target && state.target && target.kind === state.target.kind && target.id === state.target.id;
    state = { open: true, target, draft: same ? state.draft : '' };
    emit();
  },
  backToList() {
    state = { ...state, target: null, draft: '' };
    emit();
  },
  close() {
    state = { ...state, open: false };
    emit();
  },
  setDraft(draft: string) {
    state = { ...state, draft };
    emit();
  },
};

export function useMessagesDock(): DockState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
