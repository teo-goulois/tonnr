import { ORPCError } from "@orpc/server";
import { pushSubscription } from "@repo/db/schema/alerts";
import { session, user } from "@repo/db/schema/auth";
import { isPushEndpoint } from "@repo/push";
import { and, asc, count, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "./alerts";
import { protectedProcedure } from "../index";
import { isCurvePoint } from "../push";
import { hasControlCharacter } from "../text";

// Decision 031, "Push". A browser that its user lets be notified is a device of the account
// that is signed in there. The address of its subscription is a capability, since whoever holds
// it can send to that browser: it comes in a request's body, in the field that is its own, and
// no answer, no refusal and no log ever holds what that field or the two keys were given.

const MAX_DEVICES_PER_USER = 10;

// An address is kept as a URL spells it: the host in small letters, whatever case it came in.
const spelled = (address: string) => new URL(address).href;

// A device is named by the id the API made for it, and by nothing a caller could write: an id
// goes into a URL, into a query, and so into what is logged of one that failed.
const idSchema = z.uuid().describe("The id of a device, as the API gave it.");

// A page that was opened for one account goes on acting for it when another signs in from
// another tab: the session it then sends is no longer its own. What it asks names its account,
// and is refused when the caller is another.
const accountSchema = z
  .string()
  .max(200)
  .optional()
  .describe(
    "The account the page acts for, by its id. A caller that is another account is refused " +
      "with 409: the session changed under the page that asks.",
  );

// What a browser gives of its subscription. Each key is in base64url with no padding, as
// `PushSubscription.toJSON()` writes it: a point of the curve P-256 as its 65 bytes, which
// begin with 4, and the 16 bytes of a secret.
const subscriptionFields = {
  endpoint: z
    .string()
    .max(2048)
    // The refusal names no address: it would be passed on with it.
    .refine(isPushEndpoint, "must be the https address of a browser's push service")
    .transform(spelled)
    .describe(
      "Where the browser's push service takes a message for it: `PushSubscription.endpoint`.",
    ),
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^B[A-Za-z0-9_-]{85}[AEIMQUYcgkosw048]$/, "must be 65 bytes in base64url")
      .describe("The browser's public key: the `p256dh` of `PushSubscription.toJSON().keys`."),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]{21}[AQgw]$/, "must be 16 bytes in base64url")
      .describe("The browser's secret: the `auth` of `PushSubscription.toJSON().keys`."),
  }),
  label: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((label) => !hasControlCharacter(label), "must not contain control characters")
    .optional()
    .describe("What the browser calls itself, for the account to tell its devices apart."),
  account: accountSchema,
};

const deviceSchema = z.object({
  id: z.uuid(),
  // What the browser called itself. Null when it did not say.
  label: z.string().nullable(),
  createdAt: z.date(),
  // When the browser last said that it still holds its subscription.
  seenAt: z.date(),
});

// A device as its account reads it: never the address, and never the keys.
const selection = {
  id: pushSubscription.id,
  label: pushSubscription.label,
  createdAt: pushSubscription.createdAt,
  seenAt: pushSubscription.seenAt,
};

// The same words for a device that never was, one that is gone, and another account's.
function gone() {
  return new ORPCError("NOT_FOUND", { message: "The caller has no such device." });
}

/**
 * Runs what reads or writes an address. What the database says of a query that failed holds
 * what the query was given: it is not passed on to where faults are logged.
 */
async function quietly<Answer>(work: () => Promise<Answer>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ORPCError) throw error;
    throw new ORPCError("INTERNAL_SERVER_ERROR");
  }
}

// Refuses a page that acts for another account than the caller: it would make that one a device
// it never asked for, or take one of its own from it.
function actingFor(context: { session: { user: { id: string } } }, account: string | undefined) {
  if (account !== undefined && account !== context.session.user.id) {
    throw new ORPCError("CONFLICT", { message: "Another account is signed in." });
  }
}

async function checked(
  context: { server: { pushKey?: string | undefined }; session: { user: { id: string } } },
  { account, keys: { p256dh } }: { account?: string | undefined; keys: { p256dh: string } },
) {
  actingFor(context, account);
  if (!context.server.pushKey) {
    throw new ORPCError("SERVICE_UNAVAILABLE", { message: "This instance sends no push." });
  }
  if (!(await isCurvePoint(p256dh))) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The key `p256dh` is not a point of the curve P-256.",
    });
  }
}

/**
 * Holds the caller's account, then its session: what `subscribe` and `renew` take first, in
 * that order, before any row of `push_subscription`. The account makes two requests of it run
 * one after the other. The session is what a device goes with: signing out deletes it, and the
 * device with it, so a request that would keep a device waits for a sign-out under way, and
 * is refused once the session is gone.
 */
