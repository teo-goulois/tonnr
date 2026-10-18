import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { promisify, TextDecoder } from "node:util";
import { gunzip } from "node:zlib";

import { createDb, type Database } from "@repo/db";
import { sql, type SQL } from "drizzle-orm";

export type CatalogueJson =
  | null
  | boolean
  | number
  | string
  | CatalogueJson[]
  | { [key: string]: CatalogueJson };

export type CatalogueCounts = {
  records: number;
  snapshots: number;
  claims: number;
  resources: number;
};
export type CatalogueProvider = {
  id: string;
  title: string;
  publisherGroup: string;
  rightsStatus: string;
};
export type CatalogueSummary = {
  configured: boolean;
  providers: (CatalogueProvider & CatalogueCounts)[];
  totals: CatalogueCounts;
  // Source labels from all versions, not independently verified countries.
  countries: { label: string; records: number }[];
};
export type CatalogueRecord = {
  id: string;
  providerId: string;
  nativeId: string;
  identityKind: string;
  firstLabel: string | null;
  names: string[];
  countries: string[];
  snapshots: number;
  claims: number;
};
export type CatalogueSnapshot = {
  id: string;
  recordId: string;
  artifactSha256: string;
  sourceRow: number;
  observedAt: string | null;
  importedAt: string;
  exportKind: string;
  name: string | null;
  sourceUrl: string | null;
  countryLabel: string | null;
  payloadSha256: string;
  reviewStatus: string;
};
export type CatalogueIdentity = {
  id: string;
  entityId: string;
  reason: string;
  author: string;
  createdAt: string;
  reversesEventId: string | null;
};
export type CatalogueRecordDetail = {
  record: CatalogueRecord;
  provider: CatalogueProvider;
  snapshots: CatalogueSnapshot[];
  aliases: { alias: string; relation: string; evidenceArtifactSha256: string }[];
  currentIdentity: CatalogueIdentity | null;
  snapshotsTruncated: boolean;
  aliasesTruncated: boolean;
};
export type CatalogueClaim = {
  id: string;
  logicalId: string | null;
  artifactSha256: string;
  sourceRow: number;
  subject: string;
  recordId: string | null;
  kind: string;
  predicate: string;
  value: CatalogueJson;
  unit: string | null;
  observedAt: string | null;
  // The export's own identifier; not necessarily catalogue.source_snapshot.id.
  originalSnapshotId: string | null;
  payloadSha256: string;
};
export type CataloguePage<T> = { items: T[]; total: number; limit: number; offset: number };
export type CatalogueRecordsInput = {
  q?: string | undefined;
  provider?: string | undefined;
  country?: string | undefined;
  limit: number;
  offset: number;
};
export type CatalogueClaimsInput = { recordId: string; limit: number; offset: number };
export type CatalogueResourcesInput = {
  provider?: string | undefined;
  q?: string | undefined;
  limit: number;
  offset: number;
};
export type CatalogueResource = {
  providerId: string;
  url: string;
  artifactSha256: string;
  lastModified: string | null;
  payloadSha256: string;
  detailRetrieved: boolean;
};

export type PrivateCatalogue = {
  summary(): Promise<CatalogueSummary>;
  records(input: CatalogueRecordsInput): Promise<CataloguePage<CatalogueRecord>>;
  record(id: string): Promise<CatalogueRecordDetail | null>;
  claims(input: CatalogueClaimsInput): Promise<CataloguePage<CatalogueClaim> | null>;
  resources(input: CatalogueResourcesInput): Promise<CataloguePage<CatalogueResource>>;
  snapshot(id: string): Promise<{ snapshot: CatalogueSnapshot; payload: CatalogueJson } | null>;
  close(): Promise<void>;
};

// No upstream exception, SQL text, parameter, cause or connection address leaves this adapter.
export class PrivateCatalogueUnavailable extends Error {
  constructor() {
    super("The private catalogue is unavailable.");
    this.name = "PrivateCatalogueUnavailable";
  }
}
export class PrivateCatalogueSnapshotTooLarge extends Error {
  constructor() {
    super("This snapshot is too large to display.");
    this.name = "PrivateCatalogueSnapshotTooLarge";
  }
}

export const PRIVATE_CATALOGUE_LIMITS = {
  page: 100,
  offset: 100_000,
  versions: 100,
  aliases: 200,
  compressedBytes: 4 * 1024 * 1024,
  decodedBytes: 4 * 1024 * 1024,
} as const;

