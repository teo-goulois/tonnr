import { createHash } from "node:crypto";

import type { Database } from "@repo/db";
import { apiKey, developer, developerCalls, operator } from "@repo/db/schema/access";
import { sql } from "drizzle-orm";

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
 * What the instance makes of a key it knows. `admitted`: the key works, and its call was added
 * to what its developer account made this hour. `limited`: the key works, and the account has
 * used its hour's limit. `dead`: the key is revoked, its account is suspended, or its maker is
 * no longer an operator.
 */
export type KeyState = "admitted" | "limited" | "dead";

/**
 * Finds a key and lets its call in, in one statement. The call is added to the row of the key's
 * developer account for this hour, unless the row already holds the account's limit: the
 * database refuses that addition itself, so the limit holds whatever arrives at once, and
 * whichever process answers. Null when nobody made the key.
 *
 * A key without a developer account is one that the version before decision 020 made. It works
 * by the rules it was made under, and nothing counts its calls here.
 */
export async function admitKey(db: Database, key: string) {
  try {
    return await admit(db, key);
  } catch (error) {
    // The key's developer account was deleted between the moment the key was found and the
    // moment its call was counted. The key went with it: nobody holds this key any more.
    if (isGoneDeveloper(error)) return null;
    throw error;
  }
}

// What the database says when a row of `developer_calls` names a developer account that is gone.
const GONE_DEVELOPER = "developer_calls_developer_id_developer_id_fkey";

function isGoneDeveloper(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  if (typeof cause !== "object" || cause === null) return false;
  const { code, constraint } = cause as { code?: unknown; constraint?: unknown };
  return code === "23503" && constraint === GONE_DEVELOPER;
}

async function admit(db: Database, key: string) {
  const limit = sql`(select calls_per_hour from named)`;
  const { rows } = await db.execute<{
    id: string;
    works: boolean;
    counted: boolean;
    let_in: boolean;
  }>(sql`
    with named as (
      select
        ${apiKey.id},
        ${apiKey.developerId},
        ${developer.callsPerHour},
        (${apiKey.revokedAt} is null and ${developer.suspendedAt} is null
          and ${operator.userId} is not null) as works
      from ${apiKey}
      left join ${developer} on ${developer.id} = ${apiKey.developerId}
      left join ${operator} on ${operator.userId} = ${apiKey.userId}
      where ${apiKey.keyHash} = ${hashKey(key)}
    ), let_in as (
      insert into ${developerCalls} as counted (hour, developer_id, calls)
      select date_trunc('hour', now(), 'UTC'), named.developer_id, 1
      from named
      where named.works and named.developer_id is not null
      on conflict (hour, developer_id) do update set calls = counted.calls + 1
      where ${limit} is null or counted.calls < ${limit}
      returning 1
    )
    select
      named.id,
      named.works,
      named.developer_id is not null as counted,
      exists (select 1 from let_in) as let_in
    from named
  `);
  const [found] = rows;
  if (!found) return null;

  let state: KeyState = "dead";
  if (found.works) state = found.let_in || !found.counted ? "admitted" : "limited";
  return { id: found.id, state };
}
