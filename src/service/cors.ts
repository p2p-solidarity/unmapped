// Blob reads from a page (rev 6 phase 4, D7: the browser proof). The app fetches packs from main,
// never from a page, so by default the service sends no CORS header at all. An operator may name
// exact origins with `--browser-origin <origin>` (repeatable): for a blob path, a request whose
// Origin header is exactly one of them gets a preflight answer and a readable GET. Every blob GET,
// with CORS or without, says `nosniff` and `sandbox`, so a pack opened as a page is never run.

/** An origin as `--browser-origin` takes it: `http(s)://host[:port]` and nothing else, or null. */
export function parseBrowserOrigin(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.origin === text ? text : null;
}

/** The request's Origin when it is exactly one the operator configured, else null. */
export function allowedOrigin(
  origins: readonly string[] | undefined,
  request: Request,
): string | null {
  const origin = request.headers.get("origin");
  return origin !== null && origins?.includes(origin) === true ? origin : null;
}

function corsHeaders(origin: string): Record<string, string> {
  return { "access-control-allow-origin": origin, vary: "Origin" };
}

/** OPTIONS for a blob path from a configured origin. */
export function preflight(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "access-control-allow-methods": "GET",
      "access-control-allow-headers": "X-Unmapped-Auth",
      "access-control-max-age": "600",
    },
  });
}

/** A blob GET's response (the blob, or why not) with its safety headers, and CORS when allowed. */
export function withBlobHeaders(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "sandbox");
  if (origin !== null)
    for (const [name, value] of Object.entries(corsHeaders(origin))) {
      headers.set(name, value);
    }
  return new Response(response.body, { status: response.status, headers });
}
