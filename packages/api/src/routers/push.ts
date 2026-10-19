import { ORPCError } from "@orpc/server";
import { APNS_ENVIRONMENTS, PUSH_KINDS, pushSubscription } from "@repo/db/schema/alerts";
import { session, user } from "@repo/db/schema/auth";
import { isPushEndpoint } from "@repo/push";
import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { Transaction } from "./alerts";
import { protectedProcedure } from "../index";
import { isCurvePoint } from "../push";
import { hasControlCharacter } from "../text";

// Decision 031, "Push". A browser that its user lets be notified is a device of the account
// that is signed in there. The address of its subscription is a capability, since whoever holds
// it can send to that browser: it comes in a request's body, in the field that is its own, and
// no answer, no refusal and no log ever holds what that field or the two keys were given.
//
// Decision 072: the app on a phone is a device too, by the token Apple or Google gave it, which
// is kept and refused as an address is, with two keys the app made as a browser makes its own.
// Every rule of a browser's holds for it: the session it goes with, the cap that counts every
// kind together, the order of the locks.

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

// What a device gives to be written to: its public key and its secret. Each is in base64url
// with no padding, as `PushSubscription.toJSON()` writes them and as an app writes its own: a
// point of the curve P-256 as its 65 bytes, which begin with 4, and the 16 bytes of a secret.
const keysSchema = z.object({
  p256dh: z
    .string()
    .regex(/^B[A-Za-z0-9_-]{85}[AEIMQUYcgkosw048]$/, "must be 65 bytes in base64url")
    .describe("The device's public key: the `p256dh` of `PushSubscription.toJSON().keys`."),
  auth: z
    .string()
    .regex(/^[A-Za-z0-9_-]{21}[AQgw]$/, "must be 16 bytes in base64url")
    .describe("The device's secret: the `auth` of `PushSubscription.toJSON().keys`."),
});

const labelSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((label) => !hasControlCharacter(label), "must not contain control characters")
  .optional()
  .describe("What the device calls itself, for the account to tell its devices apart.");

// What a browser gives of its subscription.
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
  keys: keysSchema,
  label: labelSchema,
  account: accountSchema,
};

// The token of the app on an iPhone is hexadecimal, as the app writes the bytes APNs gives it,
// and is kept in small letters whatever case it came in, so that a phone is one device. That of
// an Android phone is written in FCM's letters, and kept as it came. The refusals name no token:
// they would be passed on with it.
const IOS_TOKEN = /^[0-9a-f]{64,200}$/i;
const ANDROID_TOKEN = /^[A-Za-z0-9_:-]{1,1024}$/;
const iosTokenSchema = z
  .string()
  .max(200)
  .regex(IOS_TOKEN, "must be the token APNs gave, in hexadecimal")
  .transform((token) => token.toLowerCase());
const androidTokenSchema = z.string().max(1024).regex(ANDROID_TOKEN, "must be the token FCM gave");

/** A token as it is kept, or null for a text that no service of the kind gives. */
function tokenOf(kind: "ios" | "android", token: string) {
  if (kind === "ios") return IOS_TOKEN.test(token) ? token.toLowerCase() : null;
  return ANDROID_TOKEN.test(token) ? token : null;
}

// The bundle of an iOS app or the package of an Android one, as reversed domain names write it.
const appIdSchema = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/, "must be the bundle or the package of the app")
  .describe("The bundle or the package the app was built with, such as `app.tonnr`.");

// What the app on a phone gives of itself: its kind, the token its service gave, the app it is,
// for an iPhone which of Apple's hosts its build is pushed through, and its two keys.
const appFieldsOf = <Extra extends z.ZodRawShape>(extra: Extra) =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("ios"),
      token: iosTokenSchema.describe("The token APNs gave the app, in hexadecimal."),
      environment: z
        .enum(APNS_ENVIRONMENTS)
        .describe("`development` for a build that APNs's sandbox pushes to, as its build says."),
      appId: appIdSchema,
      keys: keysSchema,
      label: labelSchema,
      account: accountSchema,
      ...extra,
    }),
    z.object({
      kind: z.literal("android"),
      token: androidTokenSchema.describe("The registration token FCM gave the app."),
      appId: appIdSchema,
      keys: keysSchema,
      label: labelSchema,
      account: accountSchema,
      ...extra,
    }),
  ]);

const deviceSchema = z.object({
  id: z.uuid(),
  // A browser, or the app on an iPhone or an Android phone.
  kind: z.enum(PUSH_KINDS),
  // What the device called itself. Null when it did not say.
  label: z.string().nullable(),
  createdAt: z.date(),
  // When the device last said that it still holds its subscription, or its token.
  seenAt: z.date(),
});

