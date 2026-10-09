import { ORPCError, os } from "@orpc/server";
import { operator } from "@repo/db/schema/access";
import { eq } from "drizzle-orm";

import type { Context } from "./context";
import { isFromAdminSite } from "./cross-site";
import { admitKey, type KeyState, readAuthorization } from "./keys";
import { procedureName } from "./procedures";
import { outcomeOf } from "./usage";

export const o = os.$context<Context>();

/** Answers anyone. Only the health check is that open. */
export const publicProcedure = o;

/**
 * Who a request names, before anything is asked of it: a key the instance knows, an account by
 * its session, or no one. `key` then says whether it named a key all the same: such a request
 * is refused, and never passed over to look for a session.
 */
type Named =
  | { via: "key"; keyId: string; state: KeyState }
  | { via: "session"; userId: string }
  | { via: "none"; key: boolean };

async function nameOf(context: Context): Promise<Named> {
  const header = readAuthorization(context.authorization);
  // A request that carries an Authorization header is judged on it alone.
  if (header !== null) {
    const key = header === "refused" ? null : await admitKey(context.db, header.key);
    return key ? { via: "key", keyId: key.id, state: key.state } : { via: "none", key: true };
  }

  const userId = context.session?.user.id;
  return userId ? { via: "session", userId } : { via: "none", key: false };
}

/** Who calls: an account, known by its session, or a program, known by its key. */
export type Caller = { via: "session"; userId: string } | { via: "key"; keyId: string };

/**
 * Finds out who a request names, refuses a key that does not work or has used its hour's limit,
 * and counts the call with what came of it. Every procedure that asks who calls starts here, so
 * each of them is counted, the ones that refuse their caller too. The one exception is a call to
 * what runs the instance, once its caller is accepted.
 */
const knownProcedure = publicProcedure.use(async ({ context, next, procedure }) => {
  let named: Named = { via: "none", key: false };
  // What runs the instance clears this once it has accepted its caller: an operator who reads
  // the counts does not add to them.
  const tally = { counted: true };
  const count = (error?: unknown) => {
    if (!tally.counted) return;
    try {
      context.usage.count({
        via: named.via,
        keyId: named.via === "key" ? named.keyId : null,
        procedure: procedureName(procedure),
        outcome: error === undefined ? "answered" : outcomeOf(error),
        worked: named.via === "key" && named.state !== "dead",
      });
    } catch {
      // The call is answered whether or not it was counted.
    }
  };

  let result;
  try {
    named = await nameOf(context);
    if (named.via === "key" && named.state === "limited") {
      throw new ORPCError("TOO_MANY_REQUESTS", {
        message: "This key's developer account has made its calls for the hour.",
      });
    }
    if (named.via === "key" ? named.state === "dead" : named.via === "none" && named.key) {
      throw new ORPCError("UNAUTHORIZED");
    }
    result = await next({ context: { named, tally } });
  } catch (error) {
    count(error);
    throw error;
  }
  count();
  return result;
});

/**
 * Answers a caller the instance knows: an account by its session, or a program by an API key.
 * For the data everyone shares. `context.caller` says which of the two is calling.
 */
export const callerProcedure = knownProcedure.use(({ context, next }) => {
  const { named } = context;
  if (named.via === "none") throw new ORPCError("UNAUTHORIZED");

  const caller: Caller =
    named.via === "key"
      ? { via: "key", keyId: named.keyId }
      : { via: "session", userId: named.userId };
  return next({ context: { caller } });
});

/** Answers a signed-in account, and no key. For what belongs to an account. */
export const protectedProcedure = knownProcedure
  .use(({ context, next }) => {
    // A key reads what everyone shares. It never stands for an account.
    if (context.named.via === "key") {
      throw new ORPCError("FORBIDDEN", {
        message: "An API key reads shared data only. This takes a signed-in session.",
      });
    }
    if (context.named.via === "none" || !context.session?.user) {
      throw new ORPCError("UNAUTHORIZED");
    }
    return next({ context: { session: context.session } });
  })
  .route({
    // The reference says so of each such route, where the API as a whole takes a key as well.
    spec: (operation) => ({ ...operation, security: [{ session: [] }] }),
  });

const requireOperator = o
  .$context<Context & { session: NonNullable<Context["session"]> }>()
  .middleware(async ({ context, next }) => {
    const [found] = await context.db
      .select({ userId: operator.userId })
      .from(operator)
      .where(eq(operator.userId, context.session.user.id));
    if (!found) throw new ORPCError("FORBIDDEN");
    return next();
  });

/** Answers an operator of the instance, signed in. For what the instance keeps to its operator. */
export const operatorProcedure = protectedProcedure.use(requireOperator);

/**
 * Answers an operator of the instance, signed in, whose request says it comes from the admin's
 * site. For what runs the instance: the developer accounts, the keys, the counts, the list of
 * accounts. A page of the web app cannot call it with the operator's session: decision 020.
 */
export const adminProcedure = protectedProcedure
  .use(({ context, next }) => {
    if (!isFromAdminSite(context.site, context.adminSites)) {
      throw new ORPCError("FORBIDDEN", {
        message:
          "This takes a request that names the admin's site, in Origin. A script sends it too.",
      });
    }
    return next();
  })
  .use(requireOperator)
  .use(({ context, next }) => {
    // The caller is accepted. A call that was refused above is counted like any other.
    context.tally.counted = false;
    return next();
  });