export const unconfiguredCatalogueSummary = (): CatalogueSummary => ({
  configured: false,
  providers: [],
  totals: { records: 0, snapshots: 0, claims: 0, resources: 0 },
  countries: [],
});

type ReadTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const decompress = promisify(gunzip);
const SNAPSHOT_COLUMNS = sql`
  s.id, s.record_id AS "recordId", s.artifact_sha256 AS "artifactSha256",
  s.source_row AS "sourceRow", s.observed_at AS "observedAt",
  s.imported_at AS "importedAt", s.export_kind AS "exportKind", s.name,
  s.source_url AS "sourceUrl", s.country_label AS "countryLabel",
  s.payload_sha256 AS "payloadSha256", s.review_status AS "reviewStatus"
`;
const RECORD_COLUMNS = sql`
  r.id, r.provider_id AS "providerId", r.native_id AS "nativeId",
  r.identity_kind AS "identityKind", r.first_label AS "firstLabel",
  ARRAY(SELECT DISTINCT s.name FROM catalogue.source_snapshot s
    WHERE s.record_id=r.id AND s.name IS NOT NULL ORDER BY s.name) AS names,
  ARRAY(SELECT DISTINCT s.country_label FROM catalogue.source_snapshot s
    WHERE s.record_id=r.id AND s.country_label IS NOT NULL ORDER BY s.country_label) AS countries,
  (SELECT COUNT(*)::int FROM catalogue.source_snapshot s WHERE s.record_id=r.id) AS snapshots,
  (SELECT COUNT(*)::int FROM catalogue.source_claim c WHERE c.record_id=r.id) AS claims
`;

function pageBounds(limit: number, offset: number) {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > PRIVATE_CATALOGUE_LIMITS.page ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > PRIVATE_CATALOGUE_LIMITS.offset
  ) {
    throw new PrivateCatalogueUnavailable();
  }
}

