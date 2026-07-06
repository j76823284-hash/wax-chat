"use client";

import { useEffect, useRef, useState } from "react";
import { getAccountNfts, type NftAsset } from "@wax-chat/wax";
import { chain } from "@/lib/wax";

const PAGE_SIZE = 24;

/**
 * Searchable, paginated grid of the NFTs an account owns (Telegram-GIF-style
 * picker). Used to choose a profile picture and to pick an NFT for a gift link.
 */
export function NftPicker({
  account,
  onSelect,
  selectedId,
}: {
  account: string;
  onSelect: (nft: NftAsset) => void;
  selectedId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<NftAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the search box, and reset to page 1 on a new query.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDebounced(query);
      setPage(1);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getAccountNfts(chain.atomicApi, account, { page, limit: PAGE_SIZE, match: debounced })
      .then((data) => {
        if (!active) return;
        setItems(data);
        setHasNext(data.length === PAGE_SIZE);
      })
      .catch(() => active && setError("Could not load NFTs."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [account, page, debounced]);

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your NFTs…"
        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-wax-500"
      />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
        {items.map((n) => (
          <button
            key={n.assetId}
            onClick={() => onSelect(n)}
            className={`group overflow-hidden rounded-lg border text-left transition ${
              selectedId === n.assetId
                ? "border-wax-500 ring-2 ring-wax-500/40"
                : "border-neutral-800 hover:border-wax-500"
            }`}
            title={n.name}
          >
            <div className="aspect-square bg-neutral-950">
              {n.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.image} alt={n.name} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-neutral-600">
                  No image
                </div>
              )}
            </div>
            <div className="truncate px-1.5 py-1 text-[10px] text-neutral-400">{n.name}</div>
          </button>
        ))}
        {!loading && items.length === 0 ? (
          <p className="col-span-full py-6 text-center text-sm text-neutral-600">
            {debounced ? "No matches." : "No NFTs in this wallet."}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-sm">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-xs text-neutral-500">{loading ? "Loading…" : `Page ${page}`}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasNext || loading}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
