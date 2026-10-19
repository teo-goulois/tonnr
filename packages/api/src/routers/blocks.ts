import { ORPCError } from "@orpc/server";
import { USERNAME_MAX } from "@repo/config/username";
import { holdAccounts } from "@repo/db/accounts";
import { BLOCKS_MOST } from "@repo/db/blocks";
import { pairOf } from "@repo/db/friends";
import { user } from "@repo/db/schema/auth";
import { accountBlock, friendship } from "@repo/db/schema/community";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";

// The accounts an account blocked: it reads nothing more of their reports, of their
// contributions that wait to be confirmed or of their usernames, and no link makes them friends.
// The blocked account is not told. Decision 071.

const blockSchema = z.object({
  // The block's own id, which lifts it. It names nothing of the blocked account: a block is no
  // way to learn an account's id from its username.
  id: z.string(),
  // The username the account had when it was blocked. A block does not follow the names it takes
  // later, which would tell the blocker who an account became: chosen here.
  username: z.string(),
  since: z.date(),
});

const asBlock = (row: typeof accountBlock.$inferSelect) => ({
  id: row.id,
  username: row.username,
  since: row.createdAt,
});

const noAccount = (username: string) =>
  new ORPCError("NOT_FOUND", { message: `No account @${username}.` });

export const blocksRouter = {
  add: protectedProcedure
    .meta({ analytics: "account_blocked" })
    .route({
      method: "POST",
      path: "/blocks",
      successStatus: 201,
      summary: "Block an account",
      description:
        "Takes a signed-in session, and the username of the account to block as the caller " +
        "reads it. From then on the caller reads none of its reports, none of its " +
        "contributions that wait to be confirmed, and its username nowhere: a confirmed line " +
        "of a guide stays, under no name. A friendship between the two ends, and no link makes " +
        "another while the block stands, either way. The block is kept by the two accounts' " +
        "ids, whatever usernames they take later, and answered under the username it was made " +
        "with, by an id of its own. The blocked account is not told. Blocking again changes " +
        `nothing. An account blocks ${BLOCKS_MOST} at most, and not itself: the answer is ` +
        "403, and 409. Decision 071.",
      tags: ["Blocks"],
    })
    .input(
      z.object({
        username: z
          .string()
          .trim()
          .min(1)
          .max(USERNAME_MAX + 1),
      }),
    )
    .output(blockSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      // A username is kept in small letters, and is written with an @ before it.
      const username = input.username.replace(/^@/, "").toLowerCase();
      const [found] = await context.db
        .select({ id: user.id, username: user.username })
        .from(user)
        .where(eq(user.username, username));
      if (!found) throw noAccount(username);
      if (found.id === userId) {
        throw new ORPCError("CONFLICT", { message: "An account does not block itself." });
      }

      return context.db.transaction(async (tx) => {
        // Both accounts are held, as a friendship holds them: one being made by a link at the
        // same moment is made first and ended here, or waits and is refused.
        await holdAccounts(tx, [userId, found.id]);
        // Deleted, or renamed, while it was found: it is no longer the account of this name.
        const [still] = await tx
          .select({ id: user.id })
          .from(user)
          .where(and(eq(user.id, found.id), eq(user.username, username)));
        if (!still) throw noAccount(username);
        const [already] = await tx
          .select()
          .from(accountBlock)
          .where(and(eq(accountBlock.blockerId, userId), eq(accountBlock.blockedId, found.id)));
        if (already) return asBlock(already);
        const [blocks] = await tx
          .select({ total: count() })
          .from(accountBlock)
          .where(eq(accountBlock.blockerId, userId));
        if ((blocks?.total ?? 0) >= BLOCKS_MOST) {
          throw new ORPCError("FORBIDDEN", {
            message: `An account blocks ${BLOCKS_MOST} accounts at most.`,
          });
        }
        // Ended by the blocker, as `friends.remove` ends one: the blocked account reads it so.
        const pair = pairOf(userId, found.id);
        await tx
          .update(friendship)
          .set({ endedBy: userId, endedAt: new Date() })
          .where(
            and(
              eq(friendship.userId, pair.userId),
              eq(friendship.friendId, pair.friendId),
              isNull(friendship.endedAt),
            ),
          );
        const [written] = await tx
          .insert(accountBlock)
          .values({ blockerId: userId, blockedId: found.id, username })
          .returning();
        if (!written) throw new Error("The block was not written.");
        return asBlock(written);
      });
    }),

  list: protectedProcedure
    .route({
      method: "GET",
      path: "/blocks",
      summary: "The accounts the caller blocked, the latest first",
      description:
        "Takes a signed-in session. Each comes with its own id, which lifts it, the username " +
        "the account had when it was blocked, and since when. Decision 071.",
      tags: ["Blocks"],
    })
    .output(z.object({ blocks: z.array(blockSchema) }))
    .handler(async ({ context }) => {
      const rows = await context.db
        .select()
        .from(accountBlock)
        .where(eq(accountBlock.blockerId, context.session.user.id))
        .orderBy(desc(accountBlock.createdAt), desc(accountBlock.id));
      return { blocks: rows.map(asBlock) };
    }),

  remove: protectedProcedure
    .meta({ analytics: "account_unblocked" })
    .route({
      method: "DELETE",
      path: "/blocks/{id}",
      summary: "Lift a block",
      description:
        "Takes a signed-in session. The caller reads the account again as everyone does. A " +
        "friendship that the block ended stays ended, as one the caller ended: the caller " +
        "makes it again by opening the other's link. It takes the block's id, as the list " +
        "gives it. The answer is 404 for a block that is not the caller's. Decision 071.",
      tags: ["Blocks"],
    })
    .input(z.object({ id: z.string().min(1).max(200) }))
    .output(z.object({ lifted: z.literal(true) }))
    .handler(async ({ input, context }) => {
      const [lifted] = await context.db
        .delete(accountBlock)
        .where(
          and(eq(accountBlock.id, input.id), eq(accountBlock.blockerId, context.session.user.id)),
        )
        .returning({ id: accountBlock.id });
      if (!lifted) throw new ORPCError("NOT_FOUND", { message: "No such block." });
      return { lifted: true as const };
    }),
};