// A device as its account reads it: never the address or the token, and never the keys.
const selection = {
  id: pushSubscription.id,
  kind: pushSubscription.kind,
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

async function isOnCurve(p256dh: string) {
  if (!(await isCurvePoint(p256dh))) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The key `p256dh` is not a point of the curve P-256.",
    });
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
  await isOnCurve(p256dh);
}

// The apps the instance pushes to: on iOS the bundle its pushes go under, on Android its
// Firebase project. Decision 072.
type AppPush = { ios?: string | undefined; android?: string | undefined };

// What an app's device is refused before anything is held: a page acting for another account,
// a kind the instance does not push to, an iPhone of another app than the one the instance's
// key pushes to, and a key that is no point of the curve.
async function checkedApp(
  context: { server: { appPush?: AppPush }; session: { user: { id: string } } },
  input: {
    kind: "ios" | "android";
    appId: string;
    account?: string | undefined;
    keys: { p256dh: string };
  },
) {
  actingFor(context, input.account);
  const pushedTo = context.server.appPush?.[input.kind];
  if (!pushedTo) {
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: `This instance sends no push to its ${input.kind === "ios" ? "iOS" : "Android"} app.`,
    });
  }
  if (input.kind === "ios" && input.appId !== pushedTo) {
    throw new ORPCError("BAD_REQUEST", { message: "This instance pushes to another app." });
  }
  await isOnCurve(input.keys.p256dh);
}

// What a phone's row holds of its app: an iPhone's environment, and nothing of it otherwise.
const appColumnsOf = (input: z.infer<ReturnType<typeof appFieldsOf>>) => ({
  kind: input.kind,
  token: input.token,
  environment: input.kind === "ios" ? input.environment : null,
  appId: input.appId,
});

