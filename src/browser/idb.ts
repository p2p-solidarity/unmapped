// A thin promise layer over IndexedDB for the browser proof (rev 6 phase 4, D7). No library: the
// proof needs get / put / delete / a key range, and each call returns a `Result` (Rule 5) — a
// browser that blocks storage (private mode, a full disk) is an error the page shows, not a throw.

import { err, ok, type Result } from "@shared/result";

export function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

export const storageHint =
  "Allow this site to store data (not a private window), free some space, then reload.";

/** Runs `body` and turns any IndexedDB failure into `browser-storage-failed`. */
export async function attempt<T>(body: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await body());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const full = error instanceof DOMException && error.name === "QuotaExceededError";
    return full
      ? err("browser-storage-full", "The browser has no room left for this world.", storageHint)
      : err("browser-storage-failed", message, storageHint);
  }
}

export function openDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase, from: number) => void,
): Promise<Result<IDBDatabase>> {
  const factory = globalThis.indexedDB;
  if (factory === undefined) {
    return Promise.resolve(
      err("browser-storage-failed", "This browser has no IndexedDB.", storageHint),
    );
  }
  return attempt(
    () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(name, version);
        request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB did not open"));
        request.onblocked = () => reject(new Error("Another tab holds an older copy open."));
      }),
  );
}
