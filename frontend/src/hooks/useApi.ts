import { useState, useEffect, useCallback, useRef } from 'react';

// Global in-memory cache — data stays for the entire session.
// Only refreshed when the user explicitly clicks a refresh button.
const cache: Record<string, { data: unknown }> = {};

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(endpoint: string): ApiState<T> {
  const [data, setData] = useState<T | null>(() => {
    const hit = cache[endpoint];
    return hit ? (hit.data as T) : null;
  });
  const [loading, setLoading] = useState(() => !cache[endpoint]);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(
    (force = false) => {
      // Use cache unless forced refresh
      if (!force && cache[endpoint]) {
        setData(cache[endpoint].data as T);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      fetch(endpoint)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((d) => {
          cache[endpoint] = { data: d };
          if (mountedRef.current) {
            setData(d);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (mountedRef.current) {
            setError(err.message);
            setLoading(false);
          }
        });
    },
    [endpoint],
  );

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  return { data, loading, error, refetch: () => fetchData(true) };
}

/** Force-refresh all cached data (called from the global refresh button). */
export function clearAllCache() {
  Object.keys(cache).forEach((k) => delete cache[k]);
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return '0';
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return Math.round(num).toLocaleString();
}

export function formatDbu(num: number | null | undefined): string {
  if (num == null) return '0';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toFixed(1);
}
