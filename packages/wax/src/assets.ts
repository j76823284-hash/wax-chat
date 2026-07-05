/**
 * Precision-safe helpers for Antelope/WAX asset strings like "1.00000000 WAX".
 * All arithmetic uses BigInt on the integer representation to avoid float drift.
 */

export interface ParsedAsset {
  /** Integer value in the smallest unit (e.g. 100000000 for "1.00000000"). */
  value: bigint;
  precision: number;
  symbol: string;
}

export function parseAsset(input: string): ParsedAsset {
  const trimmed = input.trim();
  const [amountStr, symbol] = trimmed.split(/\s+/);
  if (!amountStr || !symbol) {
    throw new Error(`Invalid asset string: "${input}"`);
  }
  const negative = amountStr.startsWith("-");
  const unsigned = negative ? amountStr.slice(1) : amountStr;
  const dot = unsigned.indexOf(".");
  const precision = dot === -1 ? 0 : unsigned.length - dot - 1;
  const digits = unsigned.replace(".", "") || "0";
  if (!/^\d+$/.test(digits)) {
    throw new Error(`Invalid asset amount: "${input}"`);
  }
  const value = BigInt(digits) * (negative ? -1n : 1n);
  return { value, precision, symbol };
}

/** Format an integer value at a given precision to a fixed-decimal string. */
export function formatAmount(value: bigint, precision: number): string {
  const negative = value < 0n;
  const abs = (negative ? -value : value).toString().padStart(precision + 1, "0");
  if (precision === 0) return (negative ? "-" : "") + abs;
  const whole = abs.slice(0, abs.length - precision);
  const frac = abs.slice(abs.length - precision);
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Format an integer value into a full asset string ("1.00000000 WAX"). */
export function formatAsset(value: bigint, precision: number, symbol: string): string {
  return `${formatAmount(value, precision)} ${symbol}`;
}

/**
 * Convert a human decimal string ("1.5") to a fixed-precision asset string
 * ("1.50000000 WAX") without floating point. Extra fractional digits are
 * truncated (not rounded) to the token precision.
 */
export function toAssetString(amount: string, precision: number, symbol: string): string {
  const cleaned = amount.trim().replace(/,/g, "");
  if (cleaned === "" || cleaned === "-") throw new Error(`Invalid amount: "${amount}"`);
  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [wholeRaw = "0", fracRaw = ""] = unsigned.split(".");
  if (!/^\d*$/.test(wholeRaw) || !/^\d*$/.test(fracRaw)) {
    throw new Error(`Invalid amount: "${amount}"`);
  }
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const frac = (fracRaw + "0".repeat(precision)).slice(0, precision);
  const body = precision > 0 ? `${whole}.${frac}` : whole;
  return `${negative ? "-" : ""}${body} ${symbol}`;
}

/**
 * Human-friendly balance: trims trailing zeros but keeps the integer part,
 * e.g. formatBalanceDisplay(150000000n, 8) => "1.5", (100000000n,8) => "1".
 * Optionally caps the number of fractional digits shown.
 */
export function formatBalanceDisplay(value: bigint, precision: number, maxFractionDigits = precision): string {
  const full = formatAmount(value, precision);
  if (precision === 0) return full;
  const [whole, frac = ""] = full.split(".");
  const capped = frac.slice(0, Math.max(0, maxFractionDigits)).replace(/0+$/, "");
  return capped ? `${whole}.${capped}` : (whole as string);
}
