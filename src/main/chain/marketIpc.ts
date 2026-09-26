// `market:*` channels. The renderer passes only a passkey's public key, the action a player chose
// and the passkey's assertion; main validates each (zod — the renderer is untrusted, Rule 6),
// builds every batch itself, keeps the RPC to itself, and hands writes to the gas station.

import { IPC } from "@shared/ipc";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle, handleValue } from "../handle";
import {
  cartridgeName,
  marketConfig,
  marketView,
  playerName,
  playerNames,
  saveName,
} from "./market";
import { faucet, payRoyalties, prepareAction, settleWorld, submitAction } from "./marketRelay";
import { linkInBrowser, signInBrowser } from "./signBridge";

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/) as z.ZodType<`0x${string}`>;
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const amount = z.string().regex(/^\d{1,12}(\.\d{1,18})?$/);
const key = z.object({ qx: hex32, qy: hex32 }).strict();

const cartridgeId = z.string().min(1).max(80);
const version = z.string().min(1).max(40);
const instanceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/);
/** One DNS label as LineageRegistry accepts it: a–z, 0–9, inner hyphens, ≤ 63 bytes. */
const label = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);

const action = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bid"), world: address, amount }).strict(),
  z.object({ kind: z.literal("buy"), world: address, usdc: amount }).strict(),
  z
    .object({ kind: z.literal("name-cartridge"), cartridgeId, version, label: label.optional() })
    .strict(),
  z.object({ kind: z.literal("name-save"), instanceId, label }).strict(),
  z.object({ kind: z.literal("launch"), cartridgeId, version }).strict(),
  z.object({ kind: z.literal("name-player"), label }).strict(),
]);

const submit = z
  .object({
    id: z.string().regex(/^[0-9a-f]{32}$/),
    auth: z
      .object({
        r: hex32,
        s: hex32,
        challengeIndex: z.number().int().min(0).max(4096),
        typeIndex: z.number().int().min(0).max(4096),
        authenticatorData: z
          .string()
          .regex(/^0x([0-9a-fA-F]{2}){37,1024}$/) as z.ZodType<`0x${string}`>,
        clientDataJSON: z.string().min(1).max(4096),
      })
      .strict(),
  })
  .strict();

export function registerMarketIpc(ctx: MainContext): void {
  const dirs = { cartridgesDir: ctx.cartridgesDir, instancesDir: ctx.instancesDir };
  handleValue(IPC.market.config, () => marketConfig());
  handle(IPC.market.view, z.tuple([key.nullable()]), ([k]) => marketView(k));
  handle(IPC.market.prepare, z.tuple([key, action]), ([k, a]) => prepareAction(k, a, dirs));
  // ENS names for cartridges and saves (names.ts): what a name says for this passkey (or nobody).
  handle(
    IPC.market.cartridgeName,
    z.tuple([cartridgeId, version, key.nullable(), label.nullable()]),
    ([id, v, k, l]) => cartridgeName(id, v, k, l, dirs),
  );
  handle(
    IPC.market.saveName,
    z.tuple([instanceId, label.nullable(), key.nullable()]),
    ([id, l, k]) => saveName(id, l, k, dirs),
  );
  // The player's own name (players.ts), and the player names other accounts hold.
  handle(IPC.market.playerName, z.tuple([key, label.nullable()]), ([k, l]) => playerName(k, l));
  handle(IPC.market.playerNames, z.tuple([z.array(address).max(64)]), ([list]) =>
    playerNames(list),
  );
  handle(IPC.market.submit, z.tuple([submit]), ([input]) => submitAction(input));
  handle(IPC.market.faucet, z.tuple([key]), ([k]) => faucet(k));
  handle(IPC.market.settle, z.tuple([address]), ([world]) => settleWorld(world));
  handle(IPC.market.royalties, z.tuple([address]), ([world]) => payRoyalties(world));
  // Touch ID through the system browser (Electron dev cannot reach it): see signBridge.ts.
  handle(IPC.market.link, z.tuple([]), () => linkInBrowser());
  handle(
    IPC.market.signInBrowser,
    z.tuple([
      z
        .object({
          preparedId: z.string().regex(/^[0-9a-f]{32}$/),
          credentialId: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/),
          summary: z.string().min(1).max(200),
        })
        .strict(),
    ]),
    ([input]) => signInBrowser(input),
  );
}
