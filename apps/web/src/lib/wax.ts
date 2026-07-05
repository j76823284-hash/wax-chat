"use client";

import type { SessionKit } from "@wharfkit/session";
import { chainFromEnv } from "@wax-chat/wax";
import { createSessionKit } from "@wax-chat/wax/session";
import { clientEnv } from "./env";

export const chain = chainFromEnv({
  network: clientEnv.network,
  rpc: clientEnv.rpc,
  atomicApi: clientEnv.atomicApi,
});

let kit: SessionKit | null = null;

/** Lazily create the WharfKit SessionKit (browser-only). */
export function getSessionKit(): SessionKit {
  if (!kit) {
    kit = createSessionKit(chain, clientEnv.appName);
  }
  return kit;
}
