import type { Database } from "@repo/db";
import { knownRefs } from "@repo/db/catalogue";
import {
  breakCandidate,
  breakCandidateImage,
  CANDIDATE_ACTIONS,
  type CandidateEvidence,
  type CandidateFigure,
  type CandidateProposal,
  type CandidateText,
} from "@repo/db/schema/catalogue";
import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";

import type { FormatError } from "../providers/format-error";
import { isPosition } from "../providers/plausible";
import { StoreError } from "../store";
import {
  isLabel,
  isRecord,
  isWebAddress,
  PROVIDER,
  readCharacteristics,
  refused,
  unknownKeys,
  unstorable,
} from "./file";
import { inTransaction } from "./import";
import type { Characteristics } from "./source";

// The breaks a list proposes to the catalogue, which an operator decides one at a time from the
// admin: decision 049. A file of them is prepared outside this repository, as a file of breaks
// is, and its pictures lie in a folder beside it.

const FILE_KEYS = ["list", "candidates"];
const CANDIDATE_KEYS = [
  "ref",
  "name",
  "location",
  "latitude",
  "longitude",
  "pointNote",
  "pointUrl",
  "characteristics",
  "proposal",
  "evidence",
  "texts",
  "figures",
  "details",
];
const MAX_REF_LENGTH = 200;
const MAX_PLACES = 10;
// A text of the list, such as a description in one language.
const MAX_TEXT_LENGTH = 10_000;
// A note of whoever prepared the list, and each of its doubts.
const MAX_NOTE_LENGTH = 4_000;
const MAX_ITEMS = 50;
// A picture's name, as the folder holds it.
export const IMAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(jpe?g|png|webp)$/;
// Candidates a statement takes: what each holds can weigh tens of kilobytes.
const CANDIDATES_PER_STATEMENT = 200;

/** A break a list proposes, as the file gives it. */
export type ListedCandidate = {
  ref: string;
  name: string;
  location: string[] | null;
  latitude: number | null;
  longitude: number | null;
  pointNote: string | null;
  pointUrl: string | null;
  characteristics: Characteristics | null;
  proposal: CandidateProposal | null;
  evidence: CandidateEvidence[];
  texts: CandidateText[];
  figures: CandidateFigure[];
  details: Record<string, unknown> | null;
};

export type CandidateList = { list: string; candidates: ListedCandidate[] };

const isText = (value: unknown, most: number): value is string =>
  typeof value === "string" && value.trim() !== "" && value.length <= most;

/** A box of a picture, in fractions of it: left, top, right, bottom. */
function isBox(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((side) => typeof side === "number" && side >= 0 && side <= 1) &&
    value[0] < value[2] &&
    value[1] < value[3]
  );
}

function readProposal(given: unknown): CandidateProposal | string[] {
  if (!isRecord(given)) return ['"proposal", when given, must be an object'];
  const faults: string[] = [];
  const { action, breakId, others, name, note, doubts } = given;
  if (!(CANDIDATE_ACTIONS as readonly unknown[]).includes(action)) {
    faults.push(`"proposal.action" must be one of: ${CANDIDATE_ACTIONS.join(", ")}`);
  }
  if (breakId !== undefined && !isLabel(breakId)) {
    faults.push('"proposal.breakId", when given, must be the id of a break');
  }
  const hasOthers =
    others === undefined ||
    (Array.isArray(others) && others.length <= MAX_ITEMS && others.every(isLabel));
  if (!hasOthers) faults.push('"proposal.others", when given, must be a list of ids of breaks');
  if (action === "merge" && breakId === undefined) {
    faults.push('"proposal.breakId" must name the break to merge into');
  }
  if (name !== undefined && !isLabel(name)) faults.push('"proposal.name" must be a short text');
  if (note !== undefined && !isText(note, MAX_NOTE_LENGTH)) {
    faults.push(`"proposal.note" must be a text of at most ${MAX_NOTE_LENGTH} characters`);
  }
  const hasDoubts =
    doubts === undefined ||
    (Array.isArray(doubts) &&
      doubts.length <= MAX_ITEMS &&
      doubts.every((doubt) => isText(doubt, MAX_NOTE_LENGTH)));
  if (!hasDoubts) faults.push('"proposal.doubts" must be a list of short texts');
  const unknown = unknownKeys(given, ["action", "breakId", "others", "name", "note", "doubts"]);
  if (unknown.length > 0) faults.push(`unknown fields of "proposal": ${unknown.join(", ")}`);
  if (faults.length > 0) return faults;
  return {
    action: action as CandidateProposal["action"],
    ...(typeof breakId === "string" ? { breakId } : {}),
    ...(Array.isArray(others) ? { others: others as string[] } : {}),
    ...(typeof name === "string" ? { name } : {}),
    ...(typeof note === "string" ? { note } : {}),
    ...(Array.isArray(doubts) ? { doubts: doubts as string[] } : {}),
  };
}

