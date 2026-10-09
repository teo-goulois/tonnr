import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Database } from "@repo/db";
import { Effect } from "effect";

import { FormatError } from "../providers/format-error";
import { readPrivateBreaks } from "./file";
import { importPrivateBreaks, removePrivateImport } from "./import";

// What a command says, and whether it did what was asked.
type Outcome = { ok: boolean; lines: string[] };

const refused = (...lines: string[]): Outcome => ({ ok: false, lines });
const breaks = (count: number) => `${count} ${count === 1 ? "break" : "breaks"}`;

/** The one value a command takes, and whether `--write` came with it. Null when the rest is not that. */
function readArguments(args: string[]) {
  // pnpm hands over the "--" that some people put before a command's own options.
  const given = args.filter((arg) => arg !== "--");
  const values = given.filter((arg) => !arg.startsWith("--"));
  const flags = given.filter((arg) => arg.startsWith("--"));
  const [value] = values;
  if (!value || values.length > 1 || flags.some((flag) => flag !== "--write")) return null;
  return { value, write: flags.includes("--write") };
}

/**
 * `job private-breaks <file> [--write]`: checks a file of breaks and says what storing it would
 * change. With `--write` it stores it. The file is read from the path, and nothing is fetched.
 */
export async function importPrivateFile(db: Database, args: string[]): Promise<Outcome> {
  const read = readArguments(args);
  if (!read) return refused("Usage: job private-breaks <file> [--write]");

  // pnpm runs the command in the worker's folder, and says where it was called from.
  const file = path.resolve(process.env.INIT_CWD ?? process.cwd(), read.value);
  let bytes: Buffer;
  let text: string;
  try {
    bytes = await readFile(file);
    // A byte that is not UTF-8 refuses the file, where the default would replace it.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return refused(`${file} could not be read: ${reason}`);
  }

  const list = readPrivateBreaks(text);
  if (list instanceof FormatError) {
    return refused("The file was refused, and nothing was stored:", list.message);
  }

  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  const found = await Effect.runPromise(
    importPrivateBreaks(db, list, { fileSha256, write: read.write }),
  );
  const { importId, provider, listed, added, changed, unchanged, absent } = found;
  const counts = read.write
    ? `${added} added, ${changed} changed, ${unchanged} unchanged`
    : `${added} to add, ${changed} to change, ${unchanged} unchanged`;
  const lines = [`private-breaks: ${provider} lists ${breaks(listed)}. ${counts}.`];
  if (absent > 0) {
    lines.push(`The file leaves out ${breaks(absent)} stored for ${provider}. Nothing is deleted.`);
  }
  if (importId) {
    lines.push(
      `Stored as import ${importId}. "job private-breaks-remove ${importId}" deletes the breaks it added.`,
    );
  } else if (read.write) {
    lines.push("Nothing was stored: the database already holds what the file says.");
  } else {
    lines.push("Nothing was stored. Run it again with --write to store it.");
  }
  return { ok: true, lines };
}

/**
 * `job private-breaks-remove <import> [--write]`: says how many breaks an import added. With
 * `--write` it deletes them, and the import.
 */
export async function removePrivateFile(db: Database, args: string[]): Promise<Outcome> {
  const read = readArguments(args);
  if (!read) return refused("Usage: job private-breaks-remove <import> [--write]");

  const found = await Effect.runPromise(removePrivateImport(db, read.value, { write: read.write }));
  if (!found) return refused(`No import "${read.value}".`);

  const what = `${breaks(found.removed)} that the import of ${found.importedAt.toISOString()} added for ${found.provider}`;
  return {
    ok: true,
    lines: read.write
      ? [`private-breaks: deleted ${what}, and the import.`]
      : [
          `private-breaks: ${what} would be deleted.`,
          "Nothing was deleted. Run it again with --write to delete them.",
        ],
  };
}
