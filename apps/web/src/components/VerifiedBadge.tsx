/**
 * Issuer-verified channel badge: a scalloped "verified" seal with the channel's
 * token logo set in the centre (falls back to a checkmark when no logo).
 */
export function VerifiedBadge({
  logoUrl,
  size = 16,
  title = "Verified by the token issuer",
}: {
  logoUrl?: string | null;
  size?: number;
  title?: string;
}) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      title={title}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} className="absolute inset-0 text-wax-500">
        <path
          fill="currentColor"
          d="M12 1.5l2.35 1.7 2.9-.2 1 2.72 2.55 1.38-.7 2.82L22 12l-1.9 1.86.7 2.82-2.55 1.38-1 2.72-2.9-.2L12 22.5l-2.35-1.7-2.9.2-1-2.72-2.55-1.38.7-2.82L2 12l1.9-1.86-.7-2.82 2.55-1.38 1-2.72 2.9.2z"
        />
      </svg>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="relative rounded-full object-cover"
          style={{ width: size * 0.56, height: size * 0.56 }}
        />
      ) : (
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} className="relative text-neutral-950">
          <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M7 12.5l3.2 3.2L17 8.5" />
        </svg>
      )}
    </span>
  );
}
