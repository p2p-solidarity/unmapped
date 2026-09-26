// The lineage market on Sepolia: the Uniswap deployments a world launch goes through, our contracts'
// ABIs and bytecode (contracts/LineageMarket.json, built by `bun run contracts:build`), and the pure
// maths a launch needs — hook address mining, auction prices, pool ids. Pure, like ensCalls.ts: no
// client, no key, only viem, so the app, the deploy script and its dry run all build the same calls.
// Addresses were read from the chain on 2026-09-26: LBPStrategy.poolManager() / positionManager() /
// initializerFactory() on the v3.1.0 strategy, which the liquidity-launcher README lists for Sepolia.

import {
  type Abi,
  type Address,
  concat,
  encodeAbiParameters,
  encodeDeployData,
  getContractAddress,
  type Hex,
  keccak256,
  pad,
  parseAbi,
  toHex,
} from "viem";
import market from "../../../contracts/LineageMarket.json";

export const UNISWAP_SEPOLIA = {
  poolManager: "0xe03a1074c86cfedd5c142c4f04f1a1536e203543",
  positionManager: "0x429ba70129df741b2ca2a85bc3a2a3328e5c09b4",
  stateView: "0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c",
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  /** liquidity-launcher v3.1.0 (873cbb23). */
  lbpStrategy: "0x96641d91e223c766f45b19d09494f5925c3ce000",
  /** continuous-clearing-auction v2.1.0 (7d7602d2), the strategy's initializer factory. */
  ccaFactory: "0x000000001f26a0044baa66024e7b6599c61963f8",
} as const satisfies Record<string, Address>;

/** The deterministic CREATE2 deployer (Arachnid), present on Sepolia. */
export const CREATE2_DEPLOYER: Address = "0x4e59b44847b379578588920ca78fbf26c0b4956c";

type Compiled = { abi: Abi; bytecode: Hex };
const contracts = market.contracts as unknown as Record<
  | "LineageRegistry"
  | "LineageHook"
  | "LineageRouter"
  | "WorldToken"
  | "PasskeyAccount"
  | "PasskeyAccountFactory",
  Compiled
>;
export const lineageRegistry = contracts.LineageRegistry;
export const lineageHook = contracts.LineageHook;
export const lineageRouter = contracts.LineageRouter;
export const worldTokenAbi = contracts.WorldToken.abi;
export const passkeyAccount = contracts.PasskeyAccount;
export const passkeyAccountFactory = contracts.PasskeyAccountFactory;

/** One call a passkey signs for its PasskeyAccount (`PasskeyAccount.Call`). */
export interface AccountCall {
  target: Address;
  value: bigint;
  data: Hex;
}

/**
 * The WebAuthn challenge for a batch: keccak256(abi.encode(chainid, account, nonce, deadline,
 * calls)), exactly `PasskeyAccount.digest` — so the challenge can be built before the account exists.
 */
export function passkeyDigest(input: {
  chainId: bigint;
  account: Address;
  nonce: bigint;
  deadline: bigint;
  calls: readonly AccountCall[];
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        {
          type: "tuple[]",
          components: [
            { name: "target", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
      ],
      [input.chainId, input.account, input.nonce, input.deadline, input.calls],
    ),
  );
}

export const ccaAbi = parseAbi([
  "function submitBid(uint256 maxPriceQ96, uint128 amount, address owner, bytes hookData) payable returns (uint256)",
  "function exitBid(uint256 bidId)",
  "function claimTokens(uint256 bidId)",
  "function startBlock() view returns (uint64)",
  "function endBlock() view returns (uint64)",
  "function nextBidId() view returns (uint256)",
  "function floorPrice() view returns (uint256)",
  "function tickSpacing() view returns (uint256)",
  "function currencyRaised() view returns (uint256)",
  "function claimBlock() view returns (uint64)",
  "function isGraduated() view returns (bool)",
  "function lastCheckpointedBlock() view returns (uint64)",
  "function clearingPrice() view returns (uint256)",
  "event BidSubmitted(uint256 indexed id, address indexed owner, uint256 priceQ96, uint128 amount)",
]);

export const lbpStrategyAbi = parseAbi([
  "event Migrated(address indexed initializer, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) indexed key, uint160 initialSqrtPriceX96, bytes plan)",
  "event MigrationFailed(address indexed initializer, bytes reason)",
]);

export const permit2Abi = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
]);

