"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import {
  getAccountNfts,
  nftTransferAction,
  toAssetString,
  transferAction,
  type NftAsset,
} from "@wax-chat/wax";
import { useAuth } from "@/app/providers";
import { chain } from "@/lib/wax";
import { useBalance, type BalanceResult } from "@/hooks/useBalance";
import { ProfilePicModal } from "@/components/ProfilePicModal";
import { PriceNote } from "@/components/PriceNote";
import { useToast } from "@/components/Toast";

interface WalletToken {
  contract: string;
  symbol: string;
  precision: number;
  asset: string;
  display: string;
  usdPrice: number | null;
  usdValue: number | null;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export default function WalletPage() {
  const { account, transact } = useAuth();

  if (!account) {
    return (
      <div className="flex flex-1 items-center justify-center text-neutral-600">
        Connect your WAX wallet to view your balances and NFTs.
      </div>
    );
  }
  return <WalletView account={account} transact={transact} />;
}

function WalletView({
  account,
  transact,
}: {
  account: string;
  transact: (actions: import("@wax-chat/wax").ActionObject[]) => Promise<{ transactionId: string }>;
}) {
  const wax = useBalance(account, { contract: "eosio.token", symbol: "WAX", precision: 8 });
  const { data: tokenData } = useSWR<{ tokens: WalletToken[]; pricesFetchedAt: string | null }>(
    `/api/wallet/tokens?account=${encodeURIComponent(account)}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const [nfts, setNfts] = useState<NftAsset[]>([]);
  const [nftQuery, setNftQuery] = useState("");
  const [nftDebounced, setNftDebounced] = useState("");
  const [nftPage, setNftPage] = useState(1);
  const [pickingPic, setPickingPic] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const NFT_PAGE = 24;
  const nftKey = useMemo(
    () => ["wallet-nfts", account, nftDebounced, nftPage] as const,
    [account, nftDebounced, nftPage],
  );
  const {
    data: nftBatch,
    error: nftError,
    isLoading: nftLoading,
    mutate: refreshNfts,
  } = useSWR(nftKey, ([, owner, match, page]) =>
    getAccountNfts(chain.atomicApi, owner, { limit: NFT_PAGE, page, match }),
  );

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setNftDebounced(nftQuery);
      setNftPage(1);
      setNfts([]);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [nftQuery]);

  useEffect(() => {
    if (!nftBatch) return;
    setNfts((prev) => {
      const next = nftPage === 1 ? [] : [...prev];
      const seen = new Set(next.map((n) => n.assetId));
      for (const nft of nftBatch) {
        if (!seen.has(nft.assetId)) next.push(nft);
      }
      return next;
    });
  }, [nftBatch, nftPage]);

  async function transferNft(asset: NftAsset) {
    const to = window.prompt(`Send "${asset.name}" to which WAX account?`);
    if (!to) return;
    try {
      await transact([nftTransferAction({ from: account, to: to.trim(), assetIds: [asset.assetId] })]);
      setNfts((prev) => prev.filter((n) => n.assetId !== asset.assetId));
      void mutate((key) => Array.isArray(key) && key[0] === "wallet-nfts", undefined, { revalidate: true });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Transfer failed");
    }
  }

  const tokens = tokenData?.tokens ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 overflow-y-auto p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Wallet</h1>
          <p className="truncate text-sm text-neutral-500">@{account} · {chain.network}</p>
        </div>
        <button
          onClick={() => setPickingPic(true)}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:border-wax-500"
        >
          Set profile picture
        </button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">WAX balance</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{wax ? wax.display : "…"} WAX</div>
        </div>
        <SendTokenCard account={account} transact={transact} tokens={tokens} wax={wax} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Tokens</h2>
        <div className="grid gap-1">
          {tokens.length === 0 ? (
            <p className="text-sm text-neutral-600">
              No tokens found (or Hyperion not configured for this network).
            </p>
          ) : (
            tokens.map((t) => (
              <div
                key={`${t.contract}:${t.symbol}`}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2"
              >
                <div>
                  <span className="font-medium">{t.symbol}</span>
                  <span className="ml-2 text-xs text-neutral-500">{t.contract}</span>
                </div>
                <div className="text-right">
                  <div className="tabular-nums">{t.display}</div>
                  {t.usdValue != null ? (
                    <div className="text-xs tabular-nums text-neutral-500">${t.usdValue.toFixed(2)}*</div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
        <PriceNote fetchedAt={tokenData?.pricesFetchedAt ?? null} className="mt-2" />
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">NFTs</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setNftPage(1);
                setNfts([]);
                void refreshNfts();
              }}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:border-wax-500"
            >
              Refresh
            </button>
            <input
              value={nftQuery}
              onChange={(e) => setNftQuery(e.target.value)}
              placeholder="Filter NFTs…"
              className="w-40 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-wax-500"
            />
          </div>
        </div>
        {nftError ? <p className="text-sm text-red-400">Could not load NFTs.</p> : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {nfts.map((n) => (
            <button
              key={n.assetId}
              onClick={() => transferNft(n)}
              className="group overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 text-left hover:border-wax-500"
              title="Click to transfer"
            >
              <div className="aspect-square bg-neutral-950">
                {n.image ? (
                  <NftImage src={n.image} alt={n.name} />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-600">
                    No image
                  </div>
                )}
              </div>
              <div className="p-2">
                <div className="truncate text-xs font-medium">{n.name}</div>
                <div className="truncate text-[11px] text-neutral-500">{n.collectionName}</div>
              </div>
            </button>
          ))}
          {nfts.length === 0 && !nftError && !nftLoading ? (
            <p className="col-span-full text-sm text-neutral-600">
              {nftDebounced ? "No matching NFTs." : "No NFTs in this wallet."}
            </p>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-center text-sm">
          <button
            onClick={() => setNftPage((p) => p + 1)}
            disabled={(nftBatch?.length ?? 0) < NFT_PAGE || nftLoading}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 disabled:opacity-40"
          >
            {nftLoading ? "Loading…" : "Load more"}
          </button>
        </div>
      </section>

      {pickingPic ? <ProfilePicModal account={account} onClose={() => setPickingPic(false)} /> : null}
    </div>
  );
}

function NftImage({ src, alt }: { src: string; alt: string }) {
  const [url, setUrl] = useState(src);
  const [attempt, setAttempt] = useState(0);
  const fallbacks = [
    src,
    src.replace("https://ipfs.io/ipfs/", "https://cloudflare-ipfs.com/ipfs/"),
    src.replace("https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"),
  ];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => {
        const next = attempt + 1;
        if (fallbacks[next] && fallbacks[next] !== url) {
          setAttempt(next);
          setUrl(fallbacks[next]);
        }
      }}
    />
  );
}

/** Stable option key for a token: `${contract}:${SYMBOL}`. */
const tokenKey = (t: { contract: string; symbol: string }) => `${t.contract}:${t.symbol}`;

function SendTokenCard({
  account,
  transact,
  tokens,
  wax,
}: {
  account: string;
  transact: (actions: import("@wax-chat/wax").ActionObject[]) => Promise<{ transactionId: string }>;
  tokens: WalletToken[];
  wax: BalanceResult | undefined;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [selKey, setSelKey] = useState("");
  const [busy, setBusy] = useState(false);

  // The user can only send what they hold, so the wallet's token list *is* the
  // full set of choices — no need to type a contract/symbol/precision by hand.
  // WAX is always offered even if Hyperion didn't return it.
  const options = useMemo<WalletToken[]>(() => {
    const list = [...tokens];
    if (!list.some((t) => t.contract === "eosio.token" && t.symbol === "WAX")) {
      list.unshift({
        contract: "eosio.token",
        symbol: "WAX",
        precision: 8,
        asset: wax?.amount ?? "0.00000000 WAX",
        display: wax?.display ?? "0",
        usdPrice: null,
        usdValue: null,
      });
    }
    return list;
  }, [tokens, wax]);

  const selected = options.find((t) => tokenKey(t) === selKey) ?? options[0];
  const maxAmount = selected ? (selected.asset.split(" ")[0] ?? "0") : "0";

  async function send() {
    if (!selected || !to.trim() || !amount.trim()) return;
    setBusy(true);
    try {
      const quantity = toAssetString(amount, selected.precision, selected.symbol);
      await transact([
        transferAction({ contract: selected.contract, from: account, to: to.trim(), quantity, memo: "" }),
      ]);
      toast({ variant: "success", title: "Sent ✓", description: `${quantity} → @${to.trim()}` });
      setAmount("");
      setTo("");
    } catch (e) {
      toast({
        variant: "error",
        title: "Transfer failed",
        description: e instanceof Error ? e.message : "The transfer was not sent.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Send tokens</div>
      <div className="space-y-2">
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="recipient.wam"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-wax-500"
        />
        <select
          value={selected ? tokenKey(selected) : ""}
          onChange={(e) => setSelKey(e.target.value)}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-wax-500"
        >
          {options.map((t) => (
            <option key={tokenKey(t)} value={tokenKey(t)}>
              {t.symbol} — {t.display} available
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="1.0"
            className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-wax-500"
          />
          <button
            type="button"
            onClick={() => setAmount(maxAmount)}
            className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:border-wax-500 hover:text-neutral-100"
          >
            Max
          </button>
        </div>
        <button
          onClick={send}
          disabled={busy || !selected || !to.trim() || !amount.trim()}
          className="w-full rounded-lg bg-wax-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-60"
        >
          {busy ? "Sending…" : selected ? `Send ${selected.symbol}` : "Send"}
        </button>
      </div>
    </div>
  );
}
