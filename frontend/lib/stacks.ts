export const NETWORK: "testnet" | "mainnet" =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

type ContractId = `${string}.${string}`;

function contractId(envVar: string | undefined, fallback: ContractId): ContractId {
  const val = envVar ?? fallback;
  return val as ContractId;
}

// Live testnet deployment. The oracle and core ship as -v2: the original pair
// carried a rate-precision defect that truncated every real PoX cycle to a rate
// of zero, and Stacks contract names cannot be reused. See README, "Why there is a v2".
const DEPLOYER = "ST14V779KZH7Q62TXJ1G6HZBP23PJT6CE25RFESB7";

export const CONTRACTS = {
  oracle: contractId(process.env.NEXT_PUBLIC_ORACLE_CONTRACT, `${DEPLOYER}.pox-rate-oracle-v2`),
  core: contractId(process.env.NEXT_PUBLIC_CORE_CONTRACT, `${DEPLOYER}.rho-core-v3`),
  sbtc: contractId(process.env.NEXT_PUBLIC_SBTC_CONTRACT, `${DEPLOYER}.mock-sbtc`),
};
