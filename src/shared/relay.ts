// The gas station's wire format. The station (src/relay, a Cloudflare Worker) holds the only key
// that pays gas for the Market; the app holds none. Main asks it for exactly one transaction per
// request, by kind, and the station builds that transaction itself: it never forwards calldata it
// did not write, except a passkey batch, which the account contract checks against the passkey's
// signature on chain. Bigints travel as decimal strings. Both ends parse with these schemas.

import { z } from "zod";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/) as z.ZodType<`0x${string}`>;
const word = z.string().regex(/^0x[0-9a-fA-F]{64}$/) as z.ZodType<`0x${string}`>;
const bytes = z
  .string()
  .max(40_000)
  .regex(/^0x([0-9a-fA-F]{2})*$/) as z.ZodType<`0x${string}`>;
const uint = z.string().regex(/^\d{1,78}$/);

/** At most this many calls in one passkey batch (a bid is 3, a buy is 2). */
export const RELAY_MAX_CALLS = 6;

const key = { qx: word, qy: word };

export const relayRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("execute"),
    ...key,
    calls: z
      .array(z.object({ target: address, value: uint, data: bytes }))
      .min(1)
      .max(RELAY_MAX_CALLS),
    deadline: uint,
    auth: z.object({
      r: word,
      s: word,
      challengeIndex: z.number().int().min(0).max(4_000),
      typeIndex: z.number().int().min(0).max(4_000),
      authenticatorData: bytes,
      clientDataJSON: z.string().min(1).max(4_000),
    }),
  }),
  z.object({ kind: z.literal("faucet"), ...key }),
  z.object({ kind: z.literal("exit"), world: address, bid: uint }),
  z.object({ kind: z.literal("claim"), world: address, bid: uint }),
  z.object({ kind: z.literal("graduate"), world: address }),
  z.object({ kind: z.literal("royalties"), world: address, currency: address }),
]);
export type RelayRequest = z.infer<typeof relayRequestSchema>;

export const relayAnswerSchema = z.union([
  z.object({ ok: z.literal(true), txHash: word }),
  z.object({
    ok: z.literal(false),
    code: z.string().max(80),
    message: z.string().max(600),
    hint: z.string().max(300).optional(),
  }),
]);
export type RelayAnswer = z.infer<typeof relayAnswerSchema>;

export const relayStatusSchema = z.object({
  ok: z.literal(true),
  chainId: z.number().int(),
  relayer: address.nullable(),
  balanceWei: uint.nullable(),
});
export type RelayStatus = z.infer<typeof relayStatusSchema>;
