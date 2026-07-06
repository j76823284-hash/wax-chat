/**
 * AtomicAssets NFT reads via the public REST API (works everywhere fetch does).
 */

export interface NftAsset {
  assetId: string;
  name: string;
  collectionName: string;
  collectionImage?: string;
  templateId?: string;
  schemaName?: string;
  image?: string;
  video?: string;
  data: Record<string, unknown>;
}

const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

/** Resolve an AtomicAssets image field (ipfs hash or url) to a fetchable URL. */
export function resolveMedia(value?: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("Qm") || value.startsWith("bafy") || value.startsWith("baf")) {
    return `${IPFS_GATEWAY}${value}`;
  }
  return undefined;
}

interface RawAtomicAsset {
  asset_id: string;
  name?: string;
  collection?: { collection_name?: string; name?: string; img?: string };
  template?: { template_id?: string } | null;
  schema?: { schema_name?: string };
  data?: Record<string, unknown>;
  immutable_data?: Record<string, unknown>;
  mutable_data?: Record<string, unknown>;
}

function normalizeAsset(a: RawAtomicAsset): NftAsset {
  const data = { ...(a.immutable_data ?? {}), ...(a.data ?? {}), ...(a.mutable_data ?? {}) };
  return {
    assetId: a.asset_id,
    name: a.name ?? (data.name as string) ?? `#${a.asset_id}`,
    collectionName: a.collection?.collection_name ?? "",
    collectionImage: resolveMedia(a.collection?.img),
    templateId: a.template?.template_id ?? undefined,
    schemaName: a.schema?.schema_name,
    image: resolveMedia(data.img) ?? resolveMedia(data.image),
    video: resolveMedia(data.video),
    data,
  };
}

export interface GetNftsOptions {
  page?: number;
  limit?: number;
  collection?: string;
  /** Free-text search across asset/template names (AtomicAssets `match`). */
  match?: string;
}

export async function getAccountNfts(
  atomicApi: string,
  owner: string,
  { page = 1, limit = 40, collection, match }: GetNftsOptions = {},
): Promise<NftAsset[]> {
  const params = new URLSearchParams({
    owner,
    page: String(page),
    limit: String(limit),
    order: "desc",
    sort: "asset_id",
  });
  if (collection) params.set("collection_name", collection);
  if (match && match.trim()) params.set("match", match.trim());
  const url = `${atomicApi.replace(/\/+$/, "")}/atomicassets/v1/assets?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AtomicAssets API failed: ${res.status}`);
  const json = (await res.json()) as { data?: RawAtomicAsset[] };
  return (json.data ?? []).map(normalizeAsset);
}
