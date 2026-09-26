// The page the system browser shows when the app asks for a market signature. Electron (dev,
// unsigned) cannot reach Touch ID for WebAuthn, so the app hands this one step to Chrome or Safari,
// where the platform passkey works; the passkey is stored for rp `localhost` in the user's own
// keychain. The page only talks to the app's bridge on this origin: it reads what to sign, returns
// the raw assertion, and shows the transaction the gas station sent. It never sees a key.

export const SIGN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UNMAPPED · Sign with your passkey</title>
<style>
  :root { color-scheme: light dark; --ink: #11282c; --muted: #56706c; --ground: #eef2f0; --card: #ffffff; --accent: #bf6f00; --rule: #cfdad6; }
  @media (prefers-color-scheme: dark) { :root { --ink: #e2ebe9; --muted: #93a8a4; --ground: #0e1517; --card: #152125; --accent: #f0a33a; --rule: #27383c; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--ground); color: var(--ink); font: 16px/1.5 -apple-system, "Segoe UI", sans-serif; padding: 24px 16px; }
  main { width: min(460px, 100%); background: var(--card); border: 1px solid var(--rule); border-radius: 12px; padding: 28px; display: grid; gap: 14px; }
  .eyebrow { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin: 0; }
  h1 { font-size: 22px; margin: 0; }
  p { margin: 0; }
  .summary { font-size: 18px; font-weight: 600; }
  .muted { color: var(--muted); font-size: 14px; }
  button { font: inherit; font-weight: 600; min-height: 44px; border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; padding: 10px 16px; }
  button.secondary { background: transparent; color: var(--ink); border-color: var(--rule); }
  button:disabled { opacity: 0.5; cursor: default; }
  button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; }
  a { color: var(--accent); overflow-wrap: anywhere; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 13px; overflow-wrap: anywhere; }
</style>
</head>
<body>
<main>
  <p class="eyebrow">UNMAPPED · lineage market</p>
  <h1 id="title">Loading…</h1>
  <p class="summary" id="summary"></p>
  <p class="muted" id="note"></p>
  <div class="row" id="actions"></div>
  <p class="muted" id="status" role="status"></p>
</main>
<script>
const id = location.pathname.split("/").pop();
const $ = (x) => document.getElementById(x);
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const fromHex = (h) => Uint8Array.from(h.slice(2).match(/../g), (x) => parseInt(x, 16));
const hex = (bytes) => "0x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const post = (path, body) => fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const assertionOf = (cred) => ({
  credentialId: b64u(cred.rawId),
  authenticatorData: b64u(cred.response.authenticatorData),
  clientDataJSON: b64u(cred.response.clientDataJSON),
  signature: b64u(cred.response.signature),
});
function button(label, run, secondary) {
  const b = document.createElement("button");
  b.textContent = label;
  if (secondary) b.className = "secondary";
  b.addEventListener("click", async () => {
    for (const other of document.querySelectorAll("button")) other.disabled = true;
    $("status").textContent = "Waiting for your passkey…";
    try { await run(); } catch (e) {
      $("status").textContent = "The passkey did not answer: " + (e && e.message ? e.message : e) + ". Try again.";
      for (const other of document.querySelectorAll("button")) other.disabled = false;
    }
  });
  $("actions").append(b);
  return b;
}
function done(text) { $("actions").replaceChildren(); $("status").textContent = text; }
async function poll() {
  const s = await (await fetch("/api/status/" + id)).json();
  if (s.state === "done") {
    $("actions").replaceChildren();
    $("status").replaceChildren("Sent. ", Object.assign(document.createElement("a"), { href: "https://sepolia.etherscan.io/tx/" + s.txHash, textContent: "View it on Etherscan", target: "_blank", rel: "noopener" }), " — you can close this tab and return to the app.");
  } else if (s.state === "failed") {
    done("Sepolia refused it: " + s.error + " Go back to the app and try again.");
  } else {
    $("status").textContent = "Signed. The app is sending it to Sepolia…";
    setTimeout(poll, 2000);
  }
}
(async () => {
  const req = await (await fetch("/api/request/" + id)).json();
  if (req.error) { $("title").textContent = "This request has expired"; $("note").textContent = "Start the action again in the app."; return; }
  if (req.kind === "link") {
    $("title").textContent = "Use a passkey for the market";
    $("summary").textContent = "Your passkey will own your market account. No wallet, no ETH — UNMAPPED's gas station pays the gas.";
    $("note").textContent = "First time: create one (Touch ID once). Already made one here before: choose it (Touch ID twice, so the app can learn its public key).";
    button("Create a passkey", async () => {
      const cred = await navigator.credentials.create({ publicKey: {
        rp: { id: "localhost", name: "UNMAPPED market" },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "unmapped-player", displayName: "UNMAPPED player" },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
      } });
      const point = new Uint8Array(cred.response.getPublicKey()).slice(-64);
      const r = await post("/api/link/" + id, { credentialId: b64u(cred.rawId), qx: hex(point.slice(0, 32)), qy: hex(point.slice(32)) });
      done(r.ok ? "Linked. Return to the app." : r.error);
    });
    button("Use my existing passkey", async () => {
      const ask = () => navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: "localhost", userVerification: "required" } });
      const first = assertionOf(await ask());
      $("status").textContent = "Once more, with the same passkey…";
      const second = assertionOf(await ask());
      const r = await post("/api/link/" + id, { assertions: [first, second] });
      done(r.ok ? "Linked. Return to the app." : r.error);
    }, true);
  } else {
    $("title").textContent = "Approve with your passkey";
    $("summary").textContent = req.summary;
    $("note").textContent = "Your passkey signs exactly this action. UNMAPPED's gas station carries it to Sepolia and pays the gas; it cannot change what you signed.";
    button("Approve with Touch ID", async () => {
      const cred = await navigator.credentials.get({ publicKey: {
        challenge: fromHex(req.challenge), rpId: "localhost", userVerification: "required",
        allowCredentials: [{ type: "public-key", id: fromB64u(req.credentialId) }],
      } });
      const r = await post("/api/sign/" + id, assertionOf(cred));
      if (!r.ok) return done(r.error);
      poll();
    });
  }
})();
</script>
</body>
</html>`;
