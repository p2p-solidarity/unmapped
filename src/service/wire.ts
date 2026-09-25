// What the service puts in an error frame (D9): the readers in worldProtocol.ts refuse a whole
// frame whose error code is over 64 characters or whose message or hint is over 500, so every error
// the service sends — its own, admit's, zod's — is clipped to fit before it goes out.

import type { AppError } from "@shared/result";
import { FRAME_LIMITS } from "@shared/worldProtocol";

function clip(text: string): string {
  const max = FRAME_LIMITS.errorChars;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function wireError(error: AppError): AppError {
  const code = error.code.length > 0 && error.code.length <= 64 ? error.code : "service-error";
  return error.hint === undefined
    ? { code, message: clip(error.message) }
    : { code, message: clip(error.message), hint: clip(error.hint) };
}
