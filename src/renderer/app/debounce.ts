// Keyed debouncer shared by the disk watcher (150 ms) and the writer (300 ms). One timer per key
// so a karma write never cancels an inventory write.

export interface Debouncer {
  schedule(key: string, delayMs: number, run: () => void): void;
  cancel(key: string): void;
  /** Runs every pending job now (used on unmount so the last write is not lost). */
  flushAll(): void;
  cancelAll(): void;
}

export function createDebouncer(): Debouncer {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const jobs = new Map<string, () => void>();

  const clear = (key: string): void => {
    const timer = timers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(key);
    jobs.delete(key);
  };

  return {
    schedule(key, delayMs, run) {
      clear(key);
      jobs.set(key, run);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          jobs.delete(key);
          run();
        }, delayMs),
      );
    },
    cancel: clear,
    flushAll() {
      for (const [key, run] of [...jobs]) {
        clear(key);
        run();
      }
    },
    cancelAll() {
      for (const key of [...timers.keys()]) clear(key);
    },
  };
}
