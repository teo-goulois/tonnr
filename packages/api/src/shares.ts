import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import type { Database } from "@repo/db";
import { stationListShare } from "@repo/db/schema/lists";
import { eq, sql } from "drizzle-orm";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Share = typeof stationListShare.$inferSelect;

// What a link of a list ends with: sixteen random bytes, as base64url.
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
// What stands for a password that was given once: a SHA-256, as hex.
const PASS = /^[0-9a-f]{64}$/;

// How many wrong passwords a link takes in a quarter of an hour, before it takes none for the
// rest of it.
const WRONG_MOST = 10;
const WRONG_SPAN_MS = 15 * 60 * 1000;

/** A new link for a list. Whoever has it reads the list, so it is drawn at random. */
export function newToken() {
  return Buffer.from(randomBytes(16)).toString("base64url");
}

/** A password as it is kept: its salt and its scrypt, never itself. */
export function hashPassword(password: string) {
  const salt = Buffer.from(randomBytes(16));
  const hash = Buffer.from(scryptSync(password, salt, 32));
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function isPassword(password: string, kept: string) {
  const [, salt, hash] = kept.split(":");
  if (!salt || !hash) return false;
  const given = scryptSync(password, Buffer.from(salt, "hex"), 32);
  const expected = Buffer.from(hash, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * What a reader who gave the password once sends afterwards in its place. It is made of the link
 * and of what is kept of the password, so a new link or a new password ends it, and nobody makes
 * one without having given the password.
 */
export function passOf(share: Pick<Share, "token" | "passwordHash">) {
  if (share.passwordHash === null) return null;
  return createHash("sha256").update(`${share.token}:${share.passwordHash}`).digest("hex");
}

function isPass(given: string, share: Share) {
  const expected = passOf(share);
  if (expected === null) return true;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * What an Authorization header says of a list's link: `List <token>`, or `List <token>.<pass>`
 * for a list with a password. Null for a header that is not one.
 */
export function readLink(header: string) {
  const [, token, pass] = /^list ([^ .]+)(?:\.([^ .]+))?$/i.exec(header) ?? [];
  if (token === undefined || !TOKEN.test(token)) return null;
  if (pass !== undefined && !PASS.test(pass)) return null;
  return { token, pass: pass ?? null };
}

/** The share a link names. Undefined for a link nobody made, or that was ended. */
export async function shareOf(db: Database | Transaction, token: string) {
  if (!TOKEN.test(token)) return undefined;
  const [share] = await db.select().from(stationListShare).where(eq(stationListShare.token, token));
  return share;
}

/** The list a link opens, for a request that carries it with its pass. Null when it opens none. */
export async function admitLink(db: Database, link: { token: string; pass: string | null }) {
  const share = await shareOf(db, link.token);
  if (!share) return null;
  if (share.passwordHash !== null && (link.pass === null || !isPass(link.pass, share))) return null;
  return { listId: share.listId };
}

/**
 * What a password given for a link is worth. "locked" once the link took its ten wrong
 * passwords of the quarter of an hour: it then reads none, the right one either, so that
 * nobody tries them all.
 */
export async function tryPassword(db: Database, share: Share, password: string) {
  if (share.passwordHash === null) return "right" as const;
  const since = share.wrongSince?.getTime() ?? 0;
  const inSpan = Date.now() - since < WRONG_SPAN_MS;
  if (inSpan && share.wrongPasswords >= WRONG_MOST) return "locked" as const;
  if (isPassword(password, share.passwordHash)) return "right" as const;

  // Counted in the database: whichever process answers the next try reads it.
  await db
    .update(stationListShare)
    .set(
      inSpan
        ? { wrongPasswords: sql`${stationListShare.wrongPasswords} + 1` }
        : { wrongPasswords: 1, wrongSince: new Date() },
    )
    .where(eq(stationListShare.listId, share.listId));
  return "wrong" as const;
}
