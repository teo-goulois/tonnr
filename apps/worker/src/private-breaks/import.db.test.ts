import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { privateBreak, privateBreakImport } from "@repo/db/schema/private-breaks";
import { surfBreak } from "@repo/db/schema/spots";
import { createTestDatabase, TEST_DATABASE_URL } from "@repo/db/testing";
import { asc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { importPrivateFile, removePrivateFile } from "./command";
import type { PrivateBreak } from "./file";
import { importPrivateBreaks, removePrivateImport } from "./import";

const COLLECTED = new Date("2026-10-08T10:00:00Z");
const TERMS = "https://example.org/terms";

// Invented breaks: no provider's data is in the tests.
function found(ref: string, overrides: Partial<PrivateBreak> = {}): PrivateBreak {
  return {
    ref,
    name: ref,
    latitude: 48,
    longitude: -4.5,
    url: `https://example.org/breaks/${ref}`,
    collectedAt: COLLECTED,
    details: { bottom: "sand" },
    ...overrides,
  };
}

describe.skipIf(!TEST_DATABASE_URL)("the private list of breaks", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let folder: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    folder = await mkdtemp(path.join(tmpdir(), "private-breaks-"));
  });
  afterAll(async () => {
    await database?.drop();
    if (folder) await rm(folder, { recursive: true });
  });
  beforeEach(async () => {
    await database.db.delete(privateBreak);
    await database.db.delete(privateBreakImport);
  });

  const store = (provider: string, breaks: PrivateBreak[], write = true, termsUrl = TERMS) =>
    Effect.runPromise(
      importPrivateBreaks(
        database.db,
        { provider, termsUrl, breaks },
        { fileSha256: "0".repeat(64), write },
      ),
    );
  // Stores a list that names no source: no page on the breaks, and no terms.
  const storeSourceless = (provider: string, breaks: PrivateBreak[], write = true) =>
    Effect.runPromise(
      importPrivateBreaks(database.db, { provider, breaks }, { fileSha256: "0".repeat(64), write }),
    );
  // Stores a list that changes something, and gives the import's id.
  const storeAs = async (provider: string, breaks: PrivateBreak[]) => {
    const { importId } = await store(provider, breaks);
    if (!importId) throw new Error("Nothing was stored");
    return importId;
  };
  const remove = (importId: string, write = true) =>
    Effect.runPromise(removePrivateImport(database.db, importId, { write }));
  const rowsOf = (provider: string) =>
    database.db
      .select()
      .from(privateBreak)
      .where(eq(privateBreak.provider, provider))
      .orderBy(asc(privateBreak.providerRef));
  const refsOf = async (provider: string) => (await rowsOf(provider)).map((row) => row.providerRef);
  const imports = () =>
    database.db.select().from(privateBreakImport).orderBy(asc(privateBreakImport.importedAt));
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) => found(`b${String(index + 1).padStart(4, "0")}`));

  it("stores a list, with where it comes from and what is known of its rights", async () => {
    const details = { size: { sourceValue: "2-4", unit: null }, tags: ["left"], rating: 0 };

    const stored = await store("example", [found("a1", { name: "North jetty", details })]);

    expect(stored).toMatchObject({
      provider: "example",
      listed: 1,
      added: 1,
      changed: 0,
      unchanged: 0,
      absent: 0,
    });
    const [imported] = await imports();
    expect(imported).toMatchObject({
      id: stored.importId,
      provider: "example",
      fileSha256: "0".repeat(64),
      listed: 1,
      added: 1,
      changed: 0,
      unchanged: 0,
      absent: 0,
    });
    expect(await rowsOf("example")).toEqual([
      {
        id: expect.any(String),
        provider: "example",
        providerRef: "a1",
        name: "North jetty",
        latitude: 48,
        longitude: -4.5,
        sourceUrl: "https://example.org/breaks/a1",
        rights: "not-established",
        termsUrl: TERMS,
        details,
        collectedAt: COLLECTED,
        importId: stored.importId,
        importedAt: imported?.importedAt,
      },
    ]);
  });

  it("writes nothing when the same list comes again", async () => {
    await store("same", [found("a1"), found("a2")]);
    const before = await rowsOf("same");

    const again = await store("same", [found("a2"), found("a1")]);

    expect(again).toEqual({
      importId: null,
      provider: "same",
      listed: 2,
      added: 0,
      changed: 0,
      unchanged: 2,
      absent: 0,
    });
    expect(await rowsOf("same")).toEqual(before);
    // An import that wrote nothing leaves no record.
    expect(await imports()).toHaveLength(1);
  });

  it("takes details for the same when only their order of keys differs", async () => {
    await store("order", [
      found("a1", { details: { bottom: "sand", size: { min: 1, max: 2.0 } } }),
    ]);

    const again = await store("order", [
      found("a1", { details: { size: { max: 2, min: 1 }, bottom: "sand" } }),
    ]);

    expect(again).toMatchObject({ changed: 0, unchanged: 1 });
  });

  it("keeps a known break's id and its import, and takes the file's values", async () => {
    const first = await store("changed", [found("a1"), found("a2")]);
    const before = await rowsOf("changed");
    const later = new Date("2026-11-02T08:00:00Z");

    const second = await store("changed", [
      found("a1", {
        name: "South jetty",
        latitude: 47.8,
        details: { bottom: "reef" },
        collectedAt: later,
      }),
      found("a2"),
    ]);

    const counts = { listed: 2, added: 0, changed: 1, unchanged: 1, absent: 0 };
    expect(second).toMatchObject(counts);
    const [, recorded] = await imports();
    expect(recorded).toMatchObject({ id: second.importId, ...counts });
    const after = await rowsOf("changed");
    expect(after[0]).toMatchObject({
      id: before[0]?.id,
      importId: first.importId,
      name: "South jetty",
      latitude: 47.8,
      details: { bottom: "reef" },
      collectedAt: later,
      // The date of the import that wrote these values.
      importedAt: recorded?.importedAt,
    });
    expect(after[1]).toEqual(before[1]);
  });

  it("takes the terms a later file names", async () => {
    await store("terms", [found("a1")]);

    const second = await store("terms", [found("a1")], true, "https://example.org/terms-of-2027");

    expect(second).toMatchObject({ changed: 1, unchanged: 0 });
    expect(await rowsOf("terms")).toMatchObject([
      { termsUrl: "https://example.org/terms-of-2027" },
    ]);
  });

  it("stores a list that names no source", async () => {
    const stored = await storeSourceless("unnamed", [found("a1", { url: undefined })]);

    expect(stored).toMatchObject({ listed: 1, added: 1 });
    expect(await rowsOf("unnamed")).toEqual([
      {
        id: expect.any(String),
        provider: "unnamed",
        providerRef: "a1",
        name: "a1",
        latitude: 48,
        longitude: -4.5,
        // No source: the file gave no page and no terms.
        sourceUrl: null,
        rights: "not-established",
        termsUrl: null,
        details: { bottom: "sand" },
        collectedAt: COLLECTED,
        importId: stored.importId,
        importedAt: expect.any(Date),
      },
    ]);
  });

  it("takes the absence of terms a later file gives", async () => {
    await store("forgotten", [found("a1")]);

    const second = await storeSourceless("forgotten", [found("a1")]);

    expect(second).toMatchObject({ changed: 1, unchanged: 0 });
    expect(await rowsOf("forgotten")).toMatchObject([{ termsUrl: null }]);
  });

  const differences: [string, Partial<PrivateBreak>][] = [
    ["a new name", { name: "Other" }],
    ["a new latitude", { latitude: 48.001 }],
    ["a new longitude", { longitude: -4.501 }],
    ["a new address", { url: "https://example.org/breaks/other" }],
    ["new details", { details: { bottom: "sand", crowd: null } }],
    ["a new date of reading", { collectedAt: new Date("2026-10-08T10:00:01Z") }],
  ];
  it.each(differences)(
    "counts a break as changed when the file gives it %s",
    async (_, overrides) => {
      await store("differs", [found("a1")]);

      expect(await store("differs", [found("a1", overrides)])).toMatchObject({ changed: 1 });
      const { url, ...columns } = overrides;
      expect(await rowsOf("differs")).toMatchObject([url ? { sourceUrl: url } : columns]);
    },
  );

  it("keeps a break that a later file does not list", async () => {
    await store("shorter", [found("a1"), found("a2"), found("a3")]);

    const second = await store("shorter", [found("a2"), found("a9")]);

    const counts = { listed: 2, added: 1, changed: 0, unchanged: 1, absent: 2 };
    expect(second).toMatchObject(counts);
    expect((await imports())[1]).toMatchObject(counts);
    expect(await refsOf("shorter")).toEqual(["a1", "a2", "a3", "a9"]);
  });

  it("leaves another provider's breaks alone", async () => {
    await store("ours", [found("a1")]);
    await store("theirs", [found("a1", { name: "Theirs" }), found("a2")]);

    const second = await store("ours", [found("a1", { name: "Ours" })]);

    expect(second).toMatchObject({ changed: 1, absent: 0 });
    expect(await rowsOf("theirs")).toMatchObject([{ name: "Theirs" }, { providerRef: "a2" }]);
  });

  it("says what a list would change, and stores nothing of it", async () => {
    await store("preview", [found("a1"), found("a2")]);
    const before = await rowsOf("preview");

    const preview = await store(
      "preview",
      [found("a1", { name: "Renamed" }), found("a2"), found("a3")],
      false,
    );

    expect(preview).toMatchObject({
      importId: null,
      listed: 3,
      added: 1,
      changed: 1,
      unchanged: 1,
      absent: 0,
    });
    expect(await rowsOf("preview")).toEqual(before);
    expect(await imports()).toHaveLength(1);
  });

  it("stores a long list whole", async () => {
    const stored = await store("long", many(1201));

    expect(stored).toMatchObject({ listed: 1201, added: 1201 });
    expect(await rowsOf("long")).toHaveLength(1201);
    expect(await store("long", many(1201))).toMatchObject({
      added: 0,
      changed: 0,
      unchanged: 1201,
    });
  });

  it("stores nothing of a list when one break fails, and takes the list once it is mended", async () => {
    await store("failed", [found("a1", { name: "Before" })]);
    const before = await rowsOf("failed");
    // The last break of the second statement holds a character the database refuses.
    const breaks = [found("a1", { name: "After" }), ...many(700)];
    const broken = [...breaks.slice(0, -1), found("b0700", { name: "North\u0000jetty" })];

    await expect(store("failed", broken)).rejects.toThrow();

    expect(await rowsOf("failed")).toEqual(before);
    expect(await imports()).toHaveLength(1);

    expect(await store("failed", breaks)).toMatchObject({ added: 700, changed: 1, unchanged: 0 });
    expect(await rowsOf("failed")).toHaveLength(701);
  });

  it("counts each break once when two imports of a provider run together", async () => {
    for (let round = 0; round < 5; round += 1) {
      await database.db.delete(privateBreak);
      await database.db.delete(privateBreakImport);

      const stored = await Promise.all([
        store("together", [found("a1"), found("a2")]),
        store("together", [found("a2"), found("a3")]),
      ]);

      expect(await refsOf("together")).toEqual(["a1", "a2", "a3"]);
      expect(stored[0].added + stored[1].added).toBe(3);
      expect(stored[0].unchanged + stored[1].unchanged).toBe(1);
    }
  });

  it("deletes the breaks an import added, and no other", async () => {
    const first = await storeAs("lots", [found("a1"), found("a2")]);
    const second = await storeAs("lots", [found("a2", { name: "Renamed" }), found("a3")]);
    await store("other", [found("a1")]);

    expect(await remove(second)).toMatchObject({ provider: "lots", removed: 1 });

    // The break the second import only changed keeps the name it gave.
    expect(await rowsOf("lots")).toMatchObject([
      { providerRef: "a1", importId: first },
      { providerRef: "a2", name: "Renamed", importId: first },
    ]);
    expect(await refsOf("other")).toEqual(["a1"]);
    expect((await imports()).map((imported) => imported.id)).not.toContain(second);

    // The earlier file brings the earlier values back, under the same ids.
    const before = await rowsOf("lots");
    expect(await store("lots", [found("a1"), found("a2")])).toMatchObject({ changed: 1 });
    expect((await rowsOf("lots")).map((row) => [row.id, row.name])).toEqual([
      [before[0]?.id, "a1"],
      [before[1]?.id, "a2"],
    ]);
  });

  it("deletes a break with what a later import changed in it", async () => {
    const first = await storeAs("later", [found("a1"), found("a2")]);
    const second = await storeAs("later", [found("a1", { name: "Renamed" }), found("a3")]);

    expect(await remove(first)).toMatchObject({ removed: 2 });

    expect(await refsOf("later")).toEqual(["a3"]);
    // The later import stays, with what it did when it ran.
    expect(await imports()).toMatchObject([{ id: second, added: 1, changed: 1 }]);
  });

  it("ends with a whole import or none of it when a removal runs with it", async () => {
    for (let round = 0; round < 5; round += 1) {
      await database.db.delete(privateBreak);
      await database.db.delete(privateBreakImport);
      const first = await storeAs("raced", [found("a1"), found("a2")]);

      const [removed, stored] = await Promise.all([
        remove(first),
        store("raced", [found("a2", { name: "Renamed" }), found("a3")]),
      ]);

      expect(removed).toMatchObject({ removed: 2 });
      // Whichever ran second saw what the first had done.
      expect(stored.added + stored.changed).toBe(2);
      expect(await refsOf("raced")).toEqual(stored.added === 2 ? ["a2", "a3"] : ["a3"]);
      expect(await imports()).toMatchObject([{ id: stored.importId }]);
    }
  });

  it("says what removing an import would delete, and deletes nothing", async () => {
    const stored = await storeAs("kept", [found("a1"), found("a2")]);

    expect(await remove(stored, false)).toMatchObject({ provider: "kept", removed: 2 });

    expect(await refsOf("kept")).toEqual(["a1", "a2"]);
    expect(await imports()).toHaveLength(1);
  });

  it("finds no import under an id that is not one", async () => {
    await store("unknown", [found("a1")]);

    expect(await remove("nothing")).toBeNull();
    expect(await refsOf("unknown")).toEqual(["a1"]);
  });

  it("leaves the catalogue as it is", async () => {
    await database.db.insert(surfBreak).values({
      id: crypto.randomUUID(),
      provider: "example",
      providerRef: "a1",
      name: "In the catalogue",
      latitude: 48,
      longitude: -4.5,
      sourceUrl: "https://example.org/breaks/a1",
      licenseType: "test",
      licenseUrl: "https://example.org/licence",
      attribution: "Test",
      lastSeenAt: COLLECTED,
    });
    const catalogue = await database.db.select().from(surfBreak);

    await remove(await storeAs("example", [found("a1", { name: "Private" }), found("a2")]));

    expect(await database.db.select().from(surfBreak)).toEqual(catalogue);
    await database.db.delete(surfBreak);
  });

  describe("from a file", () => {
    const line = (ref: string, overrides: Record<string, unknown> = {}) => ({
      ...found(ref),
      collectedAt: COLLECTED.toISOString(),
      ...overrides,
    });
    const textOf = (content: unknown) =>
      typeof content === "string" ? content : JSON.stringify(content);
    async function fileOf(content: unknown) {
      const file = path.join(folder, `${crypto.randomUUID()}.json`);
      await writeFile(file, textOf(content));
      return file;
    }
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });
    const listOf = (breaks: unknown[]) => ({ provider: "filed", termsUrl: TERMS, breaks });

    it("previews a file unless told to write", async () => {
      const file = await fileOf(listOf([line("a1"), line("a2")]));

      const preview = await importPrivateFile(database.db, [file]);

      expect(preview).toEqual({
        ok: true,
        lines: [
          "private-breaks: filed lists 2 breaks. 2 to add, 0 to change, 0 unchanged.",
          "Nothing was stored. Run it again with --write to store it.",
        ],
      });
      expect(await rowsOf("filed")).toEqual([]);
      expect(await imports()).toEqual([]);
    });

    it("stores a file, and names the import that undoes it", async () => {
      const content = listOf([line("a1"), line("a2")]);
      const file = await fileOf(content);

      const stored = await importPrivateFile(database.db, ["--write", file]);

      const [imported] = await imports();
      expect(imported?.fileSha256).toBe(createHash("sha256").update(textOf(content)).digest("hex"));
      expect(stored).toEqual({
        ok: true,
        lines: [
          "private-breaks: filed lists 2 breaks. 2 added, 0 changed, 0 unchanged.",
          `Stored as import ${imported?.id}. "job private-breaks-remove ${imported?.id}" deletes the breaks it added.`,
        ],
      });
      expect(await refsOf("filed")).toEqual(["a1", "a2"]);

      const shorter = await fileOf(listOf([line("a2")]));
      expect((await importPrivateFile(database.db, [shorter])).lines).toEqual([
        "private-breaks: filed lists 1 break. 0 to add, 0 to change, 1 unchanged.",
        "The file leaves out 1 break stored for filed. Nothing is deleted.",
        "Nothing was stored. Run it again with --write to store it.",
      ]);

      expect((await importPrivateFile(database.db, [file, "--write"])).lines).toEqual([
        "private-breaks: filed lists 2 breaks. 0 added, 0 changed, 2 unchanged.",
        "Nothing was stored: the database already holds what the file says.",
      ]);
      expect(await imports()).toHaveLength(1);

      const id = imported?.id ?? "";
      expect(await removePrivateFile(database.db, [id])).toMatchObject({
        ok: true,
        lines: [
          expect.stringMatching(
            /^private-breaks: 2 breaks that the import of .+ added for filed would be deleted\.$/,
          ),
          "Nothing was deleted. Run it again with --write to delete them.",
        ],
      });
      expect(await refsOf("filed")).toEqual(["a1", "a2"]);
      expect(await removePrivateFile(database.db, [id, "--write"])).toMatchObject({
        ok: true,
        lines: [
          expect.stringMatching(
            /^private-breaks: deleted 2 breaks that the import of .+ added for filed, and the import\.$/,
          ),
        ],
      });
      expect(await rowsOf("filed")).toEqual([]);
      expect(await imports()).toEqual([]);
    });

    it("stores nothing of a file with one faulty line", async () => {
      const file = await fileOf(listOf([line("a1"), line("a2", { latitude: 91 })]));

      const refused = await importPrivateFile(database.db, [file, "--write"]);

      expect(refused).toEqual({
        ok: false,
        lines: [
          "The file was refused, and nothing was stored:",
          'break 2 (a2): "latitude" and "longitude" must be numbers on the globe',
        ],
      });
      expect(await rowsOf("filed")).toEqual([]);
      expect(await imports()).toEqual([]);
    });

    it("refuses a file with a byte that is not UTF-8", async () => {
      const file = path.join(folder, `${crypto.randomUUID()}.json`);
      await writeFile(file, Buffer.from([0x22, 0xff, 0x22]));

      const refused = await importPrivateFile(database.db, [file, "--write"]);

      expect(refused).toMatchObject({
        ok: false,
        lines: [expect.stringContaining("could not be read")],
      });
      expect(await imports()).toEqual([]);
    });

    it.each([
      ["that is not JSON", "{ provider: ", "the file is not JSON"],
      [
        "with a number that cannot be read as it is",
        JSON.stringify(listOf([line("a1")])).replace('"sand"', "9007199254740993"),
        'the number 9007199254740993 of "bottom" cannot be read as it is',
      ],
    ])("stores nothing of a file %s", async (_, content, expected) => {
      const refused = await importPrivateFile(database.db, [await fileOf(content), "--write"]);

      expect(refused).toEqual({
        ok: false,
        lines: ["The file was refused, and nothing was stored:", expect.stringContaining(expected)],
      });
      expect(await rowsOf("filed")).toEqual([]);
      expect(await imports()).toEqual([]);
    });

    it("takes a path from where the command was called", async () => {
      const file = await fileOf(listOf([line("a1")]));
      vi.stubEnv("INIT_CWD", folder);

      const preview = await importPrivateFile(database.db, [path.basename(file)]);

      expect(preview).toMatchObject({ ok: true });
    });

    it("takes a path from the folder it runs in when nothing says where it was called", async () => {
      const file = await fileOf(listOf([line("a1")]));
      vi.stubEnv("INIT_CWD", undefined);
      vi.spyOn(process, "cwd").mockReturnValue(folder);

      const preview = await importPrivateFile(database.db, [path.basename(file)]);

      expect(preview).toMatchObject({ ok: true });
    });

    it("takes the two dashes that pnpm hands over", async () => {
      const file = await fileOf(listOf([line("a1")]));

      expect(await importPrivateFile(database.db, [file, "--", "--write"])).toMatchObject({
        ok: true,
        lines: [expect.stringContaining("1 added"), expect.stringContaining("Stored as import")],
      });
    });

    it("refuses a path that leads to no file", async () => {
      const refused = await importPrivateFile(database.db, [path.join(folder, "missing.json")]);

      expect(refused).toMatchObject({
        ok: false,
        lines: [expect.stringContaining("could not be read")],
      });
    });

    it.each([
      ["no file", []],
      ["two files", ["one.json", "two.json"]],
      ["an option it does not know", ["one.json", "--force"]],
    ])("asks for its arguments again when given %s", async (_, args) => {
      expect(await importPrivateFile(database.db, args)).toEqual({
        ok: false,
        lines: ["Usage: job private-breaks <file> [--write]"],
      });
    });

    it("says so when asked to remove an import that does not exist", async () => {
      expect(await removePrivateFile(database.db, ["nothing", "--write"])).toEqual({
        ok: false,
        lines: ['No import "nothing".'],
      });
      expect(await removePrivateFile(database.db, [])).toEqual({
        ok: false,
        lines: ["Usage: job private-breaks-remove <import> [--write]"],
      });
    });
  });
});