/** ENSv2 registries are ERC-1155: a name changes hands, and its roles with it, by transfer. */
export const erc1155Abi = parseAbi([
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
]);

export const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
]);

export const poolManagerAbi = parseAbi([
  "function initialize((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint160 sqrtPriceX96) returns (int24)",
]);

/** True when no root role on the registry can repoint, take back or upgrade its names. */
export const ensRegistryAbiEmancipation = parseAbi([
  "function isEmancipated() view returns (bool)",
]);

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export function poolId(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
      ],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}

/** A CREATE2-deployer call and the address it creates. */
export function create2(initCode: Hex, salt: Hex): { to: Address; data: Hex; address: Address } {
  return {
    to: CREATE2_DEPLOYER,
    data: concat([salt, initCode]),
    address: getContractAddress({
      opcode: "CREATE2",
      from: CREATE2_DEPLOYER,
      salt,
      bytecode: initCode,
    }),
  };
}

export function registryInitCode(args: readonly unknown[]): Hex {
  return encodeDeployData({ abi: lineageRegistry.abi, bytecode: lineageRegistry.bytecode, args });
}

/** v4 reads a hook's permissions from its address: beforeInitialize, afterSwap, afterSwapReturnDelta. */
export const HOOK_FLAGS = (1n << 13n) | (1n << 6n) | (1n << 2n);
const HOOK_MASK = (1n << 14n) - 1n;

/** The first salt that puts LineageHook at an address carrying exactly HOOK_FLAGS. */
export function mineHook(args: readonly [Address, Address, Address]): {
  initCode: Hex;
  salt: Hex;
  address: Address;
} {
  const initCode = encodeDeployData({ abi: lineageHook.abi, bytecode: lineageHook.bytecode, args });
  const bytecodeHash = keccak256(initCode);
  for (let i = 0n; i < 1_000_000n; i++) {
    const salt = pad(toHex(i), { size: 32 });
    const address = getContractAddress({
      opcode: "CREATE2",
      from: CREATE2_DEPLOYER,
      salt,
      bytecodeHash,
    });
    if ((BigInt(address) & HOOK_MASK) === HOOK_FLAGS) return { initCode, salt, address };
  }
  throw new Error("no hook salt in the first million");
}

const Q96 = 1n << 96n;
const MIN_FLOOR_PRICE = (1n << 32n) + 1n;

/**
 * An auction's floor and tick spacing (both Q96, currency per token in raw units) for a floor of
 * `numerator / denominator` whole currency units per whole token. The floor is snapped to 100 ticks
 * so it sits on a tick boundary, as the CCA requires.
 */
export function auctionPrices(
  numerator: bigint,
  denominator: bigint,
  currencyDecimals: number,
  tokenDecimals: number,
): { floorPriceQ96: bigint; tickSpacingQ96: bigint } {
  const raw =
    (numerator * 10n ** BigInt(currencyDecimals) * Q96) /
    (denominator * 10n ** BigInt(tokenDecimals));
  const tickSpacingQ96 = raw / 100n;
  const floorPriceQ96 = tickSpacingQ96 * 100n;
  if (tickSpacingQ96 < 2n || floorPriceQ96 < MIN_FLOOR_PRICE) {
    throw new Error("floor price is below what the auction can represent");
  }
  return { floorPriceQ96, tickSpacingQ96 };
}

/** `sha256:<hex>` (the app's content hash) → bytes32. */
export function contentHashBytes(hash: string): Hex {
  if (!/^sha256:[a-f0-9]{64}$/.test(hash)) throw new Error(`not a content hash: ${hash}`);
  return `0x${hash.slice("sha256:".length)}`;
}