// ILIKE treats the caller's text literally, including %, _ and backslashes.
function likePart(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

// Preserve source text in the response. Order only parseable ISO calendar dates/instants;
// offsets are compared as instants, while invalid/relative values remain undated at the end.
const observationTime = (column: SQL) => sql`CASE
  WHEN ${column} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([Tt ]|$)'
    AND pg_input_is_valid(${column},'timestamp with time zone')
  THEN ${column}::timestamptz END`;

/**
 * A separate, lazy PostgreSQL reader for private research, never the product catalogue.
 * Startup options win over URL options (createDb's connectionOf), and every operation also
 * opens an explicit READ ONLY transaction. No migrations, provider fetches or writes live here.
 */
export function createPrivateCatalogue(settings: { DATABASE_URL: string }): PrivateCatalogue {
  let opened: Database | undefined;
  const database = () => {
    if (!opened) {
      opened = createDb(settings, {
        max: 2,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30_000,
        statement_timeout: 5000,
        query_timeout: 6000,
        allowExitOnIdle: true,
        application_name: "tonnr-private-catalogue-read",
        options:
          "-c default_transaction_read_only=on -c statement_timeout=5000 " +
          "-c idle_in_transaction_session_timeout=5000 -c timezone=UTC -c search_path=pg_catalog",
      });
      // Idle pool failures must not become uncaught events containing connection details.
      opened.$client.on("error", () => {});
    }
    return opened;
  };
  const read = async <T>(work: (tx: ReadTransaction) => Promise<T>): Promise<T> => {
    try {
      return await database().transaction(work, {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    } catch (error) {
      if (error instanceof PrivateCatalogueSnapshotTooLarge) throw error;
      throw new PrivateCatalogueUnavailable();
    }
  };

  return {
    summary: () =>
      read(async (tx) => {
        const { rows: providers } = await tx.execute<CatalogueProvider & CatalogueCounts>(sql`
          SELECT p.id, p.title, p.publisher_group AS "publisherGroup",
            p.rights_status AS "rightsStatus",
            COALESCE(r.n,0)::int AS records, COALESCE(s.n,0)::int AS snapshots,
            COALESCE(c.n,0)::int AS claims, COALESCE(i.n,0)::int AS resources
          FROM catalogue.provider p
          LEFT JOIN (SELECT provider_id, COUNT(*) n FROM catalogue.source_record GROUP BY provider_id) r
            ON r.provider_id=p.id
          LEFT JOIN (SELECT r.provider_id, COUNT(*) n FROM catalogue.source_snapshot s
            JOIN catalogue.source_record r ON r.id=s.record_id GROUP BY r.provider_id) s ON s.provider_id=p.id
          LEFT JOIN (SELECT r.provider_id, COUNT(*) n FROM catalogue.source_claim c
            JOIN catalogue.source_record r ON r.id=c.record_id GROUP BY r.provider_id) c ON c.provider_id=p.id
          LEFT JOIN (SELECT provider_id, COUNT(*) n FROM catalogue.resource_inventory GROUP BY provider_id) i
            ON i.provider_id=p.id
          ORDER BY p.title,p.id
        `);
        // Count the tables directly: provider joins must not silently drop unattached claims.
        const { rows: totals } = await tx.execute<CatalogueCounts>(sql`
          SELECT (SELECT COUNT(*)::int FROM catalogue.source_record) AS records,
            (SELECT COUNT(*)::int FROM catalogue.source_snapshot) AS snapshots,
            (SELECT COUNT(*)::int FROM catalogue.source_claim) AS claims,
            (SELECT COUNT(*)::int FROM catalogue.resource_inventory) AS resources
        `);
        const { rows: countries } = await tx.execute<{ label: string; records: number }>(sql`
          SELECT country_label AS label, COUNT(DISTINCT record_id)::int AS records
          FROM catalogue.source_snapshot WHERE country_label IS NOT NULL
          GROUP BY country_label ORDER BY country_label
        `);
        return { configured: true, providers, totals: totals[0]!, countries };
      }),

    records: (input) =>
      read(async (tx) => {
        pageBounds(input.limit, input.offset);
        const conditions: SQL[] = [sql`true`];
        if (input.q) {
          const value = likePart(input.q);
          conditions.push(sql`(r.id ILIKE ${value} OR r.first_label ILIKE ${value}
            OR r.native_id ILIKE ${value} OR EXISTS(SELECT 1 FROM catalogue.source_snapshot s
              WHERE s.record_id=r.id AND s.name ILIKE ${value}))`);
        }
        if (input.provider) conditions.push(sql`r.provider_id=${input.provider}`);
        if (input.country) {
          conditions.push(sql`EXISTS(SELECT 1 FROM catalogue.source_snapshot s
            WHERE s.record_id=r.id AND s.country_label=${input.country})`);
        }
        const where = sql.join(conditions, sql` AND `);
        const { rows: counted } = await tx.execute<{ total: number }>(sql`
          SELECT COUNT(*)::int AS total FROM catalogue.source_record r WHERE ${where}
        `);
        const { rows: items } = await tx.execute<CatalogueRecord>(sql`
          SELECT ${RECORD_COLUMNS} FROM catalogue.source_record r WHERE ${where}
          ORDER BY COALESCE(r.first_label,r.native_id),r.id LIMIT ${input.limit} OFFSET ${input.offset}
        `);
        return { items, total: counted[0]!.total, limit: input.limit, offset: input.offset };
      }),

    record: (id) =>
      read(async (tx) => {
        const { rows } = await tx.execute<CatalogueRecord>(sql`
          SELECT ${RECORD_COLUMNS} FROM catalogue.source_record r WHERE r.id=${id}
        `);
        const record = rows[0];
        if (!record) return null;
        const { rows: providers } = await tx.execute<CatalogueProvider>(sql`
          SELECT id,title,publisher_group AS "publisherGroup",rights_status AS "rightsStatus"
          FROM catalogue.provider WHERE id=${record.providerId}
        `);
        const { rows: versions } = await tx.execute<CatalogueSnapshot>(sql`
          SELECT ${SNAPSHOT_COLUMNS} FROM catalogue.source_snapshot s WHERE s.record_id=${id}
          ORDER BY ${observationTime(sql`s.observed_at`)} DESC NULLS LAST,s.id
          LIMIT ${PRIVATE_CATALOGUE_LIMITS.versions + 1}
        `);
        const { rows: aliases } = await tx.execute<CatalogueRecordDetail["aliases"][number]>(sql`
          SELECT alias,relation,evidence_artifact_sha256 AS "evidenceArtifactSha256"
          FROM catalogue.technical_alias WHERE record_id=${id}
          ORDER BY alias,relation,evidence_artifact_sha256 LIMIT ${PRIVATE_CATALOGUE_LIMITS.aliases + 1}
        `);
        const { rows: identities } = await tx.execute<CatalogueIdentity>(sql`
          SELECT id::text,entity_id AS "entityId",reason,author,created_at AS "createdAt",
            reverses_event_id::text AS "reversesEventId"
          FROM catalogue.current_identity WHERE record_id=${id}
        `);
        return {
          record,
          provider: providers[0]!,
          snapshots: versions.slice(0, PRIVATE_CATALOGUE_LIMITS.versions),
          aliases: aliases.slice(0, PRIVATE_CATALOGUE_LIMITS.aliases),
          currentIdentity: identities[0] ?? null,
          snapshotsTruncated: versions.length > PRIVATE_CATALOGUE_LIMITS.versions,
          aliasesTruncated: aliases.length > PRIVATE_CATALOGUE_LIMITS.aliases,
        };
      }),

    claims: (input) =>
      read(async (tx) => {
        pageBounds(input.limit, input.offset);
        const { rows: records } = await tx.execute<{ id: string }>(sql`
          SELECT id FROM catalogue.source_record WHERE id=${input.recordId}
        `);
        if (!records[0]) return null;
        const { rows: counted } = await tx.execute<{ total: number }>(sql`
          SELECT COUNT(*)::int AS total FROM catalogue.source_claim WHERE record_id=${input.recordId}
        `);
        const { rows: items } = await tx.execute<CatalogueClaim>(sql`
          SELECT id,logical_id AS "logicalId",artifact_sha256 AS "artifactSha256",
            source_row AS "sourceRow",subject,record_id AS "recordId",kind,predicate,
            value_json AS value,unit,observed_at AS "observedAt",
            original_snapshot_id AS "originalSnapshotId",payload_sha256 AS "payloadSha256"
          FROM catalogue.source_claim c WHERE record_id=${input.recordId}
          ORDER BY predicate,${observationTime(sql`c.observed_at`)} DESC NULLS LAST,id
          LIMIT ${input.limit} OFFSET ${input.offset}
        `);
        return { items, total: counted[0]!.total, limit: input.limit, offset: input.offset };
      }),

    resources: (input) =>
      read(async (tx) => {
        pageBounds(input.limit, input.offset);
        const conditions: SQL[] = [sql`true`];
        if (input.provider) conditions.push(sql`i.provider_id=${input.provider}`);
        if (input.q) conditions.push(sql`i.url ILIKE ${likePart(input.q)}`);
        const where = sql.join(conditions, sql` AND `);
        const { rows: counted } = await tx.execute<{ total: number }>(sql`
          SELECT COUNT(*)::int AS total FROM catalogue.resource_inventory i WHERE ${where}
        `);
        const { rows: items } = await tx.execute<CatalogueResource>(sql`
          SELECT i.provider_id AS "providerId",i.url,i.artifact_sha256 AS "artifactSha256",
            i.last_modified AS "lastModified",i.payload_sha256 AS "payloadSha256",
            (i.detail_retrieved=1) AS "detailRetrieved"
          FROM catalogue.resource_inventory i WHERE ${where}
          ORDER BY i.provider_id,i.url,i.artifact_sha256 LIMIT ${input.limit} OFFSET ${input.offset}
        `);
        return { items, total: counted[0]!.total, limit: input.limit, offset: input.offset };
      }),

    snapshot: (id) =>
      read(async (tx) => {
        const { rows } = await tx.execute<
          CatalogueSnapshot & { compressedBytes: number; compressed: Buffer | null }
        >(sql`
          SELECT ${SNAPSHOT_COLUMNS},octet_length(s.payload_gzip)::int AS "compressedBytes",
            CASE WHEN octet_length(s.payload_gzip)<=${PRIVATE_CATALOGUE_LIMITS.compressedBytes}
              THEN s.payload_gzip ELSE NULL END AS compressed
          FROM catalogue.source_snapshot s WHERE s.id=${id}
        `);
        const found = rows[0];
        if (!found) return null;
        const { compressed, compressedBytes, ...snapshot } = found;
        if (!compressed || compressedBytes > PRIVATE_CATALOGUE_LIMITS.compressedBytes) {
          throw new PrivateCatalogueSnapshotTooLarge();
        }
        let decoded: Buffer;
        try {
          decoded = await decompress(compressed, {
            maxOutputLength: PRIVATE_CATALOGUE_LIMITS.decodedBytes,
          });
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ERR_BUFFER_TOO_LARGE") {
            throw new PrivateCatalogueSnapshotTooLarge();
          }
          throw new PrivateCatalogueUnavailable();
        }
        if (createHash("sha256").update(decoded).digest("hex") !== snapshot.payloadSha256) {
          throw new PrivateCatalogueUnavailable();
        }
        return {
          snapshot,
          payload: JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(decoded),
          ) as CatalogueJson,
        };
      }),

    close: async () => {
      try {
        await opened?.$client.end();
      } catch {
        throw new PrivateCatalogueUnavailable();
      }
    },
  };
}
