import { ORPCError, os } from "@orpc/server";
import { operator } from "@repo/db/schema/access";
import { eq } from "drizzle-orm";

import type { Context } from "./context";
import { isFromAdminSite } from "./cross-site";
import { admitKey, type KeyState, readAuthorization } from "./keys";
import { procedureName } from "./procedures";
import { admitLink } from "./shares";
import { outcomeOf } from "./usage";
import { isFromWebApp, visitorsClosed, visitorsClosedAt } from "./visitors";

export const o = os.$context<Context>();

/** Answers anyone. Only the health check is that open. */
export const publicProcedure = o;

/**
 * Who a request names, before anything is asked of it: a key the instance knows, an account by
 * its session, the link of a shared list, or no one. A request that names no one and comes from
 * the web app is a visitor's. Of any other, `key` says whether it named a key or a link all the
 * same: such a request is refused, and never passed over to look for a session.
 */
type Named =
  | { via: "key"; keyId: string; state: KeyState }
  | { via: "session"; userId: string }
  | { via: "link"; listId: string }
  | { via: "visitor" }
  | { via: "none"; key: boolean };

async function nameOf(context: Context): Promise<Named> {
  const header = readAuthorization(context.authorization);
  // A request that carries an Authorization header is judged on it alone.
  if (header !== null) {
    if (header !== "refused" && header.via === "link") {
      const list = await admitLink(context.db, header.link);
      return list ? { via: "link", listId: list.listId } : { via: "none", key: true };
    }
    const key = header === "refused" ? null : await admitKey(context.db, header.key);
    return key ? { via: "key", keyId: key.id, state: key.state } : { via: "none", key: true };
  }

  const userId = context.session?.user.id;
  if (userId) return { via: "session", userId };
  return isFromWebApp(context.site, context.server.webOrigin)
    ? { via: "visitor" }
    : { via: "none", key: false };
}

/**
 * Who calls: an account, known by its session, a program, known by its key, whoever was given
 * the link of a shared list, or a visitor of the web app, who has no account.
 */
export type Caller =
  | { via: "session"; userId: string }
  | { via: "key"; keyId: string }
  | { via: "link"; listId: string }
  | { via: "visitor" };

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
 * Answers anyone, and counts the call: for what a link does, in a mail or to a shared list,
 * which carries a key of its own and comes with no session, and for what tells a visitor
 * whether the instance answers them. Decisions 031, 035 and 039 name what is built on it.
 */
export const linkProcedure = knownProcedure.route({
  // The reference says that such a route asks for neither a key nor a session.
  spec: (operation) => ({ ...operation, security: [] }),
});

/**
 * Answers a caller the instance knows: an account by its session, a program by an API key, or
 * whoever was given the link of a shared list. It answers a visitor of the web app as well,
 * who has no account, until an operator closes the instance to them: decision 039. For the data
 * everyone shares. `context.caller` says which of them is calling.
 */
export const callerProcedure = knownProcedure.use(async ({ context, next }) => {
  const { named } = context;
  if (named.via === "none") throw new ORPCError("UNAUTHORIZED");
  // Read at each call of a visitor, so that the instance is closed for all of them at once.
  if (named.via === "visitor" && (await visitorsClosedAt(context.db)) !== null) {
    throw visitorsClosed();
  }

  const caller: Caller =
    named.via === "key"
      ? { via: "key", keyId: named.keyId }
      : named.via === "link"
        ? { via: "link", listId: named.listId }
        : named.via === "visitor"
          ? { via: "visitor" }
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
    if (context.named.via === "link") {
      throw new ORPCError("FORBIDDEN", {
        message: "A list's link reads its list and shared data. This takes a signed-in session.",
      });
    }
    // A visitor has no session either, whether or not the instance answers visitors.
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
