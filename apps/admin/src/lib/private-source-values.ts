/** A source address can be opened deliberately, never loaded as a media or HTML resource. */
export function publicSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim() || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    // Source exports may contain local paths and internal addresses. Only a public-looking
    // domain is offered as a link; the untouched value remains in the original JSON as text.
    if (
      !host.includes(".") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":") ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example)$/.test(host)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

/** JSON is always passed to React as text, including values resembling HTML or URLs. */
export function sourceJsonText(value: unknown) {
  return JSON.stringify(value, null, 2) ?? "null";
}

/** Keep a source timestamp's declared timezone and precision; do not invent a missing one. */
export function sourceDateText(value: string | Date | null | undefined) {
  return value instanceof Date ? value.toISOString() : value || null;
}

/** Search controls and manually typed route parameters follow the RPC's text bounds. */
export function withoutSourceSearchControls(value: string) {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join("");
}
