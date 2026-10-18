import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import { createDb } from "@repo/db";
import { createEmptyTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createPrivateCatalogue,
  PRIVATE_CATALOGUE_LIMITS,
  PrivateCatalogueSnapshotTooLarge,
  PrivateCatalogueUnavailable,
  type PrivateCatalogue,
} from "./private-catalogue";

const digest = (raw: Uint8Array) => createHash("sha256").update(raw).digest("hex");
const artifact = "a".repeat(64);
const otherArtifact = "b".repeat(64);

// Only invented observations, in a fresh disposable database. No private source is imported.
describe.skipIf(!TEST_DATABASE_URL)("the separate private catalogue reader", () => {
  let database: Awaited<ReturnType<typeof createEmptyTestDatabase>>;
  let control: ReturnType<typeof createDb>;
  let reader: PrivateCatalogue;
  const payload = { source: "invented", values: [null, false, 3, { label: "<b>plain text</b>" }] };

  beforeAll(async () => {
    database = await createEmptyTestDatabase();
    control = createDb({ DATABASE_URL: database.url });
    await control.execute(sql`
      CREATE SCHEMA catalogue;
      CREATE TABLE catalogue.provider_fixture (
        id text PRIMARY KEY,title text,publisher_group text,rights_status text
      );
      CREATE FUNCTION catalogue.check_reader() RETURNS boolean LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('transaction_read_only')!='on'
          OR current_setting('default_transaction_read_only')!='on'
          OR current_setting('transaction_isolation')!='repeatable read'
          OR current_setting('statement_timeout')!='5s'
          OR current_setting('idle_in_transaction_session_timeout')!='5s'
          OR current_setting('TimeZone')!='UTC'
          OR current_setting('search_path')!='pg_catalog'
        THEN RAISE EXCEPTION 'reader settings missing'; END IF;
        RETURN true;
      END $$;
      CREATE VIEW catalogue.provider AS SELECT * FROM catalogue.provider_fixture
        WHERE catalogue.check_reader();
      CREATE TABLE catalogue.source_record (
        id text PRIMARY KEY,provider_id text,native_id text,identity_kind text,first_label text
      );
      CREATE TABLE catalogue.source_snapshot (
        id text PRIMARY KEY,record_id text,artifact_sha256 text,source_row integer,
        observed_at text,imported_at text,export_kind text,name text,source_url text,
        country_label text,payload_sha256 text,payload_gzip bytea,review_status text
      );
      CREATE TABLE catalogue.source_claim (
        id text PRIMARY KEY,logical_id text,artifact_sha256 text,source_row integer,
        subject text,record_id text,kind text,predicate text,value_json jsonb,unit text,
        observed_at text,original_snapshot_id text,payload_sha256 text
      );
      CREATE TABLE catalogue.resource_inventory (
        provider_id text,url text,artifact_sha256 text,last_modified text,
        payload_sha256 text,detail_retrieved integer
      );
      CREATE TABLE catalogue.technical_alias (
        alias text,record_id text,evidence_artifact_sha256 text,relation text
      );
      CREATE VIEW catalogue.current_identity AS SELECT
        9007199254740993::bigint AS id,'one:alpha'::text AS record_id,'hypothesis'::text AS entity_id,
        'manual hypothesis'::text AS reason,'test'::text AS author,
        '2026-01-01'::text AS created_at,NULL::bigint AS reverses_event_id;
      INSERT INTO catalogue.provider_fixture VALUES
        ('one','Invented one','same publisher','not_established'),
        ('two','Invented two','same publisher','not_established'),
        ('inventory','Invented index','independent','not_established');
      INSERT INTO catalogue.source_record VALUES
        ('one:alpha','one','alpha','source_spot','A 100%_ reef'),
        ('two:beta','two','beta','source_spot','A 100xx reef'),
        ('one:bad','one','bad','source_spot','Broken payload fixtures');
      INSERT INTO catalogue.technical_alias VALUES
        ('shared-label','one:alpha','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','explicit_source_id'),
        ('shared-label','two:beta','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','explicit_source_id');
    `);
    const raw = Buffer.from(JSON.stringify(payload));
    const addVersion = async (
      id: string,
      record: string,
      observed: string | null,
      imported: string,
      country: string,
      bytes = gzipSync(raw),
      hash = digest(raw),
    ) =>
      control.execute(sql`
      INSERT INTO catalogue.source_snapshot VALUES (
        ${id},${record},${artifact},1,${observed},${imported},'synthetic',${id},
        'https://example.org/source',${country},${hash},${bytes},'unreviewed')
    `);
    // Real instants cross calendar dates in opposite offset zones. Imported dates reverse them.
    await addVersion("older", "one:alpha", "2026-01-02T00:10:00+14:00", "2030-01-01", "Country A");
    await addVersion("newer", "one:alpha", "2026-01-01T23:50:00-12:00", "2020-01-01", "Country B");
    await addVersion(
      "newest-fraction",
      "one:alpha",
      "2026-01-02T11:50:00.1Z",
      "2019-01-01",
      "Country B",
    );
    await addVersion("undated", "one:alpha", "not a timestamp", "2040-01-01", "Country B");
    await addVersion("beta-version", "two:beta", null, "2026-01-01", "Country A");
    await addVersion(
      "bad-hash",
      "one:bad",
      null,
      "2026-01-01",
      "Country A",
      gzipSync(raw),
      "0".repeat(64),
    );
    await addVersion(
      "bad-gzip",
      "one:bad",
      null,
      "2026-01-01",
      "Country A",
      Buffer.from("invalid gzip"),
    );
    const inflated = Buffer.alloc(PRIVATE_CATALOGUE_LIMITS.decodedBytes + 1, 65);
    await addVersion(
      "too-decoded",
      "one:bad",
      null,
      "2026-01-01",
      "Country A",
      gzipSync(inflated),
      digest(inflated),
    );
    await addVersion(
      "too-stored",
      "one:bad",
      null,
      "2026-01-01",
      "Country A",
      Buffer.alloc(PRIVATE_CATALOGUE_LIMITS.compressedBytes + 1),
    );
    await control.execute(sql`
      INSERT INTO catalogue.source_claim VALUES
        ('occurrence-1','reused-logical-id',${artifact},1,'one:alpha','one:alpha',
          'assertion','wave','null'::jsonb,NULL,'2026-01-02T00:10:00+14:00','export-snapshot-id',${artifact}),
        ('occurrence-2','reused-logical-id',${otherArtifact},2,'one:alpha','one:alpha',
          'assertion','wave','false'::jsonb,NULL,'2026-01-01T23:50:00-12:00','other-export-id',${otherArtifact}),
        ('unattached',NULL,${artifact},3,'unresolved',NULL,'assertion','wave','2'::jsonb,NULL,NULL,NULL,${artifact})
    `);
    await control.execute(sql`
      INSERT INTO catalogue.resource_inventory VALUES
        ('inventory','https://example.org/100%_index',${artifact},NULL,${artifact},0),
        ('inventory','https://example.org/100%_index',${otherArtifact},'2026-01-01',${otherArtifact},1),
        ('inventory','https://example.org/100xxindex',${artifact},NULL,${artifact},0);
    `);
    const address = new URL(database.url);
    // Adversarial URL options must not override the adapter's startup restrictions.
    address.searchParams.set(
      "options",
      "-c default_transaction_read_only=off -c statement_timeout=0 -c timezone=Asia/Tokyo",
    );
    reader = createPrivateCatalogue({ DATABASE_URL: address.href });
  });

  afterAll(async () => {
    await reader?.close();
    await control?.$client.end();
    await database?.drop();
  });

  it("keeps identity, version, claim-occurrence and URL-inventory counts separate", async () => {
    const summary = await reader.summary();
    expect(summary.totals).toEqual({ records: 3, snapshots: 9, claims: 3, resources: 3 });
    expect(summary.providers.find((p) => p.id === "one")).toMatchObject({
      records: 2,
      snapshots: 8,
      claims: 2,
      resources: 0,
    });
    expect(summary.providers.find((p) => p.id === "inventory")).toMatchObject({
      records: 0,
      snapshots: 0,
      claims: 0,
      resources: 3,
    });
    expect(summary.countries).toEqual([
      { label: "Country A", records: 3 },
      { label: "Country B", records: 1 },
    ]);
    expect(summary.providers.every((p) => p.rightsStatus === "not_established")).toBe(true);
  });

  it("paginates stable identities and treats wildcard/SQL input literally", async () => {
    const page = await reader.records({ q: "100%_", limit: 1, offset: 0 });
    expect(page).toMatchObject({ total: 1, limit: 1, offset: 0 });
    expect(page.items[0]).toMatchObject({
      id: "one:alpha",
      countries: ["Country A", "Country B"],
      snapshots: 4,
      claims: 2,
    });
    expect((await reader.records({ q: "' OR true; --", limit: 50, offset: 0 })).total).toBe(0);
    expect(
      (
        await reader.records({ provider: "one", country: "Country B", limit: 50, offset: 0 })
      ).items.map((r) => r.id),
    ).toEqual(["one:alpha"]);
    expect(
      (await reader.records({ provider: "one' OR true --", limit: 50, offset: 0 })).total,
    ).toBe(0);
    expect((await reader.records({ limit: 1, offset: 1 })).items.map((r) => r.id)).toEqual([
      "two:beta",
    ]);
  });

  it("orders by real observation instants, preserves raw dates and technical lineage", async () => {
    const detail = await reader.record("one:alpha");
    expect(detail?.snapshots.map((s) => s.id)).toEqual([
      "newest-fraction",
      "newer",
      "older",
      "undated",
    ]);
    expect(detail?.snapshots[1]).toMatchObject({
      observedAt: "2026-01-01T23:50:00-12:00",
      importedAt: "2020-01-01",
      artifactSha256: artifact,
    });
    expect(detail?.aliases).toEqual([
      { alias: "shared-label", relation: "explicit_source_id", evidenceArtifactSha256: artifact },
    ]);
    expect(detail?.currentIdentity?.id).toBe("9007199254740993");
    expect(detail?.snapshotsTruncated).toBe(false);
    expect(JSON.stringify(detail)).not.toMatch(/payload_gzip|source_path|compressed/);
    expect(await reader.record("missing")).toBeNull();
  });

  it("preserves repeated claim occurrences and JSON scalars, without invented version joins", async () => {
    const first = await reader.claims({ recordId: "one:alpha", limit: 1, offset: 0 });
    const next = await reader.claims({ recordId: "one:alpha", limit: 1, offset: 1 });
    expect(first).toMatchObject({
      total: 2,
      items: [
        {
          id: "occurrence-2",
          logicalId: "reused-logical-id",
          value: false,
          originalSnapshotId: "other-export-id",
        },
      ],
    });
    expect(next).toMatchObject({
      total: 2,
      items: [{ id: "occurrence-1", value: null, originalSnapshotId: "export-snapshot-id" }],
    });
    expect(await reader.claims({ recordId: "missing", limit: 1, offset: 0 })).toBeNull();
  });

  it("paginates explicit URL occurrences separately, with no fetch or byte payload", async () => {
    const first = await reader.resources({
      provider: "inventory",
      q: "100%_",
      limit: 1,
      offset: 0,
    });
    const second = await reader.resources({
      provider: "inventory",
      q: "100%_",
      limit: 1,
      offset: 1,
    });
    expect(first.total).toBe(2);
    expect(first.items[0]).toEqual({
      providerId: "inventory",
      url: "https://example.org/100%_index",
      artifactSha256: artifact,
      lastModified: null,
      payloadSha256: artifact,
      detailRetrieved: false,
    });
    expect(second.items[0]).toMatchObject({ artifactSha256: otherArtifact, detailRetrieved: true });
    expect((await reader.resources({ q: "' OR true --", limit: 1, offset: 0 })).total).toBe(0);
  });

  it("checks and decodes one bounded snapshot as JSON without rendering markup", async () => {
    expect(await reader.snapshot("newer")).toMatchObject({
      snapshot: { id: "newer", payloadSha256: expect.any(String) },
      payload,
    });
    expect(await reader.snapshot("missing")).toBeNull();
    for (const id of ["bad-hash", "bad-gzip"]) {
      await expect(reader.snapshot(id)).rejects.toEqual(new PrivateCatalogueUnavailable());
    }
    for (const id of ["too-decoded", "too-stored"]) {
      await expect(reader.snapshot(id)).rejects.toEqual(new PrivateCatalogueSnapshotTooLarge());
    }
  });

  it("caps pages before any large result and keeps pool concurrency at two", async () => {
    await expect(reader.records({ limit: 101, offset: 0 })).rejects.toEqual(
      new PrivateCatalogueUnavailable(),
    );
    await expect(reader.resources({ limit: 1, offset: -1 })).rejects.toEqual(
      new PrivateCatalogueUnavailable(),
    );
    await Promise.all(Array.from({ length: 6 }, () => reader.summary()));
    const { rows } = await control.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='tonnr-private-catalogue-read'
    `);
    expect(rows[0]?.count).toBeLessThanOrEqual(2);
  });

  it("reports truncated metadata rather than unbounded versions or aliases", async () => {
    await control.execute(sql`
      INSERT INTO catalogue.source_snapshot
      SELECT 'extra-'||n,'one:alpha',artifact_sha256,n,NULL,imported_at,export_kind,
        name,source_url,country_label,payload_sha256,payload_gzip,review_status
      FROM catalogue.source_snapshot CROSS JOIN generate_series(1,101) n WHERE id='older'
    `);
    await control.execute(sql`
      INSERT INTO catalogue.technical_alias
      SELECT 'alias-'||n,'one:alpha',${artifact},'explicit_source_id' FROM generate_series(1,201) n;
    `);
    const found = await reader.record("one:alpha");
    expect(found?.snapshots).toHaveLength(100);
    expect(found?.aliases).toHaveLength(200);
    expect(found).toMatchObject({ snapshotsTruncated: true, aliasesTruncated: true });
  });

  it("refuses a write even when a stored function tries it during a SELECT", async () => {
    await control.execute(sql`
      CREATE FUNCTION catalogue.attempt_write() RETURNS boolean LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO catalogue.provider_fixture VALUES ('injected','Injected','test','not_established');
        RETURN true;
      END $$;
      CREATE OR REPLACE VIEW catalogue.provider AS SELECT * FROM catalogue.provider_fixture
        WHERE catalogue.attempt_write();
    `);
    try {
      const error = await reader.summary().catch((reason: unknown) => reason);
      expect(error).toEqual(new PrivateCatalogueUnavailable());
      expect(error).not.toHaveProperty("cause");
      const { rows } = await control.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count FROM catalogue.provider_fixture WHERE id='injected'
      `);
      expect(rows[0]?.count).toBe(0);
    } finally {
      await control.execute(sql`
        CREATE OR REPLACE VIEW catalogue.provider AS SELECT * FROM catalogue.provider_fixture
          WHERE catalogue.check_reader()
      `);
    }
  });
});

it("opens lazily and hides malformed connection errors without a cause", async () => {
  const lazy = createPrivateCatalogue({ DATABASE_URL: "malformed synthetic address" });
  await expect(lazy.close()).resolves.toBeUndefined();
  const failed = createPrivateCatalogue({ DATABASE_URL: "malformed synthetic address" });
  const error = await failed.summary().catch((reason: unknown) => reason);
  expect(error).toEqual(new PrivateCatalogueUnavailable());
  expect(error).not.toHaveProperty("cause");
  expect(String(error)).not.toContain("malformed");
  await failed.close();
});
