// `.world` files on the world service (rev 6 phase 4, D5), from the command line — run while the
// service is stopped, or before it starts on that data dir:
//
//   bun run service -- import <file.world> --data <dir>
//   bun run service -- export <worldId> --data <dir> [--out <file.world>]
//   GET /v1/worlds/<worldId>/export    (a running service; whoever may read the world)
//
// Import re-verifies the file (`verifyWorldFile`, the same checks main and verify-world run) and
// refuses one with any problem; stores the log verbatim, its blobs (listed in blobs.txt) and an
// `imported.json` marker. The service then serves the world as a mirror (./mirror) until an owner
// rehosts it here. Importing the same file again only fills in what a crash left out.
//
// Export writes the world's log exactly as stored (read-only: a torn tail is left for the service
// to set aside, never cut here), the cartridge pack its `pack` event names and every work pack,
// signed with the service key. A world on a shipped built-in cartridge has no `pack` event: its
// file carries the cartridge pack the service holds for it when it came from a `.world` (an
// exporter's pack), else says so (`bundle-genesis-pack-missing`) — a member's app export has one.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { verdictEntries } from "@dsl/history/verdict";
import { bundleWorks, verifyWorldFile } from "@dsl/history/worldBundle";
import { type BundleBlob, buildWorldBundle } from "@dsl/history/worldBundleWrite";
import type { ContentHash } from "@shared/cartridge";
import { unpackCartridge } from "@shared/cartridgePack";
import { emptyNow, foldEntries, openGenesis } from "@shared/history/fold";
import { EVENT_ID } from "@shared/history/ids";
import { readLogLine } from "@shared/history/log";
import { readBlobAuth, signText } from "@shared/history/sign";
import type { GenesisEvent, LogEntry } from "@shared/history/types";
import { type AppError, err, ok, type Result } from "@shared/result";
import { bundleSignText, type WorldBundleReport } from "@shared/worldBundle";
import { isoAt } from "./clock";
import { mayReadBlob, readAccess } from "./door";
import type { Hub } from "./hub";
import { loadServiceKey, type ServiceKey } from "./keyFile";
import { writeImported } from "./mirror";
import { FileStore, sha256File } from "./store";

export interface BundleCommand {
  command: "import" | "export";
  /** The file to import, or the world id to export. */
  target: string;
  data: string;
  out: string | null;
}

/** `import` / `export` from the argv, null when it is neither (the service itself runs). */
export function bundleCommand(argv: readonly string[]): Result<BundleCommand> | null {
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  const command = args[0];
  if (command !== "import" && command !== "export") return null;
  let target = "";
  let data = "";
  let out: string | null = null;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--data" || arg === "--out") {
      const value = args[index + 1];
      if (value === undefined) return err("service-arg", `${arg} needs a value.`);
      if (arg === "--data") data = value;
      else out = value;
      index += 1;
    } else if (target === "" && !arg.startsWith("--")) {
      target = arg;
    } else {
      return err("service-arg", `Unknown argument ${arg}.`, "Run with --help.");
    }
  }
  if (target === "" || data === "") {
    return err(
      "service-arg",
      `${command} needs ${command === "import" ? "a .world file" : "a world id"} and --data <dir>.`,
      `bun run service -- ${command} <${command === "import" ? "file.world" : "worldId"}> --data <dir>`,
    );
  }
  return ok({ command, target, data, out });
}

function summary(report: WorldBundleReport): string {
  const problems = report.problems
    .slice(0, 8)
    .map((problem) => `  ✗ [${problem.check}] ${problem.code}: ${problem.message}`);
  return [
    `  world ${report.worldId ?? "?"} "${report.name ?? "?"}", ${report.entries} entries, head ${report.head?.n ?? "?"}`,
    `  owners ${report.owners.length}, services ${report.services.length}, beats ${report.beats.total}, works ${report.works}, blobs ${report.blobs}`,
    ...(problems.length === 0 ? ["  verify: ok"] : problems),
  ].join("\n");
}

