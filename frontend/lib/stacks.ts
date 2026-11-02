export const NETWORK: "testnet" | "mainnet" =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

export const API_URL =
  NETWORK === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";

type ContractId = `${string}.${string}`;

function contractId(envVar: string | undefined, fallback: ContractId): ContractId {
  const val = envVar ?? fallback;
  return val as ContractId;
}

// Live testnet deployment. Version suffixes exist because Clarity contracts are
// immutable and Stacks contract names cannot be reused; see README version history.
//
// The variable names changed with the move to v5. Vercel still holds the old
// NEXT_PUBLIC_CORE_CONTRACT / NEXT_PUBLIC_ORACLE_CONTRACT values pointing at v4
// and the admin oracle; new names keep those stale values from overriding.
const DEPLOYER = "ST14V779KZH7Q62TXJ1G6HZBP23PJT6CE25RFESB7";

export const CONTRACTS = {
  oracle: contractId(process.env.NEXT_PUBLIC_RHO_ORACLE, `${DEPLOYER}.pox-rate-oracle-trustless-v2`),
  core: contractId(process.env.NEXT_PUBLIC_RHO_CORE, `${DEPLOYER}.rho-core-v5-1`),
  sbtc: contractId(process.env.NEXT_PUBLIC_SBTC_CONTRACT, `${DEPLOYER}.mock-sbtc`),
};
