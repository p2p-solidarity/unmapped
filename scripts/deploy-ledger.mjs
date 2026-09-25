// Deploys UnwrittenLedger with the key in .env. Run it yourself — it spends gas:
//   UNWRITTEN_RPC_URL=… UNWRITTEN_CHAIN_ID=… UNWRITTEN_PRIVATE_KEY=0x… bun run contracts:deploy
// Then put the printed address in .env as UNWRITTEN_LEDGER_ADDRESS.
import { readFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

loadEnv({ quiet: true });
const rpcUrl = process.env.UNWRITTEN_RPC_URL;
const key = process.env.UNWRITTEN_PRIVATE_KEY;
const chainId = Number(process.env.UNWRITTEN_CHAIN_ID ?? "31337");
if (!rpcUrl || !key) {
  process.stderr.write(
    "Set UNWRITTEN_RPC_URL and UNWRITTEN_PRIVATE_KEY (and UNWRITTEN_CHAIN_ID).\n",
  );
  process.exit(1);
}
const artifact = JSON.parse(readFileSync("contracts/UnwrittenLedger.json", "utf8"));
const chain = defineChain({
  id: chainId,
  name: `chain-${chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
process.stdout.write(`Deploying UnwrittenLedger as ${account.address} on chain ${chainId}…\n`);
const txHash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode });
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
process.stdout.write(`UNWRITTEN_LEDGER_ADDRESS=${receipt.contractAddress}\n`);
process.stdout.write(`tx ${txHash} in block ${receipt.blockNumber}\n`);
