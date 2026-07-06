"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  getAccountNfts,
  nftTransferAction,
  toAssetString,
  transferAction,
  type NftAsset,
} from "@wax-chat/wax";
import { useAuth } from "@/app/providers";
import { chain } from "@/lib/wax";
import { useBalance } from "@/hooks/useBalance";
import { ProfilePicModal } from "@/components/ProfilePicModal";
import { PriceNote } from "@/components/PriceNote";

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
  const [nftError, setNftError] = useState<string | null>(null);
  const [nftQuery, setNftQuery] = useState("");
  const [nftDebounced, setNftDebounced] = useState("");
  const [nftPage, setNftPage] = useState(1);
  const [nftHasNext, setNftHasNext] = useState(false);
  const [nftLoading, setNftLoading] = useState(false);
  const [pickingPic, setPickingPic] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const NFT_PAGE = 24;

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setNftDebounced(nftQuery);
      setNftPage(1);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [nftQuery]);

  useEffect(() => {
    let active = true;
    setNftLoading(true);
    setNftError(null);
    getAccountNfts(chain.atomicApi, account, { limit: NFT_PAGE, page: nftPage, match: nftDebounced })
      .then((data) => {
        if (!active) return;
        setNfts(data);
        setNftHasNext(data.length === NFT_PAGE);
      })
      .catch(() => active && setNftError("Could not load NFTs."))
      .finally(() => active && setNftLoading(false));
    return () => {
      active = false;
    };
  }, [account, nftPage, nftDebounced]);

  async function transferNft(asset: NftAsset) {
    const to = window.prompt(`Send "${asset.name}" to which WAX account?`);
    if (!to) return;
    try {
      await transact([nftTransferAction({ from: account, to: to.trim(), assetIds: [asset.assetId] })]);
      setNfts((prev) => prev.filter((n) => n.assetId !== asset.assetId));
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
        <SendTokenCard account={account} transact={transact} />
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
          <input
            value={nftQuery}
            onChange={(e) => setNftQuery(e.target.value)}
            placeholder="Filter NFTs…"
            className="w-40 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-wax-500"
          />
        </div>
        {nftError ? <p className="text-sm text-red-400">{nftError}</p> : null}
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.image} alt={n.name} className="h-full w-full object-cover" loading="lazy" />
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
        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            onClick={() => setNftPage((p) => Math.max(1, p - 1))}
            disabled={nftPage === 1 || nftLoading}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-xs text-neutral-500">{nftLoading ? "Loading…" : `Page ${nftPage}`}</span>
          <button
            onClick={() => setNftPage((p) => p + 1)}
            disabled={!nftHasNext || nftLoading}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </section>

      {pickingPic ? <ProfilePicModal account={account} onClose={() => setPickingPic(false)} /> : null}
    </div>
  );
}

function SendTokenCard({
  account,
  transact,
}: {
  account: string;
  transact: (actions: import("@wax-chat/wax").ActionObject[]) => Promise<{ transactionId: string }>;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [contract, setContract] = useState("eosio.token");
  const [symbol, setSymbol] = useState("WAX");
  const [precision, setPrecision] = useState("8");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!to.trim() || !amount.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const quantity = toAssetString(amount, Number(precision) || 0, symbol.trim().toUpperCase());
      const { transactionId } = await transact([
        transferAction({ contract: contract.trim(), from: account, to: to.trim(), quantity, memo: "" }),
      ]);
      setStatus(`Sent ${quantity} ✓ ${transactionId ? transactionId.slice(0, 8) : ""}`);
      setAmount("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Transfer failed");
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
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="1.0"
            className="w-24 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-wax-500"
          />
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="WAX"
            className="w-20 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm uppercase outline-none focus:border-wax-500"
          />
          <input
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            placeholder="eosio.token"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-wax-500"
          />
          <input
            value={precision}
            onChange={(e) => setPrecision(e.target.value)}
            inputMode="numeric"
            className="w-12 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-center text-sm outline-none focus:border-wax-500"
            title="precision"
          />
        </div>
        <button
          onClick={send}
          disabled={busy || !to.trim() || !amount.trim()}
          className="w-full rounded-lg bg-wax-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-wax-400 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send"}
        </button>
        {status ? <p className="text-xs text-neutral-300">{status}</p> : null}
      </div>
    </div>
  );
}