/** Each item of a list of objects, or the faults that name it. */
function readItems<Item>(
  field: string,
  given: unknown,
  keys: string[],
  read: (item: Record<string, unknown>) => Item | null,
): Item[] | string[] {
  if (given === undefined) return [];
  if (!Array.isArray(given) || given.length > MAX_ITEMS) {
    return [`"${field}", when given, must be a list of at most ${MAX_ITEMS} objects`];
  }
  const items: Item[] = [];
  const faults: string[] = [];
  for (const [index, item] of given.entries()) {
    const found = isRecord(item) && unknownKeys(item, keys).length === 0 ? read(item) : null;
    if (found === null) faults.push(`"${field}" ${index + 1} must hold ${keys.join(", ")} as said`);
    else items.push(found);
  }
  return faults.length > 0 ? faults : items;
}

/** One line of the file as a candidate, or its faults in words that name the field. */
function readCandidate(line: Record<string, unknown>): ListedCandidate | string[] {
  const { ref, name, location, latitude, longitude, pointNote, pointUrl, details } = line;
  const faults: string[] = [];

  const hasRef =
    typeof ref === "string" && ref !== "" && ref === ref.trim() && ref.length <= MAX_REF_LENGTH;
  if (!hasRef) faults.push(`"ref" must be a text of 1 to ${MAX_REF_LENGTH} characters`);
  if (!isLabel(name)) faults.push('"name" must be a short text, with no space around');
  const hasLocation =
    location === undefined ||
    (Array.isArray(location) &&
      location.length > 0 &&
      location.length <= MAX_PLACES &&
      location.every(isLabel));
  if (!hasLocation) faults.push(`"location", when given, must list 1 to ${MAX_PLACES} places`);
  const hasPoint =
    (latitude === undefined && longitude === undefined) ||
    (typeof latitude === "number" &&
      typeof longitude === "number" &&
      isPosition(latitude, longitude));
  if (!hasPoint)
    faults.push('"latitude" and "longitude", when given, must be a point on the globe');
  if (pointNote !== undefined && !isText(pointNote, MAX_NOTE_LENGTH)) {
    faults.push('"pointNote", when given, must be a short text');
  }
  if (pointUrl !== undefined && !isWebAddress(pointUrl)) {
    faults.push('"pointUrl", when given, must be an http or https address');
  }
  if (details !== undefined && !isRecord(details)) {
    faults.push('"details", when given, must be an object');
  }

  const characteristics =
    line.characteristics === undefined ? {} : readCharacteristics(line.characteristics);
  if (Array.isArray(characteristics)) faults.push(...characteristics);
  const proposal = line.proposal === undefined ? null : readProposal(line.proposal);
  if (Array.isArray(proposal)) faults.push(...proposal);

  const evidence = readItems<CandidateEvidence>(
    "evidence",
    line.evidence,
    ["url", "title", "note"],
    ({ url, title, note }) =>
      isWebAddress(url) &&
      (title === undefined || isText(title, 300)) &&
      (note === undefined || isText(note, MAX_NOTE_LENGTH))
        ? {
            url,
            ...(typeof title === "string" ? { title } : {}),
            ...(typeof note === "string" ? { note } : {}),
          }
        : null,
  );
  const texts = readItems<CandidateText>(
    "texts",
    line.texts,
    ["label", "language", "text"],
    ({ label, language, text }) =>
      isLabel(label) &&
      (language === undefined || (typeof language === "string" && /^[a-z]{2}$/.test(language))) &&
      isText(text, MAX_TEXT_LENGTH)
        ? { label, ...(typeof language === "string" ? { language } : {}), text }
        : null,
  );
  const figures = readItems<CandidateFigure>(
    "figures",
    line.figures,
    ["image", "crop", "mark", "caption"],
    ({ image, crop, mark, caption }) =>
      typeof image === "string" &&
      IMAGE_NAME.test(image) &&
      (crop === undefined || isBox(crop)) &&
      (mark === undefined || isBox(mark)) &&
      (caption === undefined || isLabel(caption))
        ? {
            image,
            ...(isBox(crop) ? { crop } : {}),
            ...(isBox(mark) ? { mark } : {}),
            ...(typeof caption === "string" ? { caption } : {}),
          }
        : null,
  );
  for (const read of [evidence, texts, figures]) {
    if (read.some((item) => typeof item === "string")) faults.push(...(read as string[]));
  }

  const unknown = unknownKeys(line, CANDIDATE_KEYS);
  if (unknown.length > 0) faults.push(`unknown fields: ${unknown.join(", ")}`);
  const unstored = unstorable(line);
  if (unstored) faults.push(`${unstored}, which cannot be stored`);

  if (faults.length > 0 || Array.isArray(characteristics) || Array.isArray(proposal)) {
    return faults;
  }
  return {
    ref: ref as string,
    name: name as string,
    location: (location as string[] | undefined) ?? null,
    latitude: (latitude as number | undefined) ?? null,
    longitude: (longitude as number | undefined) ?? null,
    pointNote: (pointNote as string | undefined) ?? null,
    pointUrl: (pointUrl as string | undefined) ?? null,
    characteristics: Object.keys(characteristics).length > 0 ? characteristics : null,
    proposal,
    evidence: evidence as CandidateEvidence[],
    texts: texts as CandidateText[],
    figures: figures as CandidateFigure[],
    details: (details as Record<string, unknown> | undefined) ?? null,
  };
}

