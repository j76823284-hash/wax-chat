/**
 * WAX chain configuration. Chain IDs are verified constants — do not edit
 * without cross-checking against https://validate.eosnation.io/wax/.
 */

export type WaxNetwork = "mainnet" | "testnet";

export interface ChainConfig {
  network: WaxNetwork;
  chainId: string;
  /** Chain (nodeos) API endpoint used for reads + TAPOS. */
  rpc: string;
  /** AtomicAssets REST API base. */
  atomicApi: string;
  /** Block explorer base URL. */
  explorer: string;
  /** Default AtomicHub marketplace base. */
  atomicHub: string;
}

export const CHAINS: Record<WaxNetwork, ChainConfig> = {
  mainnet: {
    network: "mainnet",
    chainId: "1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4",
    rpc: "https://wax.greymass.com",
    atomicApi: "https://wax.api.atomicassets.io",
    explorer: "https://waxblock.io",
    atomicHub: "https://atomichub.io",
  },
  testnet: {
    network: "testnet",
    chainId: "f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12",
    rpc: "https://testnet.waxsweden.org",
    atomicApi: "https://test.wax.api.atomicassets.io",
    explorer: "https://testnet.waxblock.io",
    atomicHub: "https://test.atomichub.io",
  },
};

export function resolveNetwork(value?: string | null): WaxNetwork {
  return value === "testnet" ? "testnet" : "mainnet";
}

/**
 * Build a ChainConfig from environment values, allowing per-endpoint overrides
 * while keeping the verified chain ID for the selected network.
 */
export function chainFromEnv(env: {
  network?: string | null;
  rpc?: string | null;
  atomicApi?: string | null;
}): ChainConfig {
  const base = CHAINS[resolveNetwork(env.network)];
  return {
    ...base,
    rpc: env.rpc || base.rpc,
    atomicApi: env.atomicApi || base.atomicApi,
  };
}
