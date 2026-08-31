const CHAIN_ALIASES: Record<string, string> = {
  "1399811149": "solana",
  sol: "solana",
  solana: "solana",
  "solana-mainnet": "solana",
  "solana:mainnet": "solana",
  eth: "evm:1",
  ethereum: "evm:1",
  mainnet: "evm:1",
  base: "evm:8453",
  bsc: "evm:56",
  bnb: "evm:56",
  "bnb-chain": "evm:56",
  "binance-smart-chain": "evm:56",
  polygon: "evm:137",
  matic: "evm:137",
  "polygon-pos": "evm:137",
  arbitrum: "evm:42161",
  "arbitrum-one": "evm:42161",
  optimism: "evm:10",
  op: "evm:10",
  avalanche: "evm:43114",
  avax: "evm:43114",
  "avalanche-c-chain": "evm:43114",
  blast: "evm:81457",
  linea: "evm:59144",
  zksync: "evm:324",
  "zksync-era": "evm:324",
  scroll: "evm:534352",
  mantle: "evm:5000",
};

const GECKO_NETWORKS: Record<string, string> = {
  solana: "solana",
  "evm:1": "eth",
  "evm:10": "optimism",
  "evm:56": "bsc",
  "evm:137": "polygon_pos",
  "evm:324": "zksync",
  "evm:5000": "mantle",
  "evm:8453": "base",
  "evm:42161": "arbitrum",
  "evm:43114": "avax",
  "evm:59144": "linea",
  "evm:81457": "blast",
  "evm:534352": "scroll",
};

/** Converts Fomo, Mobula, and numeric chain identifiers into one stable identity. */
export function canonicalChainId(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  const alias = CHAIN_ALIASES[normalized];
  if (alias) return alias;
  const evm = normalized.match(/^(?:evm:|eip155:)?(\d+)$/);
  if (evm) return `evm:${Number(evm[1])}`;
  return normalized;
}

/** Returns the GeckoTerminal network slug for a supported Fomo chain. */
export function geckoNetworkForChainId(value: string | null | undefined): string | null {
  const canonical = canonicalChainId(value);
  return canonical ? GECKO_NETWORKS[canonical] ?? null : null;
}
