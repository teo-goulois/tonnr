import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { internal } from "varlock";
import { describe, expect, it } from "vitest";

// Varlock reads a schema as the program starts, and a rule it cannot read stops the program
// whatever the values: a regex of `@type` that holds a comma did once, which no other check saw.
// Each schema of the repository is read here as Varlock reads it, values aside: only what it says
// of the schema itself fails, never a value that is missing, and nothing of a value is printed.
const root = path.resolve(import.meta.dirname, "../../..");
const schemas = ["apps", "packages"]
  .flatMap((group) =>
    readdirSync(path.join(root, group)).map((name) => path.join(group, name, ".env.schema")),
  )
  .filter((schema) => existsSync(path.join(root, schema)));

describe("the schemas of the settings", () => {
  it("are found, the API's among them", () => {
    expect(schemas).toContain(path.join("apps", "server", ".env.schema"));
  });

  it.each(schemas)("%s is read by Varlock without an error of its own", async (schema) => {
    const graph = await internal.loadEnvGraph({
      entryFilePaths: path.join(root, schema),
      processEnvOverride: {},
      skipCache: true,
    });
    await graph.resolveEnvValues();

    const ofSchema = (error: { isWarning?: boolean }) =>
      error instanceof internal.SchemaError && !error.isWarning;
    const problems = [
      ...graph.sortedDataSources.flatMap((source) =>
        [...source.errors, ...source.resolutionErrors]
          .filter((error) => !error.isWarning)
          .map((error) => `${source.label}: ${error.message}`),
      ),
      ...Object.entries(graph.configSchema).flatMap(([key, item]) =>
        item.errors.filter(ofSchema).map((error) => `${key}: ${error.message}`),
      ),
    ];
    expect(problems).toEqual([]);
  });
});
