/**
 * A build of the web app gives itself a name and writes it in a file beside the app:
 * `vite.config.ts`. An app that is open reads that file again, and learns from a name that is
 * no longer its own that a deployment took place since it was loaded. Its chunks are then gone
 * from the stage, so it asks to be loaded again.
 *
 * This file imports nothing: the build's configuration reads it too.
 */
export const RELEASE_FILE = "release.json";

/** How long an open app waits between two readings, and the least it leaves between them. */
export const RELEASE_EVERY_MS = 10 * 60 * 1000;
export const RELEASE_AT_MOST_EVERY_MS = 60 * 1000;

/** What the build writes in the file. */
export function releaseFile(release: string) {
  return JSON.stringify({ release });
}

/**
 * The name of the build the stage serves now, or null when nothing said it: no network, a
 * development server, which has no such file and answers a page in its place.
 */
export async function servedRelease(read: typeof fetch): Promise<string | null> {
  try {
    const response = await read(`/${RELEASE_FILE}`, { cache: "no-store" });
    if (!response.ok) return null;
    const { release } = (await response.json()) as { release?: unknown };
    return typeof release === "string" && release !== "" ? release : null;
  } catch {
    return null;
  }
}

/** Whether what is served is another build than the one that runs. An unknown is not. */
export function isNewRelease(running: string | undefined, served: string | null) {
  return Boolean(running) && served !== null && served !== running;
}
