'use client';

import { useCallback, useEffect, useState } from 'react';
import { errorMessage, request } from '../api/social';

export function useResource<T>(path: string) {
  const [state, setState] = useState<{ path: string; data: T | null; error: string }>({ path: '', data: null, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    request<T>(path, 'GET', undefined, abort.signal)
      .then(data => { if (!abort.signal.aborted) setState({ path, data, error: '' }); })
      .catch(error => { if (!abort.signal.aborted) setState({ path, data: null, error: errorMessage(error) }); });
    return () => abort.abort();
  }, [path, revision]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  return { data: state.path === path ? state.data : null, error: state.path === path ? state.error : '', loading: state.path !== path, reload };
}
