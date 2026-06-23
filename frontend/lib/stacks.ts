export const NETWORK: "testnet" | "mainnet" =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

type ContractId = `${string}.${string}`;

function contractId(envVar: string | undefined, fallback: ContractId): ContractId {
  const val = envVar ?? fallback;
  return val as ContractId;
}

export const CONTRACTS = {
  oracle: contractId(process.env.NEXT_PUBLIC_ORACLE_CONTRACT, "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.pox-rate-oracle"),
  core: contractId(process.env.NEXT_PUBLIC_CORE_CONTRACT, "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.rho-core"),
  sbtc: contractId(process.env.NEXT_PUBLIC_SBTC_CONTRACT, "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.mock-sbtc"),
};
