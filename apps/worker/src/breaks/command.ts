import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Database } from "@repo/db";
import { Effect, Result } from "effect";

import { type Outcome, readArguments, refused } from "../command";
import { FormatError } from "../providers/format-error";
import { readBreaks } from "./file";
import { addBreaks, breakSources, countBreaks, removeBreaks } from "./import";

const breaks = (count: number) => `${count} ${count === 1 ? "break" : "breaks"}`;
const spots = (count: number) => `${count} ${count === 1 ? "spot" : "spots"}`;

type Added = Effect.Success<ReturnType<typeof addBreaks>>;

function said(found: Added, write: boolean, again: string): string[] {
  const { provider, listed, added, known } = found;
  const lines = [
    `breaks: ${provider} lists ${breaks(listed)}. ${added} ${write ? "added" : "to add"}, ${known} already in the catalogue and left as they are.`,
  ];
  if (!write) lines.push(`Nothing was stored. Run it again with --write to store it: ${again}`);
  else if (added === 0) lines.push("Nothing was stored: the catalogue already holds them all.");
  return lines;
}

/**
 * `job breaks <file> [--write]`: checks a file of breaks and says what adding it would change.
 * With `--write` it adds them. The file is read from the path, and nothing is fetched.
 */
export async function addBreaksFile(db: Database, args: string[]): Promise<Outcome> {
  const read = readArguments(args);
  if (!read) return refused("Usage: job breaks <file> [--write]");

  // pnpm runs the command in the worker's folder, and says where it was called from.
  const file = path.resolve(process.env.INIT_CWD ?? process.cwd(), read.value);
  let text: string;
  try {
    // A byte that is not UTF-8 refuses the file, where the default would replace it.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(await readFile(file));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return refused(`${file} could not be read: ${reason}`);
  }

  const list = readBreaks(text);
  if (list instanceof FormatError) {
    return refused("The file was refused, and nothing was stored:", list.message);
  }

  const found = await Effect.runPromise(addBreaks(db, list, { write: read.write }));
  return { ok: true, lines: said(found, read.write, `job breaks ${read.value} --write`) };
}

/**
 * `job breaks-fetch <source> [--write]`: asks a source for its list, once, and says how many
 * breaks it gives. With `--write` it adds them, to a catalogue that holds none: a place that
 * two lists give would stand twice.
 */
export async function fetchBreaks(db: Database, args: string[]): Promise<Outcome> {
  const read = readArguments(args);
  const source = breakSources.find((candidate) => candidate.id === read?.value);
  if (!read || !source) {
    const names = breakSources.map((candidate) => candidate.id).join("|");
    return refused(`Usage: job breaks-fetch <${names}> [--write]`);
  }

  const full = (held: number) =>
    refused(
      `The catalogue already holds ${breaks(held)}, and nothing was stored: a place that two lists give would stand twice.`,
      'Empty it first with "job breaks-remove <list>", or keep it as it is.',
    );
  // Asked before the source is: its servers are shared, and a full catalogue takes nothing.
  const held = await Effect.runPromise(countBreaks(db));
  if (held > 0) return full(held);

  const fetched = await Effect.runPromise(Effect.result(source.fetchBreaks));
  if (Result.isFailure(fetched)) {
    const { failure } = fetched;
    const reason =
      failure._tag === "FormatError"
        ? failure.message
        : failure.status
          ? `its server answered ${failure.status}`
          : "its server did not answer";
    return refused(
      `${source.id} did not give its list: ${reason}. Nothing was stored. A shared server is often busy: try again later.`,
    );
  }
  const { breaks: listed, unreadable } = fetched.success;
  if (listed.length === 0) return refused(`${source.id} lists no break.`);

  const list = {
    provider: source.id,
    license: source.license,
    attribution: source.attribution,
    breaks: listed,
  };
  const found = await Effect.runPromise(
    addBreaks(db, list, { write: read.write, intoEmpty: true }),
  );
  // A list added while the source answered.
  if (found.isRefused) return full(found.inCatalogue);

  const lines = said(found, read.write, `job breaks-fetch ${source.id} --write`);
  if (unreadable.length > 0) {
    lines.push(`${breaks(unreadable.length)} of the source could not be read, and were left out.`);
  }
  return { ok: true, lines };
}

/**
 * `job breaks-remove <list> [--write]`: says how many breaks the catalogue holds from a list.
 * With `--write` it deletes them.
 */
export async function removeBreaksOf(db: Database, args: string[]): Promise<Outcome> {
  const read = readArguments(args);
  if (!read) return refused("Usage: job breaks-remove <list> [--write]");

  const found = await Effect.runPromise(removeBreaks(db, read.value, { write: read.write }));
  if (found.removed === 0) return refused(`The catalogue holds no break of "${read.value}".`);

  const what = `${breaks(found.removed)} of ${read.value}`;
  const linked =
    found.spots > 0
      ? [
          `${spots(found.spots)} made from them ${read.write ? "kept" : "would keep"} their name and their point, without the link.`,
        ]
      : [];
  return {
    ok: true,
    lines: read.write
      ? [`breaks: deleted ${what}.`, ...linked]
      : [
          `breaks: ${what} would be deleted.`,
          ...linked,
          "Nothing was deleted. Run it again with --write to delete them.",
        ],
  };
}
