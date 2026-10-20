// What the release commands read of the tools they run, as functions that run nothing, so that a
// test reads them: decision 075.

/**
 * The runtime that `expo-updates runtimeversion:resolve` names, from what it prints: the
 * binary's fingerprint, which a publication goes to and a store build carries.
 */
export function runtimeOf(output: string): string {
  // It prints its JSON on the last line, after whatever a config plugin said.
  const line = output.trim().split("\n").at(-1) ?? "";
  let runtime: unknown;
  try {
    runtime = (JSON.parse(line) as { runtimeVersion?: unknown }).runtimeVersion;
  } catch {
    throw new Error(`expo-updates named no runtime: ${line.slice(0, 200)}`);
  }
  if (typeof runtime !== "string" || !/^[0-9a-f]{40}$/.test(runtime)) {
    throw new Error(
      `expo-updates named ${JSON.stringify(runtime)}, which is no fingerprint: the app's config ` +
        "asks for the fingerprint policy only when it names the address of the updates",
    );
  }
  return runtime;
}
