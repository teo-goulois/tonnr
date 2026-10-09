import { ORPCError } from "@orpc/server";
import { apiKey, developer, operator } from "@repo/db/schema/access";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../index";
import { newKey } from "../keys";
import { hasControlCharacter } from "../text";

const keySchema = z.object({
  id: z.string(),
  name: z.string(),
  // The key's first characters. The key itself is given once, when it is made.
  prefix: z.string(),
  // The developer account the key belongs to. Null only for a key made before there were any.
  developerId: z.string().nullable(),
  createdAt: z.date(),
  // The minute of its last call while it worked, up to thirty seconds late. Null until then.
  lastUsedAt: z.date().nullable(),
  // A revoked key no longer works, and stays in the list.
  revokedAt: z.date().nullable(),
});

const described = {
  id: apiKey.id,
  name: apiKey.name,
  prefix: apiKey.prefix,
  developerId: apiKey.developerId,
  createdAt: apiKey.createdAt,
  lastUsedAt: apiKey.lastUsedAt,
  revokedAt: apiKey.revokedAt,
};

const SESSION_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. A key cannot make, list or revoke keys.";

export const keysRouter = {
  list: adminProcedure
    .route({
      method: "GET",
      path: "/keys",
      summary: "The API keys of the instance, or of one developer account, the newest first",
      description: `${SESSION_ONLY} The keys are the instance's: every operator lists them all.`,
      tags: ["Keys"],
    })
    .input(z.object({ developerId: z.uuid().optional() }))
    .output(z.object({ keys: z.array(keySchema) }))
    .handler(async ({ input, context }) => {
      const keys = await context.db
        .select(described)
        .from(apiKey)
        .where(input.developerId ? eq(apiKey.developerId, input.developerId) : undefined)
        .orderBy(desc(apiKey.createdAt), desc(apiKey.id));
      return { keys };
    }),

  create: adminProcedure
    .route({
      method: "POST",
      path: "/keys",
      summary: "Make an API key for a developer account",
      description:
        `${SESSION_ONLY} The answer holds the key, and nothing gives it again: the instance ` +
        "keeps only its hash. A program sends it as `Authorization: Bearer <key>`, and reads " +
        "with it the data everyone shares, nothing of an account.",
      tags: ["Keys"],
      successStatus: 201,
    })
    .input(
      z.object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .refine((name) => !hasControlCharacter(name), "must not contain control characters"),
        // The developer account the key belongs to, for good.
        developerId: z.uuid(),
      }),
    )
    .output(keySchema.extend({ key: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { key, prefix, keyHash } = newKey();

      const made = await context.db.transaction(async (tx) => {
        // Taking the operator's rights away revokes their keys. Holding the row keeps a key
        // from being made while that happens, and from outliving it.
        const [held] = await tx
          .select({ userId: operator.userId })
          .from(operator)
          .where(eq(operator.userId, userId))
          .for("share");
        if (!held) throw new ORPCError("FORBIDDEN");

        // The same for the account the key goes to: it is not deleted under the key.
        const [owner] = await tx
          .select({ id: developer.id })
          .from(developer)
          .where(eq(developer.id, input.developerId))
          .for("share");
        if (!owner) {
          throw new ORPCError("NOT_FOUND", {
            message: `No developer account "${input.developerId}".`,
          });
        }

        const [row] = await tx
          .insert(apiKey)
          .values({
            id: crypto.randomUUID(),
            userId,
            developerId: owner.id,
            name: input.name,
            prefix,
            keyHash,
          })
          .returning(described);
        return row;
      });
      if (!made) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return { ...made, key };
    }),

  revoke: adminProcedure
    .route({
      method: "DELETE",
      path: "/keys/{id}",
      summary: "Revoke an API key",
      description: `${SESSION_ONLY} A revoked key stops working at once, and never works again.`,
      tags: ["Keys"],
    })
    .input(z.object({ id: z.uuid() }))
    .output(keySchema)
    .handler(async ({ input, context }) => {
      const [revoked] = await context.db
        .update(apiKey)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKey.id, input.id), isNull(apiKey.revokedAt)))
        .returning(described);
      if (!revoked)
        throw new ORPCError("NOT_FOUND", { message: `No key "${input.id}" to revoke.` });
      return revoked;
    }),
};
