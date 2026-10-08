const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * The number a text holds, written in decimal. NaN for an empty text or "NaN", which providers
 * write for a missing value. Null for any other text: `Number` alone would read "0x10" as 16 and
 * an empty text as zero, and a provider that starts writing "5,3" must be noticed, not stored as
 * a missing value.
 */
export function parseDecimal(text: string) {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === "NaN") return Number.NaN;
  return DECIMAL.test(trimmed) ? Number(trimmed) : null;
}
