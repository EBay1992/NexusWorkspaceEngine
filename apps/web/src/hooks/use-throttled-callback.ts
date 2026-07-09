import { useCallback, useEffect, useRef } from 'react';

export function useThrottledCallback<T extends (...args: never[]) => void>(
  callback: T,
  delayMs: number,
): T {
  const callbackRef = useRef(callback);
  const lastRunRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    const elapsed = now - lastRunRef.current;
    pendingArgsRef.current = args;

    const flush = () => {
      if (!pendingArgsRef.current) return;
      lastRunRef.current = Date.now();
      callbackRef.current(...pendingArgsRef.current);
      pendingArgsRef.current = null;
    };

    if (elapsed >= delayMs) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flush();
      return;
    }

    if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flush();
      }, delayMs - elapsed);
    }
  }, [delayMs]) as T;
}
