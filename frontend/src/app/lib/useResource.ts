'use client';

import { useCallback, useEffect, useState } from 'react';
import { errorMessage, isNotFound, isUnauthorized, request } from '../api/social';
import { notifyError } from './notify';

export function useResource<T>(path: string, enabled = true) {
  const [state, setState] = useState<{ path: string; data: T | null; error: string; notFound: boolean }>({ path: '', data: null, error: '', notFound: false });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    request<T>(path, 'GET', undefined, abort.signal)
      .then(data => { if (!abort.signal.aborted) setState({ path, data, error: '', notFound: false }); })
      .catch(error => {
        if (abort.signal.aborted) return;
        setState({ path, data: null, error: errorMessage(error), notFound: isNotFound(error) });
        if (!isUnauthorized(error)) notifyError(errorMessage(error), reload);
      });
    return () => abort.abort();
  }, [path, revision, enabled, reload]);
  const update = useCallback((updater: (data: T) => T) => {
    setState(current => current.path === path && current.data !== null
      ? { ...current, data: updater(current.data) } : current);
  }, [path]);
  return { data: enabled && state.path === path ? state.data : null, error: enabled && state.path === path ? state.error : '', notFound: enabled && state.path === path ? state.notFound : false, loading: enabled && state.path !== path, reload, update };
}
