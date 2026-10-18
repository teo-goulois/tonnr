// What an error report may say, for the web app and for the API alike: decision 054. An error's
// message can hold what caused it, such as the parameters of a query or the address a request
// went to, so a report keeps the kind of an error, its message once what could name someone is
// taken out, and where in the code it happened. Nothing else of the SDK's event leaves.

const MESSAGE_LENGTH = 500;
const FRAMES = 60;
const FRAME_FIELDS = [
  "platform",
  "filename",
  "abs_path",
  "module",
  "function",
  "lineno",
  "colno",
  "in_app",
  "lang",
  "chunk_id",
  "context_line",
  "pre_context",
  "post_context",
];
const MECHANISM_FIELDS = ["type", "handled", "synthetic", "source", "exception_id", "parent_id"];

/**
 * A message with no parameters of a query, no address beyond its host, no email, no id, no name
 * a person gave and no place.
 */
export function scrubMessage(message: string) {
  return (
    message
      // Drizzle writes a failed query's parameters after its text.
      .replace(/\n\s*params:[\s\S]*$/, "\n[params]")
      // An address keeps its origin: its path and its query can hold a token or a search.
      .replace(/\b(https?|wss?):\/\/(?:[^\s/?#@]*@)?([^\s/?#@"'`<>]+)[^\s"'`<>]*/gi, "$1://$2/[…]")
      .replace(/[^\s@"'`<>()[\]]+@[^\s@"'`<>()[\]]+\.[a-z]{2,}/gi, "[email]")
      .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, "[id]")
      // A name a person gave, such as a spot's, is quoted where the database says a value:
      // "Key (owner_id, name)=(…)", 'invalid input …: "…"', or a text with a space or a mark in
      // it. A quoted word of plain letters is left, for it names a table or a column.
      .replace(/\)=\([^)]*\)/g, ")=([text])")
      .replace(/:\s*"[^"\n]*"/g, ': "[text]"')
      .replace(/"[^"\n]*"/g, (quoted) => (/^"[\w.$-]*"$/.test(quoted) ? quoted : '"[text]"'))
      // A place, even one rounded to a kilometre: two numbers side by side, or a number named
      // as a latitude or a longitude.
      .replace(/-?\d{1,3}\.\d+\s*[,;/ ]\s*-?\d{1,3}\.\d+/g, "[place]")
      .replace(
        /\b(lat|latitude|lon|lng|longitude)(["']?\s*[=:]\s*)-?\d+(?:\.\d+)?/gi,
        "$1$2[number]",
      )
      // A token, a key, a long number: whatever runs long with no space in it.
      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[token]")
      .replace(/-?\d+\.\d{3,}/g, "[number]")
      .slice(0, MESSAGE_LENGTH)
  );
}

/** A file's address keeps its path, which names a module, and loses its query. */
function scrubFile(value: unknown) {
  return typeof value === "string" ? value.replace(/[?#].*$/, "") : undefined;
}

function pick(value: unknown, fields: string[]) {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(fields.filter((key) => key in source).map((key) => [key, source[key]]));
}

/** The `$exception_list` an SDK built, with only what decision 054 lets a report say. */
export function privateExceptionList(list: unknown) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 5).map((entry: Record<string, unknown>) => {
    const stack = entry?.stacktrace as { type?: unknown; frames?: unknown } | undefined;
    const frames = Array.isArray(stack?.frames) ? stack.frames.slice(-FRAMES) : [];
    return {
      type: typeof entry?.type === "string" ? entry.type.slice(0, 100) : "Error",
      value: typeof entry?.value === "string" ? scrubMessage(entry.value) : "",
      mechanism: pick(entry?.mechanism, MECHANISM_FIELDS),
      stacktrace: {
        type: stack?.type === "resolved" ? "resolved" : "raw",
        frames: frames.map((frame: unknown) => {
          const kept = pick(frame, FRAME_FIELDS) ?? {};
          for (const key of ["filename", "abs_path"])
            if (key in kept) kept[key] = scrubFile(kept[key]);
          return kept;
        }),
      },
    };
  });
}