/**
 * Reads the content of a file of candidates. Every line is checked, and one fault refuses the
 * file: nothing of it is stored unless all of it can be.
 */
export function parseCandidates(json: unknown): CandidateList | FormatError {
  if (!isRecord(json)) return refused(["the file must hold one object"]);
  const { list } = json;
  const lines = Array.isArray(json.candidates) ? json.candidates : [];
  const problems: string[] = [];

  const hasList = typeof list === "string" && PROVIDER.test(list);
  if (!hasList) problems.push('"list" must be a short name in lower case, as "example"');
  if (lines.length === 0) problems.push('"candidates" must be a list of one candidate or more');
  const unknown = unknownKeys(json, FILE_KEYS);
  if (unknown.length > 0) problems.push(`unknown fields: ${unknown.join(", ")}`);

  const candidates: ListedCandidate[] = [];
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const at = `candidate ${index + 1}`;
    if (!isRecord(line)) {
      problems.push(`${at}: must be an object`);
      continue;
    }
    const found = readCandidate(line);
    if (Array.isArray(found)) {
      const named = typeof line.ref === "string" ? `${at} (${line.ref.slice(0, 40)})` : at;
      problems.push(...found.map((fault) => `${named}: ${fault}`));
    } else if (seen.has(found.ref)) {
      problems.push(`${at} (${found.ref.slice(0, 40)}): its reference is given twice`);
    } else {
      seen.add(found.ref);
      candidates.push(found);
    }
  }

  if (problems.length > 0 || !hasList) return refused(problems);
  return { list, candidates };
}

/** The names of the pictures a list's candidates show. */
export function imagesOf(found: CandidateList) {
  return [
    ...new Set(found.candidates.flatMap((candidate) => candidate.figures.map((f) => f.image))),
  ];
}

export type Picture = { name: string; contentType: string; bytes: Buffer };

const failed = (cause: unknown) => new StoreError({ provider: "candidates", cause });

