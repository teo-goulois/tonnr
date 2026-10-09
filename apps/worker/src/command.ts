// What a command says, and whether it did what was asked.
export type Outcome = { ok: boolean; lines: string[] };

export const refused = (...lines: string[]): Outcome => ({ ok: false, lines });

/** The one value a command takes, and whether `--write` came with it. Null when the rest is not that. */
export function readArguments(args: string[]) {
  // pnpm hands over the "--" that some people put before a command's own options.
  const given = args.filter((arg) => arg !== "--");
  const values = given.filter((arg) => !arg.startsWith("--"));
  const flags = given.filter((arg) => arg.startsWith("--"));
  const [value] = values;
  if (!value || values.length > 1 || flags.some((flag) => flag !== "--write")) return null;
  return { value, write: flags.includes("--write") };
}