/** Stores a verified `.world` as a mirror; the world id and its report. */
export function importWorld(
  store: FileStore,
  bytes: Uint8Array,
  at: string,
): Result<{ world: string; report: WorldBundleReport; again: boolean }> {
  const { report, opened } = verifyWorldFile(bytes);
  if (opened === null || report.problems.length > 0) {
    const first = report.problems[0];
    return err(
      first?.code ?? "bundle-invalid",
      `The file does not verify (${report.problems.length} problems): ${first?.message ?? "?"}`,
      "Run bun scripts/verify-world.ts on it for the whole report.",
    );
  }
  const world = opened.manifest.worldId;
  const lines = opened.logText.slice(0, -1).split("\n");
  const held = store.worldIds().ids.includes(world);
  if (held) {
    const stored = readLogText(store, world);
    if (!stored.ok) return stored;
    if (stored.value !== opened.logText) {
      return err(
        "import-world-exists",
        "This service already holds that world, with another history.",
        "Serve that file from another data dir, or keep the history this one holds.",
      );
    }
  } else {
    const written = store.createLog(world, lines);
    if (!written.ok) return written;
  }
  const listed = store.readBlobList(world).blobs;
  for (const [hash, blob] of opened.blobs) {
    const hex = hash.slice("sha256:".length);
    if (listed.has(hex)) continue;
    const added = store.addBlob(world, hex, blob);
    if (!added.ok) return added;
  }
  // Only a world this file brought here is a mirror: re-importing the log a service already holds
  // (its own export, say) never marks a world it attached itself.
  if (!held) {
    writeImported(store, world, { v: 1, at, file: sha256File(bytes), head: opened.manifest.head });
  }
  return ok({ world, report, again: held });
}

/** The log as stored, up to its last newline; read only (the service cuts a torn tail itself). */
function readLogText(store: FileStore, world: string): Result<string> {
  try {
    const text = readFileSync(resolve(store.root, "worlds", world, "log.jsonl"), "utf8");
    return ok(text.slice(0, text.lastIndexOf("\n") + 1));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return err("world-unknown", `This service holds no world ${world.slice(0, 12)}…: ${detail}`);
  }
}

/**
 * A world with no `pack` event (a shipped built-in genesis) still has its cartridge pack here when
 * it came from a `.world` whose exporter packed it: the listed blob that unpacks to exactly the
 * genesis revision. Null when there is none (the file then says `bundle-genesis-pack-missing`).
 */
function heldGenesisPack(
  store: FileStore,
  world: string,
  genesis: GenesisEvent,
  works: readonly BundleBlob[],
): Result<BundleBlob> | null {
  const ref = genesis.body.cartridge;
  const skip = new Set(works.map((work) => work.hash.slice("sha256:".length)));
  for (const hex of store.readBlobList(world).blobs.keys()) {
    if (skip.has(hex)) continue;
    const bytes = store.readBlob(hex);
    if (!bytes.ok) continue;
    const unpacked = unpackCartridge(bytes.value);
    const found = unpacked.ok ? unpacked.value.manifest : null;
    if (
      found?.cartridgeId === ref.cartridgeId &&
      found.version === ref.version &&
      found.contentHash === ref.contentHash
    ) {
      return ok({ hash: `sha256:${hex}` as ContentHash, bytes: bytes.value });
    }
  }
  return null;
}

/** A `.world` of a stored world, signed with the service key. */
export function exportWorld(
  store: FileStore,
  key: ServiceKey,
  world: string,
  at: string,
): Result<{ bytes: Uint8Array; report: WorldBundleReport }> {
  if (!EVENT_ID.test(world)) return err("world-id-invalid", "Not a world id.");
  const text = readLogText(store, world);
  if (!text.ok) return text;
  const entries: LogEntry[] = [];
  for (const line of text.value.slice(0, -1).split("\n")) {
    const entry = readLogLine(line);
    if (!entry.ok) return entry;
    entries.push(entry.value);
  }
  const genesis = openGenesis(entries[0]?.event);
  if (!genesis.ok) return genesis;
  const now = foldEntries(emptyNow(genesis.value), verdictEntries(entries));
  const blob = (hash: ContentHash): Result<BundleBlob> => {
    const bytes = store.readBlob(hash.slice("sha256:".length));
    return bytes.ok
      ? ok({ hash, bytes: bytes.value })
      : err("blob-missing", `This service does not hold pack ${hash.slice(0, 19)}…`);
  };
  const works: BundleBlob[] = [];
  for (const work of bundleWorks(now)) {
    const read = blob(work.pack);
    if (!read.ok) return read;
    works.push(read.value);
  }
  const genesisPack =
    now.pack === null ? heldGenesisPack(store, world, genesis.value, works) : blob(now.pack.pack);
  if (genesisPack !== null && !genesisPack.ok) return genesisPack;
  const built = buildWorldBundle({
    entries,
    logText: text.value,
    genesisPack: genesisPack?.value ?? null,
    works,
    exportedAt: at,
    signer: { key: key.key, sign: (manifest) => signText(key.secret, bundleSignText(manifest)) },
  });
  if (!built.ok) return built;
  return ok({ bytes: built.value.bytes, report: verifyWorldFile(built.value.bytes).report });
}

