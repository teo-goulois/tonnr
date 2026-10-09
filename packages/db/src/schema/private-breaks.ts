import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Retired by decision 024: nothing reads or writes these two tables any more. They stay for
// one release, so that the version a deployment replaces keeps working while it stops, and the
// next migration drops them.

/**
 * One file of breaks that the instance's operator imported by hand, and that changed
 * `private_break`. Its counts say what the import did then, whatever happened since.
 */
export const privateBreakImport = pgTable("private_break_import", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  // The SHA-256 of the file, to tell which one it was. A path would be one machine's.
  fileSha256: text("file_sha256").notNull(),
  // How many breaks the file listed.
  listed: integer("listed").notNull(),
  added: integer("added").notNull(),
  changed: integer("changed").notNull(),
  unchanged: integer("unchanged").notNull(),
  // The provider's breaks that the file did not list. They were kept.
  absent: integer("absent").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A surf break the instance kept for its operator alone, before the catalogue took them all.
 */
export const privateBreak = pgTable(
  "private_break",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    // The break's identifier at the provider.
    providerRef: text("provider_ref").notNull(),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    // The page that shows the break, when the file gave one: naming the source is the
    // operator's to do or to leave out.
    sourceUrl: text("source_url"),
    // Nobody has the provider's word that the row may be shown or shared. A row that has it
    // belongs in the catalogue, with its licence.
    rights: text("rights", { enum: ["not-established"] })
      .default("not-established")
      .notNull(),
    // The terms the list falls under, when the file gave them.
    termsUrl: text("terms_url"),
    // What else the file said of the break, as the file gave it.
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    // When the file says the break was read.
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
    // The import that added the row. Removing that import deletes the row.
    importId: text("import_id")
      .notNull()
      .references(() => privateBreakImport.id),
    // When an import last wrote the row.
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("private_break_provider_ref_idx").on(table.provider, table.providerRef),
    index("private_break_importId_idx").on(table.importId),
  ],
);
