import { ORPCError } from "@orpc/server";
import { ALERT_MOMENTS, notification } from "@repo/db/schema/alerts";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";

const stretchSchema = z.object({ start: z.string(), end: z.string() });
const measure = z.number().nullable();

// What a notification said, as it said it: decision 031. The names are those of the moment it
// was made, and the hours were worked out in `zone`.
const payloadSchema = z.object({
  // The alert's name then. Null for the evening before, which lists every alert.
  alertName: z.string().nullable(),
  zone: z.string(),
  // For the evening before: the day it lists, as "2026-10-15".
  day: z.string().optional(),
  lines: z.array(
    z.object({
      // The id of the line's place and its name: a spot of the account's, or the surf break
      // of the catalogue `breakId` names, whose id it then is. Decision 064.
      spotId: z.string(),
      spotName: z.string(),
      breakId: z.string().optional(),
      // When the forecast the spot was read on was fetched.
      forecastFetchedAt: z.string().optional(),
      // For the evening before: the alert the spot is in, and its name then.
      alertId: z.string().optional(),
      alertName: z.string().optional(),
      // The window's open hours. None for a window that is gone.
      open: z.array(stretchSchema),
      // For a window that moved or went: its open hours as they had been told.
      before: z.array(stretchSchema).optional(),
      // What the forecast gave for the first of the open hours.
      sea: z
        .object({
          waveHeightMeters: measure,
          wavePeakPeriodSeconds: measure,
          waveDirectionDegrees: measure,
          // The first swell apart from the wind sea, for an alert that asks about it.
          primarySwellHeightMeters: measure.optional(),
          primarySwellDirectionDegrees: measure.optional(),
          windSpeedMetersPerSecond: measure,
          windDirectionDegrees: measure,
          tideHeightMeters: measure,
          tideTrend: z.enum(["rising", "falling"]).nullable(),
        })
        .optional(),
      // For a window that begins: what the nearest buoy last read. It is the whole sea where
      // the buoy floats, and confirms nothing of the spot. Null far from any buoy.
      buoy: z
        .object({
          stationId: z.string(),
          name: z.string(),
          distanceKm: z.number(),
          observedAt: z.string(),
          significantHeightMeters: measure,
          peakPeriodSeconds: measure,
          peakDirectionDegrees: measure,
          // Who the station's readings are credited to.
          attribution: z.string().optional(),
        })
        .nullable()
        .optional(),
    }),
  ),
});

const notificationSchema = z.object({
  id: z.string(),
  // The alert it is of. Null for the evening before, and once the alert is deleted.
  alertId: z.string().nullable(),
  // "found": a window holds. "moved": a told window moved by more than two hours. "gone": a told
  // window left the forecast. "evening": the windows of the next day. "begins": a window is on.
  moment: z.enum(ALERT_MOMENTS),
  payload: payloadSchema,
  // Null until the caller marks it as read.
  readAt: z.date().nullable(),
  createdAt: z.date(),
});

const selection = {
  id: notification.id,
  alertId: notification.alertId,
  moment: notification.moment,
  payload: notification.payload,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
};

export const notificationsRouter = {
  list: protectedProcedure
    .meta({
      mcp: {
        name: "list_my_alert_notifications",
        title: "What the account's alerts told",
        account: true,
        description:
          "What the alerts of the account you act for told it, the newest first. `moment` " +
          "says why: `found` when the forecast holds a window that the alert asks for, " +
          "`moved` when a window that was told moved by more than two hours, `gone` when " +
          "it left the forecast, `evening` for the windows of the next day, and `begins` " +
          "when a window is on. `payload` holds the spots and their open hours, in UTC. " +
          "`readAt` is null until the person read it. It answers 20 unless `limit` says " +
          "another, 200 at most. Reading here marks nothing as read.",
        defaults: { limit: 20 },
      },
    })
    .route({
      method: "GET",
      path: "/notifications",
      summary: "What the caller's alerts told them, newest first",
      tags: ["Notifications"],
    })
    .input(
      z.object({
        // A query string carries "true" or "false", a typed client a boolean.
        unreadOnly: z.union([z.boolean(), z.stringbool()]).default(false),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    )
    .output(z.object({ notifications: z.array(notificationSchema) }))
    .handler(async ({ input, context }) => {
      const notifications = await context.db
        .select(selection)
        .from(notification)
        .where(
          and(
            eq(notification.userId, context.session.user.id),
            input.unreadOnly ? isNull(notification.readAt) : undefined,
          ),
        )
        .orderBy(desc(notification.createdAt))
        .limit(input.limit);
      return { notifications };
    }),

  markRead: protectedProcedure
    .meta({ analytics: "notification_read" })
    .route({
      method: "POST",
      path: "/notifications/{id}/read",
      summary: "Mark one of the caller's notifications as read",
      tags: ["Notifications"],
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ id: z.string(), readAt: z.date() }))
    .handler(async ({ input, context }) => {
      const owned = and(
        eq(notification.id, input.id),
        eq(notification.userId, context.session.user.id),
      );
      // The first reading keeps its time.
      await context.db
        .update(notification)
        .set({ readAt: new Date() })
        .where(and(owned, isNull(notification.readAt)));

      const [row] = await context.db
        .select({ id: notification.id, readAt: notification.readAt })
        .from(notification)
        .where(owned);
      if (!row?.readAt)
        throw new ORPCError("NOT_FOUND", { message: `No notification "${input.id}".` });
      return { id: row.id, readAt: row.readAt };
    }),
};