function jsonError(status: number, error: AppError): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * `GET /v1/worlds/<id>/export` (D5): the world's `.world`, signed with the service key, for whoever
 * may read the world (the door, as for blobs), with the blob request's signed auth header.
 */
export function exportResponse(
  hub: Hub,
  request: Request,
  path: string,
  worldId: string,
  test: boolean,
): Response {
  const world = EVENT_ID.test(worldId) ? hub.worlds.get(worldId) : undefined;
  if (world === undefined) {
    return jsonError(404, { code: "world-unknown", message: "No such world here." });
  }
  const header = request.headers.get("x-unmapped-auth") ?? "";
  const body = new Uint8Array(0);
  const signed = (ms: number) =>
    readBlobAuth(header, { method: "GET", path, body, nowS: Math.floor(ms / 1000) });
  let auth = signed(Date.now());
  if (!auth.ok && auth.error.code === "blob-auth-stale" && test) auth = signed(hub.clock.now());
  if (!auth.ok) return jsonError(401, auth.error);
  if (!mayReadBlob(hub, world, auth.value)) {
    const access = readAccess(hub, world, auth.value, null);
    return jsonError(
      403,
      access.ok ? { code: "access-denied", message: "Not yours to read." } : access.error,
    );
  }
  const exported = exportWorld(hub.store, hub.key, worldId, isoAt(hub.clock.now()));
  if (!exported.ok) return jsonError(500, exported.error);
  return new Response(new Uint8Array(exported.value.bytes), {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${worldId}.world"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
    },
  });
}

/** Runs `import` / `export`; the process exit code. */
export function runBundleCommand(command: BundleCommand): number {
  const store = new FileStore(command.data);
  const made = store.ensure();
  if (!made.ok) {
    console.error(`world service: ${made.error.message}`);
    return 1;
  }
  const at = new Date().toISOString();
  if (command.command === "import") {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(command.target));
    } catch (error) {
      console.error(`world service: cannot read ${command.target}: ${String(error)}`);
      return 1;
    }
    const imported = importWorld(store, bytes, at);
    if (!imported.ok) {
      console.error(
        `world service: import refused: ${imported.error.code} — ${imported.error.message}`,
      );
      if (imported.error.hint !== undefined) console.error(`  ${imported.error.hint}`);
      return 1;
    }
    const verb = imported.value.again ? "already held; blobs checked" : "imported as a mirror";
    console.log(
      `world service: ${imported.value.world} ${verb}\n${summary(imported.value.report)}`,
    );
    return 0;
  }
  const key = loadServiceKey(command.data);
  if (!key.ok) {
    console.error(`world service: ${key.error.message}`);
    return 1;
  }
  const exported = exportWorld(store, key.value.key, command.target, at);
  if (!exported.ok) {
    console.error(
      `world service: export refused: ${exported.error.code} — ${exported.error.message}`,
    );
    return 1;
  }
  const out = resolve(command.out ?? `${command.target}.world`);
  writeFileSync(out, exported.value.bytes);
  console.log(
    `world service: exported ${command.target} → ${out} (${exported.value.bytes.length} bytes)\n${summary(exported.value.report)}`,
  );
  return exported.value.report.problems.length === 0 ? 0 : 2;
}
