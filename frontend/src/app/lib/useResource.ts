'use client';

import { useCallback, useEffect, useState } from 'react';
import { errorMessage, isUnauthorized, request } from '../api/social';
import { notifyError } from './notify';

export function useResource<T>(path: string, enabled = true) {
  const [state, setState] = useState<{ path: string; data: T | null; error: string }>({ path: '', data: null, error: '' });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    request<T>(path, 'GET', undefined, abort.signal)
      .then(data => { if (!abort.signal.aborted) setState({ path, data, error: '' }); })
      .catch(error => {
        if (abort.signal.aborted) return;
        setState({ path, data: null, error: errorMessage(error) });
        if (!isUnauthorized(error)) notifyError(errorMessage(error), reload);
      });
    return () => abort.abort();
  }, [path, revision, enabled, reload]);
  const update = useCallback((updater: (data: T) => T) => {
    setState(current => current.path === path && current.data !== null
      ? { ...current, data: updater(current.data) } : current);
  }, [path]);
  return { data: enabled && state.path === path ? state.data : null, error: enabled && state.path === path ? state.error : '', loading: enabled && state.path !== path, reload, update };
}
