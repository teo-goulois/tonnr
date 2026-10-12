// Prints the commit an image is built from, or nothing when the build was not told.
//
// The build is given three things of the repository's history, and no more: `.git/HEAD`, the
// heads of its branches and `.git/packed-refs` (see `.dockerignore`). They name the commit that
// is checked out. A build that has none of them, as one made from a worktree or from an archive,
// may be told the commit in `GIT_SHA`. The image keeps the answer in a file, `revision`, which
// the API and the worker read when they start: decision 022.
import { readFileSync } from "node:fs";

const COMMIT = /^[0-9a-f]{40}$/;

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function checkedOut() {
  const head = read(".git/HEAD")?.trim();
  if (!head) return null;
  // A checkout of a commit, with no branch.
  if (COMMIT.test(head)) return head;

  const ref = /^ref: (refs\/heads\/\S+)$/.exec(head)?.[1];
  if (!ref) return null;
  const loose = read(`.git/${ref}`)?.trim();
  if (loose && COMMIT.test(loose)) return loose;
  // A branch that git packed has no file of its own.
  const packed = (read(".git/packed-refs") ?? "")
    .split("\n")
    .map((line) => line.trim().split(" "))
    .find(([commit, name]) => name === ref && COMMIT.test(commit ?? ""));
  return packed?.[0] ?? null;
}

const told = process.env.GIT_SHA?.trim();
console.log(checkedOut() ?? (told && COMMIT.test(told) ? told : ""));
