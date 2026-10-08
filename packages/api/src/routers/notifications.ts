import { ORPCError } from "@orpc/server";
import { notification, spot } from "@repo/db/schema/spots";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";

const notificationSchema = z.object({
  id: z.string(),
  // "window_found": the spot is forecast to work. "window_cancelled": that window is gone.
  kind: z.enum(["window_found", "window_cancelled"]),
  spot: z.object({ id: z.string(), name: z.string() }),
  windowStart: z.date(),
  windowEnd: z.date(),
  // Null until the caller marks it as read.
  readAt: z.date().nullable(),
  createdAt: z.date(),
});

const selection = {
  id: notification.id,
  kind: notification.kind,
  windowStart: notification.windowStart,
  windowEnd: notification.windowEnd,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
  spot: { id: spot.id, name: spot.name },
};

export const notificationsRouter = {
  list: protectedProcedure
    .route({
      method: "GET",
      path: "/notifications",
      summary: "The caller's notifications, newest first",
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
        .innerJoin(spot, eq(spot.id, notification.spotId))
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
