// ENSv2 on Sepolia: the contracts a cartridge name touches and the calls that make one. Pure — no
// client, no key — so the app, the one-time setup script and its dry run all send the same calls.
// Addresses and ABIs: the deployment the Universal Resolver actually walks today —
// ens_v2_sepolia_20260916, ensdomains/contracts-v2@366de741 `contracts/deployments/sepolia/`. The
// docs' Deployments table is an older set (root 0xc960…) that the resolver no longer reaches, and
// this build's resolver takes DNS-encoded names (`setText(bytes name, …)`), not namehashes.
// `rootRegistry` + `ethRegistry` let the setup script notice the next redeploy instead of writing
// names nobody can resolve.
// Only viem is imported here, so `scripts/ens-setup.ts` can load this file without path aliases.

import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  keccak256,
  labelhash,
  maxUint64,
  namehash,
  parseAbi,
  stringToHex,
  toHex,
  zeroAddress,
} from "viem";
import { packetToBytes } from "viem/ens";

export const ENSV2_SEPOLIA = {
  rootRegistry: "0x9703dbd26dab89504490994138cf2c575251a9ce",
  ethRegistry: "0x657ea849311d3d5823348dded7c2aaafb3ede09e",
  ethRegistrar: "0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca",
  verifiableFactory: "0x9e726eb570beb6bceb495ab8cda7df517d4e841c",
  userRegistryImpl: "0xa80338aaa8d23831cea25e858d1774534abb0263",
  permissionedResolverImpl: "0x14f09fd05d4585759e54844dc9b00147131cf243",
  mockUsdc: "0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e",
} as const satisfies Record<string, Address>;

/** Every role and its admin: what the owner holds on its own resolver. */
export const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n;

const withAdmin = (role: bigint) => role | (role << 128n);
const ROLE_REGISTRAR = 1n << 0n;
const ROLE_SET_PARENT = 1n << 8n;
const ROLE_UNREGISTER = 1n << 12n;
const ROLE_RENEW = 1n << 16n;
const ROLE_SET_SUBREGISTRY = 1n << 20n;
const ROLE_SET_RESOLVER = 1n << 24n;
const ROLE_CAN_TRANSFER_ADMIN = (1n << 28n) << 128n;
const ROLE_UPGRADE = 1n << 124n;
/** The owner's root roles on the parent's User Registry (RegistryRolesLib, with admins). */
export const REGISTRY_ROOT_ROLES =
  withAdmin(ROLE_REGISTRAR) |
  withAdmin(ROLE_SET_PARENT) |
  withAdmin(ROLE_UNREGISTER) |
  withAdmin(ROLE_RENEW) |
  withAdmin(ROLE_SET_SUBREGISTRY) |
  withAdmin(ROLE_SET_RESOLVER) |
  withAdmin(ROLE_UPGRADE);
/** What a name's owner holds on its own entry — the ETH Registrar's bitmap. */
export const NAME_ROLES =
  withAdmin(ROLE_SET_SUBREGISTRY) | withAdmin(ROLE_SET_RESOLVER) | ROLE_CAN_TRANSFER_ADMIN;

/** PermissionedRegistry `Status`. */
export const NAME_STATUS = { available: 0, reserved: 1, registered: 2 } as const;

export const registryAbi = parseAbi([
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource))",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setResolver(uint256 anyId, address resolver)",
  "function setParent(address parent, string label)",
  "function initialize((address account, uint256 roleBitmap)[] grants)",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
]);

export const resolverAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
  "function setText(bytes name, string key, string value)",
  "function multicall(bytes[] calls) returns (bytes[])",
  "function resolve(bytes name, bytes data) view returns (bytes)",
]);

/** The standard ENSIP-5 profile, as a resolver's `resolve` and the Universal Resolver expect it. */
export const textProfileAbi = parseAbi([
  "function text(bytes32 node, string key) view returns (string)",
]);

export const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
]);

export const registrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function MIN_REGISTER_DURATION() view returns (uint64)",
]);

export const usdcAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const universalResolverAbi = parseAbi([
  "function resolve(bytes name, bytes data) view returns (bytes result, address resolver)",
]);

export interface Call {
  to: Address;
  data: Hex;
}

export function dnsEncode(name: string): Hex {
  return toHex(packetToBytes(name));
}

/** Salt scheme from the Verifiable Factory docs: keccak256("OwnedResolver", owner, 0). */
function resolverSalt(owner: Address): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [keccak256(stringToHex("OwnedResolver")), owner, 0n],
      ),
    ),
  );
}

/** keccak256("UserRegistry", namehash(parent), 0). */
function registrySalt(parent: string): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
        [keccak256(stringToHex("UserRegistry")), namehash(parent), 0n],
      ),
    ),
  );
}

/** A Permissioned Resolver proxy that `owner` fully controls. */
export function deployResolverCall(owner: Address): Call {
  const init = encodeFunctionData({
    abi: resolverAbi,
    functionName: "initialize",
    args: [[{ account: owner, roleBitmap: ALL_ROLES }], []],
  });
  return {
    to: ENSV2_SEPOLIA.verifiableFactory,
    data: encodeFunctionData({
      abi: factoryAbi,
      functionName: "deployProxy",
      args: [ENSV2_SEPOLIA.permissionedResolverImpl, resolverSalt(owner), init],
    }),
  };
}

/** A User Registry proxy for `parent`'s subnames; `owner` holds its root roles. */
export function deployRegistryCall(owner: Address, parent: string): Call {
  const init = encodeFunctionData({
    abi: registryAbi,
    functionName: "initialize",
    args: [[{ account: owner, roleBitmap: REGISTRY_ROOT_ROLES }]],
  });
  return {
    to: ENSV2_SEPOLIA.verifiableFactory,
    data: encodeFunctionData({
      abi: factoryAbi,
      functionName: "deployProxy",
      args: [ENSV2_SEPOLIA.userRegistryImpl, registrySalt(parent), init],
    }),
  };
}

export interface NameSetup {
  owner: Address;
  /** The parent's User Registry. */
  registry: Address;
  /** The owner's Permissioned Resolver. */
  resolver: Address;
}

export interface SubnameCallsInput extends NameSetup {
  label: string;
  parent: string;
  /** False when the label is already registered to `owner` and only the records change. */
  register: boolean;
  texts: Record<string, string>;
}

/** Register `label.parent` (permanent, owner keeps the standard name roles) and write its texts. */
export function subnameCalls(input: SubnameCallsInput): Call[] {
  const name = dnsEncode(`${input.label}.${input.parent}`);
  const calls: Call[] = [];
  if (input.register) {
    calls.push({
      to: input.registry,
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: "register",
        args: [input.label, input.owner, zeroAddress, input.resolver, NAME_ROLES, maxUint64],
      }),
    });
  }
  const setters = Object.entries(input.texts).map(([key, value]) =>
    encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [name, key, value] }),
  );
  calls.push({
    to: input.resolver,
    data: encodeFunctionData({ abi: resolverAbi, functionName: "multicall", args: [setters] }),
  });
  return calls;
}

export function labelId(label: string): bigint {
  return BigInt(labelhash(label));
}

/** `resolve` calldata for one text record of `name` (a resolver's or the Universal Resolver's). */
export function textQuery(name: string, key: string): { name: Hex; data: Hex } {
  return {
    name: dnsEncode(name),
    data: encodeFunctionData({
      abi: textProfileAbi,
      functionName: "text",
      args: [namehash(name), key],
    }),
  };
}
