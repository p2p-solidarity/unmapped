// The recorder's side of WorldProvenance (rev 6 phase 4, D6), over viem: read a stream, open one,
// record a batch of beats. Each write waits for its receipt, so the recorder knows what landed; it
// runs in the background, never on a beat's path (./recorder).

import { type BeatRecord, type Hex, idToBytes32, recordBeatsArgs } from "@shared/provenance";
import {
  type Abi,
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import artifact from "../../../contracts/WorldProvenance.json";
import type { ChainEnv } from "./config";

const ABI = artifact.abi as Abi;

export interface ProvenanceChain {
  readonly chainId: number;
  /** The recorder address (lowercase): msg.sender of every record, named in every stream signature. */
  readonly recorder: Hex;
  readonly contract: Hex;
  stream(world: string): Promise<{ open: boolean; upTo: number }>;
  openStream(args: readonly [Hex, Hex, Hex, Hex, Hex, Hex]): Promise<Hex>;
  recordBeats(records: readonly BeatRecord[]): Promise<Hex>;
}

/** The chain id the RPC reports. */
export async function rpcChainId(rpcUrl: string): Promise<number> {
  return createPublicClient({ transport: http(rpcUrl) }).getChainId();
}

export function connectChain(env: ChainEnv, chainId: number): ProvenanceChain {
  const chain = defineChain({
    id: chainId,
    name: `provenance-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [env.rpcUrl] } },
  });
  const transport = http(env.rpcUrl);
  const account = privateKeyToAccount(env.key);
  const reader = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ chain, transport, account });
  const address = env.contract as Address;

  const write = async (functionName: string, args: readonly unknown[]): Promise<Hex> => {
    const hash = await wallet.writeContract({ address, abi: ABI, functionName, args });
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted in ${hash}`);
    return hash;
  };

  return {
    chainId,
    recorder: account.address.toLowerCase() as Hex,
    contract: env.contract,
    stream: async (world) => {
      const id = idToBytes32(world);
      if (id === null) throw new Error(`not a world id: ${world.slice(0, 60)}`);
      const stream = (await reader.readContract({
        address,
        abi: ABI,
        functionName: "streamOf",
        args: [account.address, id],
      })) as { open: boolean; upTo: bigint };
      return { open: stream.open, upTo: Number(stream.upTo) };
    },
    openStream: (args) => write("openStream", args),
    recordBeats: (records) => write("recordBeats", recordBeatsArgs(records)),
  };
}
