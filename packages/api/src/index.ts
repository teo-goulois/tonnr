import { ORPCError, os } from "@orpc/server";
import { operator } from "@repo/db/schema/access";
import { eq } from "drizzle-orm";

import type { Context } from "./context";
import { findWorkingKey, readAuthorization } from "./keys";

export const o = os.$context<Context>();

/** Answers anyone. Only the health check is that open. */
export const publicProcedure = o;

/** The key a request names when it works, null when it names none. A key that does not work is refused. */
async function keyOf(context: Context) {
  const named = readAuthorization(context.authorization);
  if (named === null) return null;

  const key = named === "refused" ? null : await findWorkingKey(context.db, named.key);
  if (!key) throw new ORPCError("UNAUTHORIZED");
  return key;
}

/** Who calls: an account, known by its session, or a program, known by its key. */
export type Caller = { via: "session"; userId: string } | { via: "key"; keyId: string };

const requireCaller = o.middleware(async ({ context, next }) => {
  const key = await keyOf(context);
  const userId = context.session?.user.id;

  let caller: Caller;
  if (key) caller = { via: "key", keyId: key.id };
  else if (userId) caller = { via: "session", userId };
  else throw new ORPCError("UNAUTHORIZED");
  return next({ context: { caller } });
});

const requireSession = o.middleware(async ({ context, next }) => {
  // A key reads what everyone shares. It never stands for an account.
  if (await keyOf(context)) {
    throw new ORPCError("FORBIDDEN", {
      message: "An API key reads shared data only. This takes a signed-in session.",
    });
  }
  if (!context.session?.user) throw new ORPCError("UNAUTHORIZED");
  return next({ context: { session: context.session } });
});

/**
 * Answers a caller the instance knows: an account by its session, or a program by an API key.
 * For the data everyone shares. `context.caller` says which of the two is calling.
 */
export const callerProcedure = publicProcedure.use(requireCaller);

/** Answers a signed-in account, and no key. For what belongs to an account. */
export const protectedProcedure = publicProcedure.use(requireSession).route({
  // The reference says so of each such route, where the API as a whole takes a key as well.
  spec: (operation) => ({ ...operation, security: [{ session: [] }] }),
});

/** Answers an operator of the instance, signed in. For what the instance keeps to its operator. */
export const operatorProcedure = protectedProcedure.use(async ({ context, next }) => {
  const [found] = await context.db
    .select({ userId: operator.userId })
    .from(operator)
    .where(eq(operator.userId, context.session.user.id));
  if (!found) throw new ORPCError("FORBIDDEN");
  return next();
});
