// Echo suppression for the chokidar watcher. Every write the main process performs is recorded
// here; the watcher drops events for those paths for a short window so saving a world does not
// bounce back into the renderer as an external edit.

export const SELF_WRITE_WINDOW_MS = 500;

const recent = new Map<string, number>();

function prune(now: number): void {
  for (const [path, at] of recent) {
    if (now - at >= SELF_WRITE_WINDOW_MS) recent.delete(path);
  }
}

export function noteWrite(path: string, now: number = Date.now()): void {
  recent.set(path, now);
}

export function wasSelfWrite(path: string, now: number = Date.now()): boolean {
  prune(now);
  const at = recent.get(path);
  return at !== undefined && now - at < SELF_WRITE_WINDOW_MS;
}

export function clearWriteLog(): void {
  recent.clear();
}
