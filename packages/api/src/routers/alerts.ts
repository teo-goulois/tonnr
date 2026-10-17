import { ORPCError } from "@orpc/server";
import { zoneNamed } from "@repo/conditions/alerts/clock";
import { openHours } from "@repo/conditions/alerts/open";
import { MAX_HORIZON_DAYS, availabilityOf, settingsOf } from "@repo/conditions/alerts/settings";
import { MAX_FORECAST_DAYS } from "@repo/conditions/forecasts/forecasts";
import { assessSpot } from "@repo/conditions/spots/conditions";
import { criteriaSchema } from "@repo/conditions/spots/criteria";
import type { Database } from "@repo/db";
import {
  alert,
  alertSettings,
  alertSpot,
  alertWindow,
  notification,
  notificationDelivery,
} from "@repo/db/schema/alerts";
import { user } from "@repo/db/schema/auth";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { LOCALES, isLocale, localePrefix } from "@repo/config/locales";
import type { Locale } from "@repo/config/locales";
import { and, asc, count, eq, inArray, max, sql } from "drizzle-orm";
import { Effect, Result } from "effect";
import { z } from "zod";

import { linkProcedure, protectedProcedure } from "../index";
import { hasControlCharacter } from "../text";
import { admitForecastQuestion } from "../forecast-callers";
import { forecastSourceSchema, forecastUnavailable } from "./forecasts";

// Decision 031. An alert and an account's settings are their owner's alone: every procedure here
// takes a session, and reads and writes nothing of another account. Decision 064: an alert's
// places are the account's own spots and surf breaks of the catalogue, which anyone may name.

const MAX_ALERTS_PER_USER = 100;
const MAX_SPOTS_PER_ALERT = 12;
const DAY_MINUTES = 24 * 60;

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((name) => !hasControlCharacter(name), "must not contain control characters");

// A range with neither end asks nothing: it is left out, as if it had not been given.
const askedSchema = criteriaSchema.transform(
  (criteria) =>
    Object.fromEntries(
      Object.entries(criteria).filter(
        ([, criterion]) =>
          typeof criterion === "string" ||
          (criterion !== undefined && Object.values(criterion).some((end) => end !== undefined)),
      ),
    ) as z.infer<typeof criteriaSchema>,
);

// An alert asks at least one thing of the sea: with no condition every hour would be a window.
const conditionsSchema = askedSchema.refine(
  (criteria) => Object.keys(criteria).length > 0,
  "an alert needs at least one condition",
);

// The forecast is hourly, so a window is a whole number of hours.
const shortestSchema = z
  .number()
  .int()
  .min(60)
  .max(DAY_MINUTES)
  .multipleOf(60)
  .describe("The shortest window worth telling, in minutes: whole hours, one at least.");

const idsSchema = (what: string) =>
  z
    .array(z.string())
    .max(MAX_SPOTS_PER_ALERT)
    .refine((ids) => new Set(ids).size === ids.length, `a ${what} is named once`);
const spotIdsSchema = idsSchema("spot").describe("The caller's spots, as `GET /spots` names them.");
const breakIdsSchema = idsSchema("break").describe(
  "Surf breaks of the catalogue, as `GET /breaks` names them.",
);
// An alert has one place at least, spots and breaks together, and twelve at most.
const placesHeld = (places: { spotIds?: string[]; breakIds?: string[] }) => {
  const total = (places.spotIds?.length ?? 0) + (places.breakIds?.length ?? 0);
  return total >= 1 && total <= MAX_SPOTS_PER_ALERT;
};
const placesMessage = `an alert is set on one place at least, and ${MAX_SPOTS_PER_ALERT} at most`;

const alertSchema = z.object({
  id: z.string(),
  name: z.string(),
  // The conditions that make its spots work, checked at each of them.
  criteria: criteriaSchema,
  enabled: z.boolean(),
  shortestMinutes: z.number(),
  // The spots of the account it is set on, and the breaks of the catalogue.
  spotIds: z.array(z.string()),
  breakIds: z.array(z.string()),
  // Its places, spots and breaks, with their names, in the order they were added.
  places: z.array(
    z.object({ spotId: z.string().nullable(), breakId: z.string().nullable(), name: z.string() }),
  ),
  createdAt: z.date(),
  updatedAt: z.date(),
});

type Place = { spotId: string | null; breakId: string | null; name: string };

