/**
 * A provider's text as it will be stored: no control characters, which Postgres can refuse, and
 * single spaces.
 */
export function cleanText(text: string) {
  const printable = Array.from(text, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? " " : character;
  }).join("");

  return printable.replace(/\s+/g, " ").trim();
}
