export const NETWORK: "testnet" | "mainnet" =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

type ContractId = `${string}.${string}`;

function contractId(envVar: string | undefined, fallback: ContractId): ContractId {
  const val = envVar ?? fallback;
  return val as ContractId;
}

// Live testnet deployment. Version suffixes exist because Clarity contracts are
// immutable and Stacks contract names cannot be reused; see README version history.
const DEPLOYER = "ST14V779KZH7Q62TXJ1G6HZBP23PJT6CE25RFESB7";

export const CONTRACTS = {
  oracle: contractId(process.env.NEXT_PUBLIC_ORACLE_CONTRACT, `${DEPLOYER}.pox-rate-oracle-v2`),
  core: contractId(process.env.NEXT_PUBLIC_CORE_CONTRACT, `${DEPLOYER}.rho-core-v4`),
  sbtc: contractId(process.env.NEXT_PUBLIC_SBTC_CONTRACT, `${DEPLOYER}.mock-sbtc`),
};
