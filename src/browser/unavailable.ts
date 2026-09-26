// What the browser proof does not do (rev 6 phase 4, D7: no AI, own keys, Create, places,
// otherworlds, owning worlds, export or chain on this client). Every such call answers one error
// value, never a throw and never a stand-in result (Rules 2 and 5).

import { type AppError, err, fail, type Result } from "@shared/result";

const NOT_HERE: Result<never> = err(
  "not-on-this-client",
  "This is not available in the browser.",
  "Open this on the desktop app.",
);

/** A namespace every method of which resolves `result`; `on…` listeners register nothing. */
function answering<T extends object>(result: Result<never>): T {
  return new Proxy({} as T, {
    get(_target, property) {
      // Not a thenable: awaiting a namespace must not call into it.
      if (typeof property !== "string" || property === "then") return undefined;
      return property.startsWith("on") ? () => () => {} : () => Promise.resolve(result);
    },
  });
}

/**
 * A whole `window.seed` namespace this client does not have. Nothing on this client calls these;
 * they exist so a shared renderer module that does gets an error value instead of a crash.
 */
export function desktopOnly<T extends object>(): T {
  return answering<T>(NOT_HERE);
}

/**
 * A namespace this client implements only in part: the methods in `implemented`, and
 * `not-on-this-client` for every other one — including any a later build adds to the interface.
 */
export function partly<T extends object>(implemented: Partial<T>): T {
  const rest = desktopOnly<T>();
  return new Proxy({} as T, {
    get(_target, property) {
      if (typeof property === "string" && Object.hasOwn(implemented, property)) {
        return (implemented as Record<string, unknown>)[property];
      }
      return Reflect.get(rest, property);
    },
  });
}

/** A namespace that cannot work on this device at all (no storage): every call says why. */
export function failingWith<T extends object>(error: AppError): T {
  return answering<T>(fail(error));
}
