import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The commit this program was built from. Its image keeps it in a file at the repository's root,
 * two folders above the one the program runs in. Null where there is none: a program that runs
 * from its sources, or an image whose build was not told its commit. Decision 022.
 */
export function readRevision() {
  try {
    const revision = readFileSync(resolve(process.cwd(), "../../revision"), "utf8").trim();
    return /^[0-9a-f]{40}$/.test(revision) ? revision : null;
  } catch {
    return null;
  }
}