/** A value as text, its objects' keys in order: the database gives them back in its own. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// What a file says of a candidate, beside its list and its reference.
type Content = Omit<ListedCandidate, "ref">;

const contentOf = (candidate: ListedCandidate): Content => {
  const { ref: _ref, ...content } = candidate;
  return content;
};

const storedContentOf = (row: typeof breakCandidate.$inferSelect): Content => ({
  name: row.name,
  location: row.location,
  latitude: row.latitude,
  longitude: row.longitude,
  pointNote: row.pointNote,
  pointUrl: row.pointUrl,
  characteristics: row.characteristics as Characteristics | null,
  proposal: row.proposal,
  evidence: row.evidence,
  texts: row.texts,
  figures: row.figures,
  details: row.details,
});

/**
 * Stores a list's candidates and their pictures, all of them or none. A new one waits. One that
 * waits, or was put off, takes what the file says of it now. One an operator decided is left as
 * it is, and so is one whose reference the catalogue knows already, as a break or as one that
 * was: it is not proposed again. Without `write`, the same work is done and undone.
 */
export const storeCandidates = Effect.fn("storeCandidates")(function* (
  db: Database,
  found: CandidateList,
  pictures: Picture[],
  options: { write: boolean },
) {
  return yield* Effect.tryPromise({
    try: () =>
      inTransaction(db, async (tx) => {
        const refs = found.candidates.map((candidate) => candidate.ref);
        const stored = new Map<string, typeof breakCandidate.$inferSelect>();
        for (let start = 0; start < refs.length; start += 5_000) {
          const rows = await tx
            .select()
            .from(breakCandidate)
            .where(
              and(
                eq(breakCandidate.list, found.list),
                inArray(breakCandidate.ref, refs.slice(start, start + 5_000)),
              ),
            )
            // An operator who decides one meanwhile waits, or is waited for: what was decided
            // is never written over.
            .for("update");
          for (const row of rows) stored.set(row.ref, row);
        }
        const known = await knownRefs(tx, found.list, refs);

        const report = {
          list: found.list,
          listed: found.candidates.length,
          added: 0,
          refreshed: 0,
          unchanged: 0,
          decided: 0,
          known: 0,
          pictures: pictures.length,
        };
        const fresh = [];
        const now = new Date();
        for (const candidate of found.candidates) {
          const row = stored.get(candidate.ref);
          const content = contentOf(candidate);
          if (!row) {
            if (known.has(candidate.ref)) report.known += 1;
            else {
              fresh.push({
                id: crypto.randomUUID(),
                list: found.list,
                ref: candidate.ref,
                ...content,
              });
              report.added += 1;
            }
          } else if (row.status !== "waiting" && row.status !== "later") report.decided += 1;
          else if (stable(storedContentOf(row)) === stable(content)) report.unchanged += 1;
          else {
            await tx
              .update(breakCandidate)
              .set({ ...content, updatedAt: now })
              .where(eq(breakCandidate.id, row.id));
            report.refreshed += 1;
          }
        }
        for (let start = 0; start < fresh.length; start += CANDIDATES_PER_STATEMENT) {
          await tx
            .insert(breakCandidate)
            .values(fresh.slice(start, start + CANDIDATES_PER_STATEMENT));
        }
        for (const picture of pictures) {
          await tx
            .insert(breakCandidateImage)
            .values({ list: found.list, ...picture })
            .onConflictDoUpdate({
              target: [breakCandidateImage.list, breakCandidateImage.name],
              set: { contentType: picture.contentType, bytes: picture.bytes },
            });
        }
        return { keep: options.write, report };
      }),
    catch: failed,
  });
});

/**
 * Deletes a list's candidates and their pictures. What was decided of them stays: a break added
 * from one is the catalogue's, and its listing still tells the list's reference. Without
 * `write`, the same work is done and undone.
 */
export const removeCandidates = Effect.fn("removeCandidates")(function* (
  db: Database,
  list: string,
  options: { write: boolean },
) {
  return yield* Effect.tryPromise({
    try: () =>
      inTransaction(db, async (tx) => {
        const removed = await tx
          .delete(breakCandidate)
          .where(eq(breakCandidate.list, list))
          .returning({ status: breakCandidate.status });
        const pictures = await tx
          .delete(breakCandidateImage)
          .where(eq(breakCandidateImage.list, list))
          .returning({ name: breakCandidateImage.name });
        const report = {
          removed: removed.length,
          waiting: removed.filter((row) => row.status === "waiting" || row.status === "later")
            .length,
          pictures: pictures.length,
        };
        return { keep: options.write && (removed.length > 0 || pictures.length > 0), report };
      }),
    catch: failed,
  });
});