function describeAlert(row: typeof alert.$inferSelect, places: Place[]) {
  return {
    id: row.id,
    name: row.name,
    criteria: row.criteria,
    enabled: row.enabled,
    shortestMinutes: row.shortestMinutes,
    spotIds: places.flatMap((place) => place.spotId ?? []),
    breakIds: places.flatMap((place) => place.breakId ?? []),
    places,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function notFound(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No alert "${id}".` });
}

// The places of each alert, spots and breaks, in the order they were added.
async function placesOf(db: Database | Transaction, alertIds: string[]) {
  const byAlert = new Map<string, Place[]>(alertIds.map((id) => [id, []]));
  if (alertIds.length === 0) return byAlert;
  const rows = await db
    .select({
      alertId: alertSpot.alertId,
      spotId: alertSpot.spotId,
      breakId: alertSpot.breakId,
      name: sql<string>`coalesce(${spot.name}, ${surfBreak.name})`,
    })
    .from(alertSpot)
    .leftJoin(spot, eq(spot.id, alertSpot.spotId))
    .leftJoin(surfBreak, eq(surfBreak.id, alertSpot.breakId))
    .where(inArray(alertSpot.alertId, alertIds))
    .orderBy(asc(alertSpot.position), asc(alertSpot.placeId));
  for (const { alertId, ...place } of rows) byAlert.get(alertId)?.push(place);
  return byAlert;
}

/**
 * Checks that spots may join an alert: each is the caller's. A spot may be in other alerts. The
 * rows are held until the transaction ends, so that a spot cannot be deleted meanwhile.
 */
async function claimSpots(tx: Transaction, userId: string, spotIds: string[]) {
  if (spotIds.length === 0) return;
  const owned = await tx
    .select({ id: spot.id })
    .from(spot)
    .where(and(inArray(spot.id, spotIds), eq(spot.userId, userId)))
    .for("update");
  const known = new Set(owned.map((row) => row.id));
  const missing = spotIds.find((id) => !known.has(id));
  // Another account's spot is reported as missing, as it is everywhere.
  if (missing) throw new ORPCError("NOT_FOUND", { message: `No spot "${missing}".` });
}

/**
 * Checks that breaks of the catalogue may join an alert: each is there. Anyone may name one. The
 * rows are held until the transaction ends, so that a break cannot be merged or deleted meanwhile.
 */
async function claimBreaks(tx: Transaction, breakIds: string[]) {
  if (breakIds.length === 0) return;
  const found = await tx
    .select({ id: surfBreak.id })
    .from(surfBreak)
    .where(inArray(surfBreak.id, breakIds))
    .for("share");
  const known = new Set(found.map((row) => row.id));
  const missing = breakIds.find((id) => !known.has(id));
  if (missing) throw new ORPCError("NOT_FOUND", { message: `No surf break "${missing}".` });
}

/**
 * Forgets what the looks saw and told at an alert's places, or at one of them, a spot or a break:
 * the sea is another under new conditions, and at another place. Nothing is told of what is
 * forgotten, and the next look starts as the first did.
 */
export async function forgetSeen(tx: Transaction, alertId: string, placeId?: string) {
  await tx
    .delete(alertWindow)
    .where(
      and(eq(alertWindow.alertId, alertId), placeId ? eq(alertWindow.placeId, placeId) : undefined),
    );
  await tx
    .update(alertSpot)
    .set({
      told: [],
      mailed: [],
      mailBegun: [],
      pushed: [],
      pushBegun: [],
      cutBy: null,
      begun: [],
      lookedAt: null,
    })
    .where(
      and(eq(alertSpot.alertId, alertId), placeId ? eq(alertSpot.placeId, placeId) : undefined),
    );
}

// A time zone, kept as the runtime spells it, whatever case it came in.
const zoneSchema = z
  .string()
  .max(64)
  .transform((name, context) => {
    const zone = zoneNamed(name);
    if (zone) return zone;
    context.addIssue({ code: "custom", message: "must be the IANA name of a time zone" });
    return z.NEVER;
  });

// What the device a request comes from would give an account that has none yet: its time zone
// and its language. An account that has one keeps it, whatever is given here.
const deviceFields = {
  zoneIfNone: zoneSchema
    .optional()
    .describe("The time zone to take if the account has none yet. It keeps the one it has."),
  localeIfNone: z
    .enum(LOCALES)
    .optional()
    .describe("The language to take if the account has none yet. It keeps the one it has."),
};

/**
 * Gives an account the time zone and the language of the device it first sets something from,
 * when it has none: decision 031. The database decides, so that two devices at once do not
 * take one another's place.
 */
async function settleDevice(
  tx: Database | Transaction,
  userId: string,
  device: { zoneIfNone?: string; localeIfNone?: Locale },
) {
  if (!device.zoneIfNone && !device.localeIfNone) return;
  await tx
    .insert(alertSettings)
    .values({ userId, zone: device.zoneIfNone, locale: device.localeIfNone })
    .onConflictDoUpdate({
      target: alertSettings.userId,
      set: {
        ...(device.zoneIfNone
          ? { zone: sql`coalesce(${alertSettings.zone}, ${device.zoneIfNone})` }
          : {}),
        ...(device.localeIfNone
          ? { locale: sql`coalesce(${alertSettings.locale}, ${device.localeIfNone})` }
          : {}),
      },
    });
}

/**
 * Keeps what an account answers about mail with the alert it is asked with, when it never
 * answered: decision 031. An answer it gave before stands, whatever is given here. Saying yes
 * makes the key that the link of its mails carries.
 */
async function settleMail(tx: Database | Transaction, userId: string, byMail: boolean) {
  const key = byMail ? crypto.randomUUID() : null;
  await tx
    .insert(alertSettings)
    .values({ userId, byMail, mailKey: key })
    .onConflictDoUpdate({
      target: alertSettings.userId,
      set: {
        mailKey: sql`case when ${alertSettings.byMail} is null then ${key} else ${alertSettings.mailKey} end`,
        byMail: sql`coalesce(${alertSettings.byMail}, ${byMail}::boolean)`,
      },
    });
}

const stretchSchema = z.object({ start: z.date(), end: z.date() });
const dayHoursSchema = z
  .array(
    z
      .object({
        from: z.number().int().min(0).max(DAY_MINUTES).multipleOf(60),
        to: z.number().int().min(0).max(DAY_MINUTES).multipleOf(60),
      })
      .refine((hours) => hours.from < hours.to, "hours end after they begin"),
  )
  .max(6);

const settingsSchema = z.object({
  // How many days ahead a window may be told.
  horizonDays: z.number(),
  // The IANA name of the account's time zone. Null until it is known: UTC then.
  zone: z.string().nullable(),
  locale: z.enum(LOCALES).nullable(),
  // The moments, each of which can be switched off.
  onFound: z.boolean(),
  onEvening: z.boolean(),
  // The hour of the evening message, in minutes since midnight.
  eveningMinutes: z.number(),
  onChange: z.boolean(),
  onBegin: z.boolean(),
  // How long before a window begins "it is on" is told, in minutes.
  noticeMinutes: z.number(),
  daylightOnly: z.boolean(),
  // The account's hours for each day of the week, Monday first. Null for any hour.
  week: z.array(dayHoursSchema).nullable(),
  // The account is away until then: no hour before it is open, and so none is told.
  awayUntil: z.date().nullable(),
  // The hours in which nothing is sent, in minutes since midnight. Both null for none.
  quietFrom: z.number().nullable(),
  quietTo: z.number().nullable(),
  // Whether alerts are mailed. Null until the account has said.
  byMail: z.boolean().nullable(),
  namesInSubject: z.boolean(),
  // Whether a mail can reach the account, which is no setting of its own: "ready" on an instance
  // that sends mail, to an address that was checked, "unchecked" while the address was not, and
  // "off" on an instance that sends no mail.
  mail: z.enum(["ready", "unchecked", "off"]),
});

// Whether a mail can reach the caller's account.
function mailOf(context: {
  verification: { isOn: boolean };
  session: { user: { emailVerified: boolean } };
}) {
  if (!context.verification.isOn) return "off" as const;
  return context.session.user.emailVerified ? ("ready" as const) : ("unchecked" as const);
}

const minutesOfDay = z
  .number()
  .int()
  .min(0)
  .max(DAY_MINUTES - 1);

// Each day's hours in order, with those that touch or overlap made one.
function tidied(week: z.infer<typeof dayHoursSchema>[]) {
  return week.map((day) => {
    const merged: { from: number; to: number }[] = [];
    for (const hours of [...day].sort((a, b) => a.from - b.from)) {
      const last = merged.at(-1);
      if (last && hours.from <= last.to) last.to = Math.max(last.to, hours.to);
      else merged.push({ ...hours });
    }
    return merged;
  });
}

export const alertsRouter = {
  create: protectedProcedure
    .meta({ analytics: "alert_created" })
    .route({
      method: "POST",
      path: "/alerts",
      successStatus: 201,
      summary: "Set an alert on one place, or on several that work in the same conditions",
      description:
        "Its places are spots of the caller's own, in `spotIds`, and surf breaks of the " +
        "catalogue, in `breakIds`: one at least, and twelve together at most. The conditions " +
        "are checked at each place, with its own forecast and tide. A place may be in several " +
        "alerts, each with its name and its conditions.",
      tags: ["Alerts"],
    })
    .input(
      z
        .object({
          name: nameSchema,
          spotIds: spotIdsSchema.default([]),
          breakIds: breakIdsSchema.default([]),
          criteria: conditionsSchema,
          enabled: z.boolean().default(true),
          shortestMinutes: shortestSchema.default(120),
          ...deviceFields,
          byMailIfNone: z
            .boolean()
            .optional()
            .describe(
              "Whether the account wants its alerts by mail, if it never said. It keeps the " +
                "answer it gave. Mail leaves once its address is checked.",
            ),
        })
        .refine(placesHeld, placesMessage),
    )
    .output(alertSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { spotIds, breakIds, zoneIfNone, localeIfNone, byMailIfNone, ...fields } = input;

      const created = await context.db.transaction(async (tx) => {
        // Locking the account row makes its creations run one after the other, so two requests
        // at once cannot both pass the limit.
        await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
        const [owned] = await tx
          .select({ total: count() })
          .from(alert)
          .where(eq(alert.userId, userId));
        if ((owned?.total ?? 0) >= MAX_ALERTS_PER_USER) return null;

        await claimSpots(tx, userId, spotIds);
        await claimBreaks(tx, breakIds);
        const [row] = await tx
          .insert(alert)
          .values({ ...fields, id: crypto.randomUUID(), userId })
          .returning();
        if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
        // The spots first, then the breaks.
        await tx.insert(alertSpot).values([
          ...spotIds.map((spotId, position) => ({ spotId, alertId: row.id, position })),
          ...breakIds.map((breakId, index) => ({
            breakId,
            alertId: row.id,
            position: spotIds.length + index,
          })),
        ]);
        // An account's days and hours are read in the time zone of its first alert's device.
        await settleDevice(tx, userId, { zoneIfNone, localeIfNone });
        // And what it answers about mail is saved with the alert, or not at all.
        if (byMailIfNone !== undefined) await settleMail(tx, userId, byMailIfNone);
        return row;
      });
      if (created === null) {
        throw new ORPCError("FORBIDDEN", {
          message: `An account holds at most ${MAX_ALERTS_PER_USER} alerts.`,
        });
      }
      return describeAlert(
        created,
        (await placesOf(context.db, [created.id])).get(created.id) ?? [],
      );
    }),

  list: protectedProcedure
    .meta({
      mcp: {
        name: "list_my_alerts",
        title: "The account's alerts",
        account: true,
        description:
          "The alerts of the account you act for. An alert names the conditions that make " +
          "some of its spots work, in `criteria`: bounds on the wave height, its peak " +
          "period and the direction it comes from, on the first swell, on the wind's speed " +
          "and direction, on the tide's height, and whether the tide rises or falls. A " +
          "condition left out asks nothing. It is set on the places of `places`, in order, each " +
          "with its name: a spot of the account's, whose id list_my_spots names in `spotIds`, or " +
          "a surf break of the catalogue, whose id search_surf_breaks names in `breakIds`. It tells its owner when the forecast holds them for `shortestMinutes` at " +
          "least. `enabled: false` is an alert that is paused. Use `criteria` to say " +
          "whether a forecast you read is what the person waits for. This tool changes no " +
          "alert. Next: list_my_alert_notifications for what the alerts told lately.",
      },
    })
    .route({ method: "GET", path: "/alerts", summary: "The caller's alerts", tags: ["Alerts"] })
    .output(z.object({ alerts: z.array(alertSchema) }))
    .handler(async ({ context }) => {
      const rows = await context.db
        .select()
        .from(alert)
        .where(eq(alert.userId, context.session.user.id))
        .orderBy(asc(alert.createdAt), asc(alert.id));
      const places = await placesOf(
        context.db,
        rows.map((row) => row.id),
      );
      return { alerts: rows.map((row) => describeAlert(row, places.get(row.id) ?? [])) };
    }),

  get: protectedProcedure
    .route({
      method: "GET",
      path: "/alerts/{id}",
      summary: "One of the caller's alerts",
      tags: ["Alerts"],
    })
    .input(z.object({ id: z.string() }))
    .output(alertSchema)
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .select()
        .from(alert)
        .where(and(eq(alert.id, input.id), eq(alert.userId, context.session.user.id)));
      if (!row) throw notFound(input.id);
      const places = await placesOf(context.db, [row.id]);
      return describeAlert(row, places.get(row.id) ?? []);
    }),

  update: protectedProcedure
    .meta({ analytics: "alert_updated" })
    .route({
      method: "PATCH",
      path: "/alerts/{id}",
      summary: "Change one of the caller's alerts",
      description:
        "What is left out stays as it is. `spotIds`, when given, are all the spots of the " +
        "alert from then on, and `breakIds` all its breaks. New conditions start the alert over, and so does switching it " +
        "off: what it saw of the sea and what it told are forgotten, and nothing is called off.",
      tags: ["Alerts"],
    })
    .input(
      z.object({
        id: z.string(),
        name: nameSchema.optional(),
        spotIds: spotIdsSchema.optional(),
        breakIds: breakIdsSchema.optional(),
        criteria: conditionsSchema.optional(),
        enabled: z.boolean().optional(),
        shortestMinutes: shortestSchema.optional(),
      }),
    )
    .output(alertSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { id, spotIds, breakIds, ...changes } = input;

      return context.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(alert)
          .where(and(eq(alert.id, id), eq(alert.userId, userId)))
          .for("update");
        if (!current) throw notFound(id);

        const held = (await placesOf(tx, [id])).get(id) ?? [];
        const spotsBefore = held.flatMap((place) => place.spotId ?? []);
        const breaksBefore = held.flatMap((place) => place.breakId ?? []);
        const spotsAfter = spotIds ?? spotsBefore;
        const breaksAfter = breakIds ?? breaksBefore;
        if (!placesHeld({ spotIds: spotsAfter, breakIds: breaksAfter })) {
          throw new ORPCError("BAD_REQUEST", { message: placesMessage });
        }
        const addedSpots = spotsAfter.filter((spotId) => !spotsBefore.includes(spotId));
        const addedBreaks = breaksAfter.filter((breakId) => !breaksBefore.includes(breakId));
        // A place is named by its id, a spot's or a break's: both are UUIDs.
        const removed = [
          ...spotsBefore.filter((spotId) => !spotsAfter.includes(spotId)),
          ...breaksBefore.filter((breakId) => !breaksAfter.includes(breakId)),
        ];
        const added = [...addedSpots, ...addedBreaks];
        await claimSpots(tx, userId, addedSpots);
        await claimBreaks(tx, addedBreaks);

        // What a look reads has changed: one that is under way writes nothing.
        const asksOtherwise =
          (changes.criteria !== undefined &&
            JSON.stringify(changes.criteria) !== JSON.stringify(current.criteria)) ||
          (changes.shortestMinutes !== undefined &&
            changes.shortestMinutes !== current.shortestMinutes);
        // Under new conditions the sea is another, and an alert that is switched off stops
        // following what it told: either way it starts over.
        const startsOver =
          (changes.criteria !== undefined &&
            JSON.stringify(changes.criteria) !== JSON.stringify(current.criteria)) ||
          (changes.enabled === false && current.enabled);
        // A look that is under way must not write back what starting over has just forgotten,
        // were the alert switched on again before it ends.
        const isRead = asksOtherwise || startsOver || added.length > 0 || removed.length > 0;
        if (startsOver) {
          await forgetSeen(tx, id);
        } else if (removed.length > 0) {
          await tx
            .delete(alertWindow)
            .where(and(eq(alertWindow.alertId, id), inArray(alertWindow.placeId, removed)));
        }
        if (removed.length > 0) {
          await tx
            .delete(alertSpot)
            .where(and(eq(alertSpot.alertId, id), inArray(alertSpot.placeId, removed)));
        }
        if (added.length > 0) {
          // After the places that stay, whatever place those that left had.
          const [last] = await tx
            .select({ position: max(alertSpot.position) })
            .from(alertSpot)
            .where(eq(alertSpot.alertId, id));
          const from = (last?.position ?? -1) + 1;
          await tx.insert(alertSpot).values([
            ...addedSpots.map((spotId, index) => ({ spotId, alertId: id, position: from + index })),
            ...addedBreaks.map((breakId, index) => ({
              breakId,
              alertId: id,
              position: from + addedSpots.length + index,
            })),
          ]);
        }

        const [updated] = await tx
          .update(alert)
          .set({
            ...changes,
            ...(isRead ? { revision: sql`${alert.revision} + 1` } : {}),
            // An alert that starts over is looked at by the next run, as a new one is.
            ...(startsOver ? { lookedAt: null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(alert.id, id))
          .returning();
        if (!updated) throw notFound(id);
        // The places that stay keep their place, and the new ones come after them.
        return describeAlert(updated, (await placesOf(tx, [id])).get(id) ?? []);
      });
    }),

  delete: protectedProcedure
    .meta({ analytics: "alert_deleted" })
    .route({
      method: "DELETE",
      path: "/alerts/{id}",
      summary: "Delete one of the caller's alerts",
      description: "Its places stay. What it told stays in the caller's notifications.",
      tags: ["Alerts"],
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [deleted] = await context.db
        .delete(alert)
        .where(and(eq(alert.id, input.id), eq(alert.userId, context.session.user.id)))
        .returning({ id: alert.id });
      if (!deleted) throw notFound(input.id);
      return deleted;
    }),

  preview: protectedProcedure
    .meta({ analytics: "alert_previewed" })
    .route({
      method: "POST",
      path: "/alerts/preview",
      summary: "What conditions would give at some places, before they are saved",
      description:
        "The places are spots of the caller's own and surf breaks of the catalogue, as an " +
        "alert's are. For each place, under `spotId`, its id, with `breakId` for a break: the forecast and the tide hour by hour, the conditions each hour does " +
        "not meet, the windows in which all are met, and the hours of those windows the caller " +
        "can use, by the settings of their account. Nothing is saved and nothing is told.",
      tags: ["Alerts"],
    })
    .input(
      z
        .object({
          spotIds: spotIdsSchema.default([]),
          breakIds: breakIdsSchema.default([]),
          criteria: askedSchema,
          shortestMinutes: shortestSchema.default(120),
          days: z.number().int().min(1).max(MAX_FORECAST_DAYS).default(7),
        })
        .refine(placesHeld, placesMessage),
    )
    .output(
      z.object({
        spots: z.array(
          z.object({
            // The place's id, a spot's or a break's, and the break's when it is one.
            spotId: z.string(),
            breakId: z.string().nullable(),
            // False for a spot with no sea forecast: there is nothing else then.
            hasSea: z.boolean(),
            // Null when no tide station is close enough. Tide conditions are then never met.
            hasTide: z.boolean(),
            hours: z.array(
              z.object({
                time: z.date(),
                waveHeightMeters: z.number().nullable(),
                wavePeakPeriodSeconds: z.number().nullable(),
                waveDirectionDegrees: z.number().nullable(),
                // The first swell apart from the wind sea, where a model gives one. The three
                // above are the whole sea, with the period of its peak.
                primarySwellHeightMeters: z.number().nullable(),
                primarySwellDirectionDegrees: z.number().nullable(),
                windSpeedMetersPerSecond: z.number().nullable(),
                windDirectionDegrees: z.number().nullable(),
                tideHeightMeters: z.number().nullable(),
                tideTrend: z.enum(["rising", "falling"]).nullable(),
                // The conditions this hour does not meet. Empty when the spot works.
                unmet: z.array(criteriaSchema.keyof()),
              }),
            ),
            // The runs of hours in which every condition is met.
            windows: z.array(stretchSchema),
            // The hours of those windows the caller can use.
            open: z.array(stretchSchema),
            // When the instance fetched the forecast of this spot, and whether it is an older
            // one, given because the provider could not be asked.
            forecastFetchedAt: z.date(),
            forecastStale: z.boolean(),
          }),
        ),
        forecastSource: forecastSourceSchema,
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const owned =
        input.spotIds.length === 0
          ? []
          : await context.db
              .select()
              .from(spot)
              .where(and(inArray(spot.id, input.spotIds), eq(spot.userId, userId)));
      const missing = input.spotIds.find((id) => !owned.some((row) => row.id === id));
      if (missing) throw new ORPCError("NOT_FOUND", { message: `No spot "${missing}".` });
      const breaks =
        input.breakIds.length === 0
          ? []
          : await context.db.select().from(surfBreak).where(inArray(surfBreak.id, input.breakIds));
      const absent = input.breakIds.find((id) => !breaks.some((row) => row.id === id));
      if (absent) throw new ORPCError("NOT_FOUND", { message: `No surf break "${absent}".` });
      // The spots first, then the breaks, as an alert holds them.
      const places = [
        ...input.spotIds.map((id) => ({ ...owned.find((row) => row.id === id)!, breakId: null })),
        ...input.breakIds.map((id) => ({ ...breaks.find((row) => row.id === id)!, breakId: id })),
      ];
      const [row] = await context.db
        .select()
        .from(alertSettings)
        .where(eq(alertSettings.userId, userId));
      const availability = availabilityOf(settingsOf(row));

      // One question of the account's hour, whatever the number of places.
      await admitForecastQuestion(context);
      // One place after the other: neighbours share a cell of the forecast, which the first of
      // them fetches for all.
      const assessed = [];
      for (const place of places) {
        const result = await Effect.runPromise(
          Effect.result(
            assessSpot(context.forecasts, { ...place, criteria: input.criteria }, input.days),
          ),
        );
        if (Result.isFailure(result)) throw forecastUnavailable(result.failure);
        assessed.push({ place, found: result.success });
      }

      const source = assessed.find((entry) => entry.found.hasSea)?.found;
      if (!source?.hasSea) {
        throw new ORPCError("NOT_FOUND", { message: "No sea forecast for these spots." });
      }
      return {
        spots: assessed.map(({ place, found }) => ({
          spotId: place.id,
          breakId: place.breakId,
          forecastFetchedAt: found.forecastFetchedAt,
          forecastStale: found.forecastStale,
          ...(found.hasSea
            ? {
                hasSea: true,
                hasTide: found.tideStation !== null,
                hours: found.hours,
                windows: found.windows,
                open: found.windows.flatMap((sea) =>
                  openHours(sea, place, availability, input.shortestMinutes),
                ),
              }
            : { hasSea: false, hasTide: false, hours: [], windows: [], open: [] }),
        })),
        forecastSource: source.forecastSource,
      };
    }),

  getSettings: protectedProcedure
    .route({
      method: "GET",
      path: "/alert-settings",
      summary: "How the caller wants to be told, for all their alerts",
      description: "An account that has set nothing is given the defaults.",
      tags: ["Alerts"],
    })
    .output(settingsSchema)
    .handler(async ({ context }) => {
      const [row] = await context.db
        .select()
        .from(alertSettings)
        .where(eq(alertSettings.userId, context.session.user.id));
      return { ...settingsOf(row), mail: mailOf(context) };
    }),

  updateSettings: protectedProcedure
    .meta({ analytics: "alert_settings_updated" })
    .route({
      method: "PATCH",
      path: "/alert-settings",
      summary: "Change how the caller wants to be told",
      description:
        "What is left out stays as it is. A setting changes what is told from then on: it " +
        "calls nothing off, and tells nothing again. `zoneIfNone` and `localeIfNone` are " +
        "taken by an account that has no time zone or no language yet, and by no other.",
      tags: ["Alerts"],
    })
    .input(
      z
        .object({
          horizonDays: z.number().int().min(1).max(MAX_HORIZON_DAYS),
          zone: zoneSchema,
          locale: z.enum(LOCALES),
          onFound: z.boolean(),
          onEvening: z.boolean(),
          eveningMinutes: minutesOfDay,
          onChange: z.boolean(),
          onBegin: z.boolean(),
          noticeMinutes: z.number().int().min(0).max(240).multipleOf(15),
          daylightOnly: z.boolean(),
          week: z.array(dayHoursSchema).length(7).nullable(),
          awayUntil: z.coerce.date().nullable(),
          quietFrom: minutesOfDay.nullable(),
          quietTo: minutesOfDay.nullable(),
          byMail: z.boolean(),
          namesInSubject: z.boolean(),
        })
        .partial()
        .extend(deviceFields)
        .refine(
          (settings) => (settings.quietFrom === null) === (settings.quietTo === null),
          "quiet hours have a beginning and an end, or neither",
        ),
    )
    .output(settingsSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { zoneIfNone, localeIfNone, ...given } = input;
      const changes = { ...given, ...(given.week ? { week: tidied(given.week) } : {}) };
      // Quiet hours are given whole: a beginning without an end would leave the other as it was.
      if ((changes.quietFrom === undefined) !== (changes.quietTo === undefined)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Quiet hours are given with both their beginning and their end.",
        });
      }
      // A zone or a language that is given is taken. One that is only offered is for an
      // account that has none.
      const device = {
        ...(changes.zone === undefined ? { zoneIfNone } : {}),
        ...(changes.locale === undefined ? { localeIfNone } : {}),
      };
      const row = await context.db.transaction(async (tx) => {
        await settleDevice(tx, userId, device);
        // Switching mail on makes the key its mails' link carries, anew each time: the link of
        // a mail from before it was switched off stops working. Switching it off forgets it.
        const key = crypto.randomUUID();
        const mailKey =
          changes.byMail === undefined
            ? {}
            : changes.byMail
              ? {
                  values: { mailKey: key },
                  set: {
                    mailKey: sql`case when ${alertSettings.byMail} is true then ${alertSettings.mailKey} else ${key} end`,
                  },
                }
              : { values: { mailKey: null }, set: { mailKey: null } };
        const [saved] = await tx
          .insert(alertSettings)
          .values({ userId, ...changes, ...mailKey.values })
          .onConflictDoUpdate({
            target: alertSettings.userId,
            set: { ...changes, ...mailKey.set, updatedAt: new Date() },
          })
          .returning();
        // A mail that waits for the end of quiet hours waits for those the account has now:
        // the worker reads them again at its next pass, and not at the hour it kept.
        if (changes.quietFrom !== undefined || changes.zone !== undefined || device.zoneIfNone) {
          await tx
            .update(notificationDelivery)
            .set({ dueAt: sql`least(${notificationDelivery.dueAt}, now())` })
            .where(
              and(
                eq(notificationDelivery.state, "pending"),
                inArray(
                  notificationDelivery.notificationId,
                  tx
                    .select({ id: notification.id })
                    .from(notification)
                    .where(eq(notification.userId, userId)),
                ),
              ),
            );
        }
        return saved;
      });
      return { ...settingsOf(row), mail: mailOf(context) };
    }),

  mailOff: linkProcedure
    .route({
      method: "POST",
      path: "/alert-mails/off",
      inputStructure: "detailed",
      summary: "Stop the alert mails of an account, from the link of one of them",
      description:
        "What the link at the foot of an alert mail does, and what a mail program asks when " +
        'its reader presses "unsubscribe": it takes no session and no key of the API. `u` and ' +
        "`k` are the two values the link carries. It switches alert mails off for that account " +
        "and does nothing else: it reads nothing, and switches nothing on.",
      tags: ["Alerts"],
    })
    .input(
      z.object({
        query: z.object({
          u: z.string().min(1).max(200).describe("The account, as the link names it."),
          k: z.string().min(1).max(200).describe("The key the link carries."),
          l: z
            .string()
            .max(8)
            .optional()
            .describe("The language of the mail, which the page uses."),
        }),
      }),
    )
    .output(
      z.object({
        // False for a link that is no longer good: mail was switched off since, or on again.
        off: z.boolean(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { u, k } = input.query;
      const stopped = await context.db
        .update(alertSettings)
        .set({ byMail: false, mailKey: null, updatedAt: new Date() })
        .where(and(eq(alertSettings.userId, u), eq(alertSettings.mailKey, k)))
        .returning({ userId: alertSettings.userId })
        // What the database says of a query that failed holds the key: it is not passed on to
        // where faults are logged.
        .catch(() => null);
      if (!stopped) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return { off: stopped.length > 0 };
    }),

  mailOffPage: linkProcedure
    .route({
      method: "GET",
      path: "/alert-mails/off",
      inputStructure: "detailed",
      outputStructure: "detailed",
      successStatus: 303,
      summary: "Go to the page that stops the alert mails of an account",
      description:
        "Where a mail program lands when it opens the address of a mail's `List-Unsubscribe` " +
        "header instead of posting to it: the page of the web app with the one button that " +
        "stops alert mails. Following it switches nothing off.",
      tags: ["Alerts"],
    })
    .input(
      z.object({
        query: z.object({
          u: z.string().max(200).optional().describe("The account, as the link names it."),
          k: z.string().max(200).optional().describe("The key the link carries."),
          l: z.string().max(8).optional().describe("The language of the mail the link is in."),
        }),
      }),
    )
    .output(z.object({ headers: z.object({ location: z.string() }) }))
    .handler(({ input, context }) => {
      const { u = "", k = "", l } = input.query;
      // The page is in the language of the mail, which the link says: nothing is read of the
      // account, since the key of a link reads nothing.
      const page = `${context.server.webOrigin}${localePrefix(l && isLocale(l) ? l : "en")}/mail-off`;
      return { headers: { location: `${page}?${new URLSearchParams({ u, k })}` } };
    }),
};
