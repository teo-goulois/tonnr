import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { adminProcedure } from "../index";
import {
  PRIVATE_CATALOGUE_LIMITS,
  PrivateCatalogueSnapshotTooLarge,
  type PrivateCatalogue,
  unconfiguredCatalogueSummary,
} from "../private-catalogue";
import { hasControlCharacter } from "../text";

const word = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !hasControlCharacter(value));
const id = word(512);
const page = {
  limit: z.number().int().min(1).max(PRIVATE_CATALOGUE_LIMITS.page).default(50),
  offset: z.number().int().min(0).max(PRIVATE_CATALOGUE_LIMITS.offset).default(0),
};
const counts = z.object({
  records: z.number().int().nonnegative(),
  snapshots: z.number().int().nonnegative(),
  claims: z.number().int().nonnegative(),
  resources: z.number().int().nonnegative(),
});
const provider = z.object({
  id: z.string(),
  title: z.string(),
  publisherGroup: z.string(),
  rightsStatus: z.string(),
});
const record = z.object({
  id: z.string(),
  providerId: z.string(),
  nativeId: z.string(),
  identityKind: z.string(),
  firstLabel: z.string().nullable(),
  names: z.array(z.string()),
  countries: z.array(z.string()),
  snapshots: z.number().int().nonnegative(),
  claims: z.number().int().nonnegative(),
});
const snapshot = z.object({
  id: z.string(),
  recordId: z.string(),
  artifactSha256: z.string(),
  sourceRow: z.number().int(),
  observedAt: z.string().nullable(),
  importedAt: z.string(),
  exportKind: z.string(),
  name: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  countryLabel: z.string().nullable(),
  payloadSha256: z.string(),
  reviewStatus: z.string(),
});
const pageOutput = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number(),
    offset: z.number(),
  });

// Even a replacement reader must not pass a driver error (and its SQL/credentials) to the
// server fault logger. No raw error or cause is attached, serialized or logged here.
async function safely<T>(
  reader: PrivateCatalogue | undefined,
  work: (reader: PrivateCatalogue) => Promise<T>,
) {
  if (!reader)
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "The private catalogue is not configured.",
    });
  try {
    return await work(reader);
  } catch (error) {
    if (error instanceof PrivateCatalogueSnapshotTooLarge) {
      throw new ORPCError("BAD_REQUEST", { message: "This snapshot is too large to display." });
    }
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "The private catalogue is unavailable.",
    });
  }
}

// RPC only: no HTTP route, OpenAPI shape or MCP tool for private provider observations.
export const privateCatalogueRouter = {
  summary: adminProcedure
    .input(z.object({}))
    .output(
      z.object({
        configured: z.boolean(),
        providers: z.array(provider.extend(counts.shape)),
        totals: counts,
        countries: z.array(
          z.object({ label: z.string(), records: z.number().int().nonnegative() }),
        ),
      }),
    )
    .handler(({ context }) =>
      context.privateCatalogue
        ? safely(context.privateCatalogue, (reader) => reader.summary())
        : unconfiguredCatalogueSummary(),
    ),

  records: adminProcedure
    .input(
      z.object({
        q: word(120).optional(),
        provider: id.optional(),
        country: word(200).optional(),
        ...page,
      }),
    )
    .output(pageOutput(record))
    .handler(({ context, input }) =>
      safely(context.privateCatalogue, (reader) => reader.records(input)),
    ),

  record: adminProcedure
    .input(z.object({ id }))
    .output(
      z.object({
        record,
        provider,
        snapshots: z.array(snapshot),
        aliases: z.array(
          z.object({ alias: z.string(), relation: z.string(), evidenceArtifactSha256: z.string() }),
        ),
        currentIdentity: z
          .object({
            id: z.string(),
            entityId: z.string(),
            reason: z.string(),
            author: z.string(),
            createdAt: z.string(),
            reversesEventId: z.string().nullable(),
          })
          .nullable(),
        snapshotsTruncated: z.boolean(),
        aliasesTruncated: z.boolean(),
      }),
    )
    .handler(async ({ context, input }) => {
      const found = await safely(context.privateCatalogue, (reader) => reader.record(input.id));
      if (!found)
        throw new ORPCError("NOT_FOUND", { message: "This source record was not found." });
      return found;
    }),

  claims: adminProcedure
    .input(z.object({ recordId: id, ...page }))
    .output(
      pageOutput(
        z.object({
          id: z.string(),
          logicalId: z.string().nullable(),
          artifactSha256: z.string(),
          sourceRow: z.number().int(),
          subject: z.string(),
          recordId: z.string().nullable(),
          kind: z.string(),
          predicate: z.string(),
          value: z.json(),
          unit: z.string().nullable(),
          observedAt: z.string().nullable(),
          originalSnapshotId: z.string().nullable(),
          payloadSha256: z.string(),
        }),
      ),
    )
    .handler(async ({ context, input }) => {
      const found = await safely(context.privateCatalogue, (reader) => reader.claims(input));
      if (!found)
        throw new ORPCError("NOT_FOUND", { message: "This source record was not found." });
      return found;
    }),

  resources: adminProcedure
    .input(z.object({ q: word(120).optional(), provider: id.optional(), ...page }))
    .output(
      pageOutput(
        z.object({
          providerId: z.string(),
          url: z.string(),
          artifactSha256: z.string(),
          lastModified: z.string().nullable(),
          payloadSha256: z.string(),
          detailRetrieved: z.boolean(),
        }),
      ),
    )
    .handler(({ context, input }) =>
      safely(context.privateCatalogue, (reader) => reader.resources(input)),
    ),

  snapshot: adminProcedure
    .input(z.object({ id }))
    .output(z.object({ snapshot, payload: z.json() }))
    .handler(async ({ context, input }) => {
      const found = await safely(context.privateCatalogue, (reader) => reader.snapshot(input.id));
      if (!found)
        throw new ORPCError("NOT_FOUND", { message: "This source version was not found." });
      return found;
    }),
};
