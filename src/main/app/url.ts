// Pure URL guard shared by `app:open-external` and the window's open handler. Only http(s) may
// leave the app; anything else (file:, javascript:, custom schemes) is refused.

export function isHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}
