import { m } from "@/paraglide/messages.js";

// What a list said of a break besides the catalogue's words, kept as the list gave it: its
// texts are what an operator reads, the rest is there in full for whoever wants it.

// Parts of a list's record that hold positions, fingerprints and addresses, not texts.
const NOT_TEXT = /bbox|fingerprint|textlines|symbols|url|sha256|^id$|ref$/i;
// A text shorter than this is a word, which the catalogue says better.
const SHORTEST = 24;
const DATE = /^\d{4}-\d{2}-\d{2}T/;

/** Each text of a record, once, with where it stands in it. */
export function textsOf(details: unknown) {
  const found: { path: string; text: string }[] = [];
  const seen = new Set<string>();
  const walk = (value: unknown, path: string[]) => {
    if (path.some((part) => NOT_TEXT.test(part))) return;
    if (typeof value === "string") {
      const text = value.trim();
      // A moment is written as a date, and is no text either.
      if (text.length >= SHORTEST && !DATE.test(text) && !seen.has(text)) {
        seen.add(text);
        found.push({ path: path.filter((part) => !/^\d+$/.test(part)).join(" · "), text });
      }
    } else if (Array.isArray(value))
      value.forEach((item, index) => walk(item, [...path, `${index}`]));
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) walk(item, [...path, key]);
    }
  };
  walk(details, []);
  return found;
}

type ListTextsProps = { list: string; reference: string; details: Record<string, unknown> | null };

/** What one list said of a break: its texts, then the whole record on demand. */
export function ListTexts({ list, reference, details }: ListTextsProps) {
  const texts = textsOf(details);
  return (
    <div className="grid gap-xs">
      <p className="text-s text-neutral-7">
        {list} · {reference}
      </p>
      {texts.length > 0 ? (
        <ul className="grid gap-xs">
          {texts.map(({ path, text }) => (
            <li key={`${path}:${text}`} className="grid gap-xxs">
              <span className="text-s text-neutral-7">{path}</span>
              <p className="text-pretty">{text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-neutral-7">{m.catalogue_listing_no_text()}</p>
      )}
      {details && (
        <details>
          <summary className="focus-ring cursor-pointer rounded-xs text-s text-neutral-7">
            {m.catalogue_listing_raw()}
          </summary>
          <pre className="mt-xs max-h-80 overflow-auto rounded-xs bg-neutral-3 p-xs font-mono text-xs">
            {JSON.stringify(details, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
