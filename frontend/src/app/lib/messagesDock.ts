'use client';

import { useSyncExternalStore } from 'react';

/**
 * The Messages dock's one piece of state, held outside React so it survives navigation.
 *
 * Three things have to outlive a route change: whether the dock is open, which conversation
 * is showing, and the half-typed draft. A `useState` inside the dock cannot, because the dock
 * unmounts on `/messages` and the panel is not always the same tree; a store module can, and
 * it mirrors itself into `sessionStorage` so even a reload keeps the panel where it was.
 *
 * `useSyncExternalStore` is used rather than a context so any component — the dock, and the
 * composer deep inside it — can read the same value without a provider threading it down.
 */
export type DockTarget = { kind: 'dm' | 'group'; id: string } | null;

export interface DockState {
  open: boolean;
  target: DockTarget;
  /** One draft, for the conversation that is open. Switching conversations starts a new one. */
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
    // A disabled or full sessionStorage is not a reason to fail: the dock just starts closed.
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
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return snapshot;
}

// The server (and the hydration pass that follows it) renders the dock closed. `useSyncExternalStore`
// reads this during SSR and hydration, then re-reads `getSnapshot` once it subscribes — which is
// what lets a `sessionStorage` value that says "open" take over without a hydration mismatch.
const serverSnapshot: DockState = CLOSED;
function getServerSnapshot() {
  return serverSnapshot;
}

/** The dock's mutators. Each one is the whole surface the interface is allowed to write. */
export const messagesDock = {
  openList() {
    state = { open: true, target: null, draft: '' };
    emit();
  },
  open(target: DockTarget) {
    // Opening the conversation already showing keeps its draft; a different one starts fresh.
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
