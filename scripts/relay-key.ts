// Makes the gas station's own key: `bun run relay:key`. The key pays Sepolia gas for the Worker in
// src/relay and nothing else — it owns no name, no world and no admin role, so losing it costs only
// the test ETH on it. It is written once to .cache/relay/relayer.key (gitignored, mode 600; also as
// .cache/relay/dev.env for `bun run relay:dev`) and never printed; only its address is. Hand it to Cloudflare yourself:
//
//   bunx wrangler@4 secret put RELAYER_KEY -c web/lineage-relay/wrangler.jsonc < .cache/relay/relayer.key
//
// Running it again prints the same address; it never replaces an existing key.

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// Run from the repo root (`bun run relay:key`), like the other scripts.
const dir = ".cache/relay";
const file = `${dir}/relayer.key`;

async function existing(): Promise<`0x${string}` | null> {
  try {
    const text = (await readFile(file, "utf8")).trim();
    return /^0x[0-9a-fA-F]{64}$/.test(text) ? (text as `0x${string}`) : null;
  } catch {
    return null;
  }
}

let key = await existing();
const made = key === null;
if (key === null) {
  key = generatePrivateKey();
  await mkdir(dir, { recursive: true });
  await writeFile(file, key, { mode: 0o600 });
  await chmod(file, 0o600);
}
// The same key for `bun run relay:dev` (wrangler's --env-file), so a local station pays the same way.
await writeFile(`${dir}/dev.env`, `RELAYER_KEY=${key}\n`, { mode: 0o600 });
await chmod(`${dir}/dev.env`, 0o600);
const address = privateKeyToAccount(key).address;
console.log(made ? "New gas station key written to .cache/relay/relayer.key" : "Existing key kept");
console.log(`Relayer address: ${address}`);
console.log("1. Send it some Sepolia ETH (0.05 covers a demo day).");
console.log(
  "2. bunx wrangler@4 secret put RELAYER_KEY -c web/lineage-relay/wrangler.jsonc < .cache/relay/relayer.key",
);