// The refusal of a device that would pass the cap, which every kind counts together. `limit`
// tells it from any other the API answers with 403.
const tooMany = () =>
  new ORPCError("FORBIDDEN", {
    message: `An account keeps at most ${MAX_DEVICES_PER_USER} devices.`,
    data: { limit: MAX_DEVICES_PER_USER },
  });

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
        "is null on an instance that sends no push to browsers. `apps` says whether it pushes " +
        "to its app on iOS and on Android, which then makes a device with `POST /push/apps`.",
      tags: ["Push"],
    })
    .output(
      z.object({
        publicKey: z.string().nullable(),
        apps: z.object({ ios: z.boolean(), android: z.boolean() }),
      }),
    )
    .handler(({ context }) => ({
      publicKey: context.server.pushKey ?? null,
      apps: {
        ios: Boolean(context.server.appPush?.ios),
        android: Boolean(context.server.appPush?.android),
      },
    })),

  devices: protectedProcedure
    .route({
      method: "GET",
      path: "/push/devices",
      summary: "The browsers and the phones the caller's alerts are pushed to",
      description:
        "An account that has one is told by push, and one that has none is not. `kind` says " +
        "whether a device is a browser or the app on an iPhone or an Android phone. The " +
        "address of a browser's subscription and the token of a phone are never given back.",
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
          // Every device of the account but this browser: the phones too, which have no address.
          const [others] = await tx
            .select({ total: count() })
            .from(pushSubscription)
            .where(
              and(
                eq(pushSubscription.userId, userId),
                sql`${pushSubscription.endpoint} is distinct from ${endpoint}`,
              ),
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
      if (kept === null) throw tooMany();
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
              kind: pushSubscription.kind,
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
          // device of the caller's that has the address: the browser is that one. The id of a
          // phone names no browser.
          const own = held.filter((row) => row.userId === userId && row.kind === "web");
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

  registerApp: protectedProcedure
    .meta({ analytics: "push_subscribed" })
    .route({
      method: "POST",
      path: "/push/apps",
      successStatus: 201,
      summary: "Push the caller's alerts to the app on this phone",
      description:
        "What the instance's app does once the system lets it notify: it gives the token APNs " +
        "or FCM gave it, the app it is, and two keys of its own, which a push is encrypted " +
        "for as a browser's is. A phone has one token, and it goes with whoever is signed in " +
        "there: a token that another account kept becomes the caller's, as a new device. A " +
        "device goes with the session it was made in: signing out there forgets it. An " +
        `account keeps ${MAX_DEVICES_PER_USER} devices at most, of every kind together: one ` +
        "more is refused with 403, whose `data` gives that `limit`. The answer is 503 for a " +
        "kind the instance does not push to, which `GET /push/key` says, and 400 for an " +
        "iPhone of another app than the one it pushes to.",
      tags: ["Push"],
    })
    .input(appFieldsOf({}))
    .output(deviceSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const sessionId = context.session.session.id;
      await checkedApp(context, input);
      const app = appColumnsOf(input);
      const { keys, label = null } = input;

      const kept = await quietly(() =>
        context.db.transaction(async (tx) => {
          // The account first, then the session, as a browser's subscription holds them.
          await holdCaller(tx, userId, sessionId);
          const [others] = await tx
            .select({ total: count() })
            .from(pushSubscription)
            .where(
              and(
                eq(pushSubscription.userId, userId),
                sql`${pushSubscription.token} is distinct from ${app.token}`,
              ),
            );
          if ((others?.total ?? 0) >= MAX_DEVICES_PER_USER) return null;

          // A token that is kept already is this phone's: it says so again, or another account
          // is signed in there now, which gets a device of its own under a new id.
          const id = crypto.randomUUID();
          const isMine = sql`${pushSubscription.userId} = ${userId}`;
          const [row] = await tx
            .insert(pushSubscription)
            .values({ id, userId, sessionId, ...app, p256dh: keys.p256dh, auth: keys.auth, label })
            .onConflictDoUpdate({
              target: pushSubscription.token,
              set: {
                id: sql`case when ${isMine} then ${pushSubscription.id} else ${id} end`,
                createdAt: sql`case when ${isMine} then ${pushSubscription.createdAt} else now() end`,
                label: sql`case when ${isMine} then coalesce(${label}, ${pushSubscription.label}) else ${label} end`,
                userId,
                sessionId,
                ...app,
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
      if (kept === null) throw tooMany();
      return kept;
    }),

  renewApp: protectedProcedure
    .route({
      method: "POST",
      path: "/push/apps/renew",
      summary: "Say again what the app on this phone holds, for the device it is",
      description:
        "What the app does each time it starts, and when the system gives it another token. " +
        "It names its device by the `id` it was given. Without an id, or with one the caller " +
        "has no such device for, it is the caller's device of this kind that has this token. " +
        "The answer is 404 when the caller has neither, because the device was removed from " +
        "another one or because the phone is another account's now: the app then lets go of " +
        "it and of its keys. It never makes a device.",
      tags: ["Push"],
    })
    .input(appFieldsOf({ id: idSchema.optional() }))
    .output(deviceSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const sessionId = context.session.session.id;
      await checkedApp(context, input);
      const app = appColumnsOf(input);
      const { id, keys, label = null } = input;

      return quietly(() =>
        context.db.transaction(async (tx) => {
          await holdCaller(tx, userId, sessionId);
          // Then every row this touches, in the order of their ids: the device, and whatever
          // else kept the token.
          const held = await tx
            .select({
              id: pushSubscription.id,
              userId: pushSubscription.userId,
              kind: pushSubscription.kind,
              token: pushSubscription.token,
            })
            .from(pushSubscription)
            .where(
              or(
                id === undefined ? undefined : eq(pushSubscription.id, id),
                eq(pushSubscription.token, app.token),
              ),
            )
            .orderBy(asc(pushSubscription.id))
            .for("update");
          // A device of the caller's and of this kind: by its id, or else by the token.
          const own = held.filter((row) => row.userId === userId && row.kind === app.kind);
          const mine =
            own.find((row) => row.id === id) ?? own.find((row) => row.token === app.token);
          if (!mine) throw gone();

          // A phone has one token: whatever else kept it gives way to the device that holds it.
          const others = held.filter((row) => row.token === app.token && row.id !== mine.id);
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
              ...app,
              // The device is this session's from now on: the app may have signed in anew.
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

  forgetApp: protectedProcedure
    .meta({ analytics: "push_disabled" })
    .route({
      method: "POST",
      path: "/push/apps/forget",
      summary: "Stop pushing the caller's alerts to the app on this phone",
      description:
        "Takes the token the app was given, in the body. What switching push off in the app " +
        "does, and turning its notifications off in the system's settings, and signing out. " +
        "`forgotten` is false when the caller kept no such token: nothing is said of another " +
        "account's.",
      tags: ["Push"],
    })
    .input(
      z.object({
        kind: z.enum(["ios", "android"]),
        token: z.string().max(1024),
        account: accountSchema,
      }),
    )
    .output(z.object({ forgotten: z.boolean() }))
    .handler(async ({ input, context }) => {
      actingFor(context, input.account);
      // A token that could not have been taken is not kept, and is not looked for.
      const token = tokenOf(input.kind, input.token);
      if (token === null) return { forgotten: false };
      const forgotten = await quietly(() =>
        context.db
          .delete(pushSubscription)
          .where(
            and(
              eq(pushSubscription.token, token),
              eq(pushSubscription.kind, input.kind),
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
        "From any of them, of any kind: a browser that was removed forgets its subscription " +
        "when its app next loads, and a phone lets go of its keys when its app next starts.",
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
