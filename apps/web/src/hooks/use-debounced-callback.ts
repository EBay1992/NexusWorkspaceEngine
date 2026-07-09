import { useCallback, useEffect, useMemo, useRef } from 'react';

export interface DebouncedHandle<T extends (...args: never[]) => void> {
  run: T;
  flush: () => void;
  cancel: () => void;
}

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delayMs: number,
): DebouncedHandle<T> {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingArgsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (!pendingArgsRef.current) return;
    const args = pendingArgsRef.current;
    cancel();
    callbackRef.current(...args);
  }, [cancel]);

  const run = useCallback((...args: Parameters<T>) => {
    pendingArgsRef.current = args;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingArgsRef.current = null;
      callbackRef.current(...args);
    }, delayMs);
  }, [delayMs]) as T;

  return useMemo(
    () => ({
      run,
      flush,
      cancel,
    }),
    [run, flush, cancel],
  );
}
