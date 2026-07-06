"use client";

/**
 * Small-print delayed-price footnote. The `*` ties back to the USD values
 * shown in token badges / wallet rows. Renders nothing when no price data
 * is available.
 */
export function PriceNote({
  fetchedAt,
  className,
}: {
  fetchedAt: string | null;
  className?: string;
}) {
  // Guard both `null` and the epoch/1970 sentinel the price API returns when the
  // upstream feed was unavailable — in that case there are no USD values to note.
  if (!fetchedAt || new Date(fetchedAt).getTime() <= 0) return null;
  return (
    <p className={`text-[10px] leading-tight text-neutral-600 ${className ?? ""}`}>
      * USD values are delayed — prices accurate as of {new Date(fetchedAt).toLocaleString()}.
    </p>
  );
}
