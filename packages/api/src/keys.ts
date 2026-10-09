import { createHash } from "node:crypto";

import type { Database } from "@repo/db";
import { apiKey, operator } from "@repo/db/schema/access";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

// How every key starts, so that a key is told from another secret at a glance. 32 random bytes
// follow, written in base64url.
const START = "key_";
const KEY = /^key_[A-Za-z0-9_-]{43}$/;
// What a list shows of a key: its start and four characters of its own.
const PREFIX_LENGTH = START.length + 4;

/** A new key, with what is stored of it. The key itself goes to whoever asked, once. */
export function newKey() {
  const key = START + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  return { key, prefix: key.slice(0, PREFIX_LENGTH), keyHash: hashKey(key) };
}

// A key is 256 random bits, so nothing is gained by a hash that is slow to compute.
function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * What an Authorization header gives: nothing when there is none, a key, or "refused" when it
 * holds anything that is not `Bearer` and one key. A refused header is never passed over to
 * look for a session: a request that names a key is judged on that key.
 */
export function readAuthorization(header: string | null) {
  if (header === null) return null;

  const key = /^bearer ([^ ]+)$/i.exec(header)?.[1];
  return key !== undefined && KEY.test(key) ? { key } : "refused";
}

/**
 * Notes that a key was used, to the minute. It is a convenience for whoever lists the keys, so
 * it never holds a caller back: a row that something else is writing is passed over, and a
 * failure is dropped.
 */
async function noteUse(db: Database, id: string) {
  try {
    const due = db
      .select({ id: apiKey.id })
      .from(apiKey)
      .where(
        and(
          eq(apiKey.id, id),
          sql`(${apiKey.lastUsedAt} is null or ${apiKey.lastUsedAt} < now() - interval '1 minute')`,
        ),
      )
      .for("update", { skipLocked: true });
    await db
      .update(apiKey)
      .set({ lastUsedAt: sql`now()` })
      .where(inArray(apiKey.id, due));
  } catch {
    // The key works whether or not its use was noted.
  }
}

/**
 * The key's id when the key works: it is not revoked, and whoever made it is still an operator.
 */
export async function findWorkingKey(db: Database, key: string) {
  const [found] = await db
    .select({ id: apiKey.id })
    .from(apiKey)
    .innerJoin(operator, eq(operator.userId, apiKey.userId))
    .where(and(eq(apiKey.keyHash, hashKey(key)), isNull(apiKey.revokedAt)));
  if (!found) return null;

  await noteUse(db, found.id);
  return found;
}
