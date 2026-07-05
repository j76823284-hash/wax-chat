/**
 * WharfKit SessionKit factory. Browser-only (pulls in @wharfkit/web-renderer),
 * so import this from client components only.
 *
 * WharfKit is the sole signing SDK — no eosjs / WaxJS. The Resource Provider
 * transact plugin lets zero-CPU MyCloudWallet users transact without failing.
 */

import { SessionKit } from "@wharfkit/session";
import { WebRenderer } from "@wharfkit/web-renderer";
import { WalletPluginCloudWallet } from "@wharfkit/wallet-plugin-cloudwallet";
import { WalletPluginAnchor } from "@wharfkit/wallet-plugin-anchor";
import { TransactPluginResourceProvider } from "@wharfkit/transact-plugin-resource-provider";

import type { ChainConfig } from "./chains";

export function createSessionKit(chain: ChainConfig, appName = "WaxChat"): SessionKit {
  return new SessionKit(
    {
      appName,
      chains: [{ id: chain.chainId, url: chain.rpc }],
      ui: new WebRenderer(),
      // The CloudWallet plugin only advertises the WAX mainnet chain, so on
      // testnet WharfKit simply won't offer it — use Anchor there.
      walletPlugins: [new WalletPluginCloudWallet(), new WalletPluginAnchor()],
    },
    {
      transactPlugins: [new TransactPluginResourceProvider()],
    },
  );
}
