// The only file in `identity/` that imports electron: `safeStorage` as a `KeyCipher`, so the key
// rules in ./deviceKey stay testable without Electron.

import { safeStorage } from "electron";
import type { KeyCipher } from "./deviceKey";

export function electronCipher(): KeyCipher {
  return {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => new Uint8Array(safeStorage.encryptString(plain)),
    decrypt: (blob) => safeStorage.decryptString(Buffer.from(blob)),
  };
}