async function holdCaller(tx: Transaction, userId: string, sessionId: string) {
  await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
  const [open] = await tx
    .select({ id: session.id })
    .from(session)
    .where(and(eq(session.id, sessionId), eq(session.userId, userId)))
    .for("key share");
  if (!open) throw new ORPCError("UNAUTHORIZED");
}

export const pushRouter = {
  key: protectedProcedure
    .route({
      method: "GET",
      path: "/push/key",
      summary: "Whether the instance sends push, and the key a browser subscribes with",
      description:
        "`publicKey` is what a browser gives its push service as `applicationServerKey`. It " +
        "is null on an instance that sends no push.",
      tags: ["Push"],
    })
    .output(z.object({ publicKey: z.string().nullable() }))
    .handler(({ context }) => ({ publicKey: context.server.pushKey ?? null })),

  devices: protectedProcedure
    .route({
      method: "GET",
      path: "/push/devices",
      summary: "The browsers the caller's alerts are pushed to",
      description:
        "An account that has one is told by push, and one that has none is not. The address " +
        "of a device's subscription is never given back.",
      tags: ["Push"],
    })
    .output(z.object({ devices: z.array(deviceSchema) }))
    .handler(async ({ context }) => {
      const devices = await context.db
        .select(selection)
        .from(pushSubscription)
        .where(eq(pushSubscription.userId, context.session.user.id))
        .orderBy(asc(pushSubscription.createdAt), asc(pushSubscription.id));
      return { devices };
    }),

  subscribe: protectedProcedure
    .meta({ analytics: "push_subscribed" })
    .route({
      method: "POST",
      path: "/push/devices",
      successStatus: 201,
      summary: "Push the caller's alerts to this browser",
      description:
        "Takes what the browser's `PushSubscription` holds. A browser has one subscription, " +
        "and it goes with whoever is signed in there: an address that another account kept " +
        "becomes the caller's, as a new device. A device goes with the session it was made " +
        "in: signing out there forgets it. An account keeps " +
        `${MAX_DEVICES_PER_USER} devices at most: one more is refused with 403, whose \`data\` ` +
        "gives that `limit`. An address that is not a browser's push service is refused with " +
        "400, and the answer is 503 on an instance that sends no push.",
      tags: ["Push"],
    })
    .input(z.object(subscriptionFields))
    .output(deviceSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const sessionId = context.session.session.id;
      const { endpoint, keys, label = null } = input;
      await checked(context, input);

      const kept = await quietly(() =>
        context.db.transaction(async (tx) => {
          // Holding the account makes its subscriptions run one after the other, so two
          // browsers at once cannot both pass the limit.
          await holdCaller(tx, userId, sessionId);
          const [others] = await tx
            .select({ total: count() })
            .from(pushSubscription)
            .where(
              and(eq(pushSubscription.userId, userId), ne(pushSubscription.endpoint, endpoint)),
            );
          if ((others?.total ?? 0) >= MAX_DEVICES_PER_USER) return null;

          // An address that is kept already is this browser's: it says so again, or another
          // account is signed in there now. That account gets a device of its own, which the
          // account before cannot name: a new id, made now.
          const id = crypto.randomUUID();
          const isMine = sql`${pushSubscription.userId} = ${userId}`;
          const [row] = await tx
            .insert(pushSubscription)
            .values({
              id,
              userId,
              sessionId,
              endpoint,
              p256dh: keys.p256dh,
              auth: keys.auth,
              label,
            })
            .onConflictDoUpdate({
              target: pushSubscription.endpoint,
              set: {
                id: sql`case when ${isMine} then ${pushSubscription.id} else ${id} end`,
                createdAt: sql`case when ${isMine} then ${pushSubscription.createdAt} else now() end`,
                // A browser of the caller's that gives no name keeps the one it had.
                label: sql`case when ${isMine} then coalesce(${label}, ${pushSubscription.label}) else ${label} end`,
                userId,
                sessionId,
                p256dh: keys.p256dh,
                auth: keys.auth,
                seenAt: sql`now()`,
              },
            })
            .returning(selection);
          if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
          return row;
        }),
      );
      if (kept === null) {
        // `limit` tells this refusal from any other the API answers with 403.
        throw new ORPCError("FORBIDDEN", {
          message: `An account keeps at most ${MAX_DEVICES_PER_USER} devices.`,
          data: { limit: MAX_DEVICES_PER_USER },
        });
      }
      return kept;
    }),

  renew: protectedProcedure
    .route({
      method: "POST",
      path: "/push/devices/renew",
      summary: "Say again what this browser holds, for the device it is",
      description:
        "What a browser does when its app loads: a push service changes an address now and " +
        "then, and the device then keeps the new one. The browser names its device by the " +
        "`id` it was given. Without an id, or with one the caller has no device for, it is the " +
        "device of the caller's that has this address. The answer is 404 when the caller has " +
        "neither, because the device was removed from another one or because the browser is " +
        "another account's now: the browser then forgets its subscription. It never makes a " +
        "device.",
      tags: ["Push"],
    })
    .input(z.object({ id: idSchema.optional(), ...subscriptionFields }))
    .output(deviceSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const sessionId = context.session.session.id;
      const { id, endpoint, keys, label = null } = input;
      await checked(context, input);

      return quietly(() =>
        context.db.transaction(async (tx) => {
          // The account first, as `subscribe` holds it: one that counts the account's devices
          // does not count one that is moving to another address.
          await holdCaller(tx, userId, sessionId);
          // Then every row this touches, in the order of their ids: the device, and whatever
          // else kept the address. Two browsers that say one another's address then wait for
          // one another, and neither holds what the other waits for.
          const held = await tx
            .select({
              id: pushSubscription.id,
              userId: pushSubscription.userId,
              endpoint: pushSubscription.endpoint,
            })
            .from(pushSubscription)
            .where(
              or(
                id === undefined ? undefined : eq(pushSubscription.id, id),
                eq(pushSubscription.endpoint, endpoint),
              ),
            )
            .orderBy(asc(pushSubscription.id))
            .for("update");
          // By its id when the browser kept one. Without it, or when that id is gone, the
          // device of the caller's that has the address: the browser is that one.
          const own = held.filter((row) => row.userId === userId);
          const mine =
            own.find((row) => row.id === id) ?? own.find((row) => row.endpoint === endpoint);
          if (!mine) throw gone();

          // A browser has one subscription: whatever else kept this address gives way to the
          // device that holds it now.
          const others = held.filter((row) => row.endpoint === endpoint && row.id !== mine.id);
          if (others.length > 0) {
            await tx.delete(pushSubscription).where(
              inArray(
                pushSubscription.id,
                others.map((row) => row.id),
              ),
            );
          }
          const [row] = await tx
            .update(pushSubscription)
            .set({
              endpoint,
              // The device is this session's from now on: the browser may have signed in anew.
              sessionId,
              p256dh: keys.p256dh,
              auth: keys.auth,
              label: sql`coalesce(${label}, ${pushSubscription.label})`,
              seenAt: sql`now()`,
            })
            .where(eq(pushSubscription.id, mine.id))
            .returning(selection);
          if (!row) throw gone();
          return row;
        }),
      );
    }),

  forget: protectedProcedure
    .meta({ analytics: "push_disabled" })
    .route({
      method: "POST",
      path: "/push/devices/forget",
      summary: "Stop pushing the caller's alerts to this browser",
      description:
        "Takes the address of the browser's subscription, in the body. What switching push " +
        "off on a device does, and signing out. `forgotten` is false when the caller kept no " +
        "such address: nothing is said of another account's.",
      tags: ["Push"],
    })
    .input(z.object({ endpoint: z.string().max(2048), account: accountSchema }))
    .output(z.object({ forgotten: z.boolean() }))
    .handler(async ({ input, context }) => {
      actingFor(context, input.account);
      // An address that could not have been taken is not kept, and is not looked for.
      if (!isPushEndpoint(input.endpoint)) return { forgotten: false };
      const endpoint = spelled(input.endpoint);
      const forgotten = await quietly(() =>
        context.db
          .delete(pushSubscription)
          .where(
            and(
              eq(pushSubscription.endpoint, endpoint),
              eq(pushSubscription.userId, context.session.user.id),
            ),
          )
          .returning({ id: pushSubscription.id }),
      );
      return { forgotten: forgotten.length > 0 };
    }),

  remove: protectedProcedure
    .meta({ analytics: "push_device_removed" })
    .route({
      method: "DELETE",
      path: "/push/devices/{id}",
      summary: "Remove one of the caller's devices",
      description:
        "From any of them: a browser that was removed forgets its subscription when its app " +
        "next loads.",
      tags: ["Push"],
    })
    .input(z.object({ id: idSchema, account: accountSchema }))
    .output(z.object({ id: z.uuid() }))
    .handler(async ({ input, context }) => {
      actingFor(context, input.account);
      const [removed] = await quietly(() =>
        context.db
          .delete(pushSubscription)
          .where(
            and(
              eq(pushSubscription.id, input.id),
              eq(pushSubscription.userId, context.session.user.id),
            ),
          )
          .returning({ id: pushSubscription.id }),
      );
      if (!removed) throw gone();
      return removed;
    }),
};
