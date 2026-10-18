import { ORPCError } from "@orpc/server";
import {
  ACCOUNT_MOST_BYTES,
  kindOfType,
  MEDIA_KINDS,
  MEDIA_MOST_BYTES,
  VIDEO_MOST_SECONDS,
} from "@repo/config/media";
import { holdAccounts } from "@repo/db/accounts";
import { media } from "@repo/db/schema/media";
import { surfSession } from "@repo/db/schema/sessions";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";
import {
  describeMedia,
  INSTANCE_DAILY_BYTES,
  mediaItemSchema,
  storageOf,
  UPLOAD_SECONDS,
  UPLOADS_PER_HOUR,
  uploadsPaused,
  wakeWorker,
} from "../media";

// The photos and the videos an account sends: decision 066. A file goes from the browser to the
// bucket, and never through the API: the API signs where it goes, then hears that it is there.

const HOUR_MS = 60 * 60 * 1000;

function notFound(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No photo or video "${id}".` });
}

export const mediaRouter = {
  prepare: protectedProcedure
    .meta({ analytics: "media_upload_started" })
    .route({
      method: "POST",
      path: "/media",
      successStatus: 201,
      summary: "Ask where to send a photo or a video",
      description:
        "For a session of the caller's log. `contentType` and `bytes` say what will be sent: " +
        "the answer is an address that takes that file, of that type and that size, with PUT and " +
        "the headers it gives, for fifteen minutes. Once it is sent, `POST /media/{id}/uploaded` " +
        "says so. A photo is at most 40 MB, a video 1 GB and a minute long; an account keeps " +
        "2 GB once each file is made smaller, and asks for 40 files an hour.",
      tags: ["Media"],
    })
    .input(
      z.object({
        purpose: z.literal("session"),
        contentType: z.string().max(100),
        bytes: z.number().int().min(1),
        // How long the video lasts, as the browser read it: one that says too long is refused
        // here. The worker reads it again from the file.
        durationSeconds: z.number().min(0).optional(),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        kind: z.enum(MEDIA_KINDS),
        upload: z.object({ url: z.string(), headers: z.record(z.string(), z.string()) }),
        expiresAt: z.date(),
      }),
    )
    .handler(async ({ input, context }) => {
      const storage = storageOf(context.storage);
      const userId = context.session.user.id;
      const kind = kindOfType(input.contentType);
      if (!kind) {
        throw new ORPCError("BAD_REQUEST", { message: "This is no photo or video it takes." });
      }
      if (input.bytes > MEDIA_MOST_BYTES[kind]) {
        throw new ORPCError("BAD_REQUEST", {
          message: `A ${kind} is at most ${MEDIA_MOST_BYTES[kind] / 1024 / 1024} MB.`,
        });
      }
      const mostSeconds = VIDEO_MOST_SECONDS[input.purpose];
      if (kind === "video" && (input.durationSeconds ?? 0) > mostSeconds + 0.5) {
        throw new ORPCError("BAD_REQUEST", {
          message: `A video lasts ${mostSeconds} seconds at most.`,
        });
      }

      const now = Date.now();
      const id = crypto.randomUUID();
      const refused = await context.db.transaction(async (tx) => {
        // What an account sends is counted one request after the other.
        await holdAccounts(tx, [userId]);
        if (await uploadsPaused(tx)) return "paused" as const;
        const [mine] = await tx
          .select({
            lastHour: sql<number>`(count(*) filter (where ${media.createdAt} >= ${new Date(now - HOUR_MS)}))::int`,
            // What is kept once made smaller, and what waits to be, at the size it was said.
            kept: sql<number>`(coalesce(sum(case when ${media.state} in ('awaiting_upload', 'uploaded') then ${media.uploadBytes} else ${media.bytes} end), 0))::float8`,
          })
          .from(media)
          .where(eq(media.userId, userId));
        if ((mine?.lastHour ?? 0) >= UPLOADS_PER_HOUR) return "hour" as const;
        if ((mine?.kept ?? 0) + input.bytes > ACCOUNT_MOST_BYTES) return "full" as const;
        const midnight = new Date(now);
        midnight.setUTCHours(0, 0, 0, 0);
        const [day] = await tx
          .select({ sent: sql<number>`(coalesce(sum(${media.uploadBytes}), 0))::float8` })
          .from(media)
          .where(gte(media.createdAt, midnight));
        if ((day?.sent ?? 0) + input.bytes > INSTANCE_DAILY_BYTES) return "day" as const;
        await tx.insert(media).values({
          id,
          userId,
          purpose: input.purpose,
          kind,
          uploadKey: `up/${id}`,
          uploadType: input.contentType.toLowerCase(),
          uploadBytes: input.bytes,
          // By the API's clock, which the counts above read.
          createdAt: new Date(now),
        });
        return null;
      });
      if (refused === "paused" || refused === "day") {
        throw new ORPCError("SERVICE_UNAVAILABLE", {
          message: "This instance takes no photos or videos for now. Try again later.",
        });
      }
      if (refused === "hour") {
        context.reply.retryAfterSeconds = 60 * 60;
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: `An account sends ${UPLOADS_PER_HOUR} files an hour at most.`,
        });
      }
      if (refused === "full") {
        throw new ORPCError("FORBIDDEN", {
          message: "This account keeps 2 GB of photos and videos at most.",
          data: { media: "full" },
        });
      }

      const upload = await storage.uploadTarget(
        `up/${id}`,
        { contentType: input.contentType.toLowerCase(), bytes: input.bytes },
        UPLOAD_SECONDS,
      );
      return { id, kind, upload, expiresAt: new Date(now + UPLOAD_SECONDS * 1000) };
    }),

  uploaded: protectedProcedure
    .route({
      method: "POST",
      path: "/media/{id}/uploaded",
      summary: "Say that a photo or a video was sent",
      description:
        "The bucket is asked what it holds: a file of the type and the size that were said. " +
        "The worker then makes of it what is shown, which `state` follows.",
      tags: ["Media"],
    })
    .input(z.object({ id: z.string() }))
    .output(mediaItemSchema)
    .handler(async ({ input, context }) => {
      const storage = storageOf(context.storage);
      const mine = and(eq(media.id, input.id), eq(media.userId, context.session.user.id));
      const [row] = await context.db.select().from(media).where(mine);
      if (!row) throw notFound(input.id);
      if (row.state !== "awaiting_upload") {
        return (await describeMedia(storage, [row], Date.now()))[0]!;
      }
      const held = await storage.head(row.uploadKey);
      if (!held) {
        throw new ORPCError("CONFLICT", { message: "Nothing was received for this file yet." });
      }
      const fits = held.bytes === row.uploadBytes && held.contentType === row.uploadType;
      const [updated] = await context.db
        .update(media)
        .set(
          fits
            ? { state: "uploaded", uploadEtag: held.etag, uploadedAt: new Date() }
            : { state: "failed", failure: "changed" },
        )
        .where(and(mine, eq(media.state, "awaiting_upload")))
        .returning();
      if (!fits) await storage.remove([row.uploadKey]);
      else await wakeWorker(context.db);
      const now = updated ?? (await context.db.select().from(media).where(mine))[0];
      if (!now) throw notFound(input.id);
      return (await describeMedia(storage, [now], Date.now()))[0]!;
    }),

  discard: protectedProcedure
    .route({
      method: "DELETE",
      path: "/media/{id}",
      summary: "Delete a photo or a video",
      description:
        "From the session it belongs to, or from the form it was sent from. Its files are " +
        "deleted from the bucket within minutes.",
      tags: ["Media"],
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [deleted] = await context.db
        .delete(media)
        .where(and(eq(media.id, input.id), eq(media.userId, context.session.user.id)))
        .returning({ id: media.id });
      if (!deleted) throw notFound(input.id);
      return deleted;
    }),

  sessions: protectedProcedure
    .route({
      method: "GET",
      path: "/media/sessions",
      summary: "The photos and the videos of some of the caller's sessions",
      description:
        "By session, in their order. A session that has none, or is not the caller's, is " +
        "left out.",
      tags: ["Media"],
    })
    .input(z.object({ sessionIds: z.array(z.string()).min(1).max(200) }))
    .output(z.object({ sessions: z.record(z.string(), z.array(mediaItemSchema)) }))
    .handler(async ({ input, context }) => {
      const rows = await context.db
        .select({ media })
        .from(media)
        .innerJoin(surfSession, eq(surfSession.id, media.sessionId))
        .where(
          and(
            inArray(media.sessionId, input.sessionIds),
            eq(media.userId, context.session.user.id),
            eq(surfSession.userId, context.session.user.id),
          ),
        )
        .orderBy(asc(media.sessionId), asc(media.position), asc(media.createdAt));
      const described = await describeMedia(
        context.storage,
        rows.map((row) => row.media),
        Date.now(),
      );
      const sessions: Record<string, typeof described> = {};
      rows.forEach((row, index) => {
        const sessionId = row.media.sessionId ?? "";
        (sessions[sessionId] ??= []).push(described[index]!);
      });
      return { sessions };
    }),
};
