// What `MorphText` knows each character of a text by from one text to the next, so that it moves
// what stays and fades what changes. A figure is known by its place in its number, counted from
// the number's end, so that "250°" becoming "255°" changes its last figure alone and the others
// keep their place; any other character by how many of it came before. The text is laid in its
// words, each ending with the space after it, so that a line breaks between two words and never
// inside one. No React Native in it, so that a test reads it.

export type MorphGlyph = { key: string; char: string };
export type MorphWord = { key: string; glyphs: MorphGlyph[] };

const DIGIT = /\d/;

/** The words of a text, each a row of characters known from one text to the next. */
export function morphWords(text: string): MorphWord[] {
  const chars = Array.from(text);
  // Each figure's number, and its place in it from the end.
  const places: (string | null)[] = chars.map(() => null);
  let number = -1;
  for (let at = 0; at < chars.length; at++) {
    if (!DIGIT.test(chars[at] ?? "")) continue;
    if (at === 0 || !DIGIT.test(chars[at - 1] ?? "")) number += 1;
    let end = at;
    while (DIGIT.test(chars[end + 1] ?? "")) end += 1;
    places[at] = `${number}.${end - at}`;
  }

  const seen = new Map<string, number>();
  const words: MorphWord[] = [];
  let glyphs: MorphGlyph[] = [];
  chars.forEach((char, at) => {
    const place = places[at];
    let key: string;
    if (place) key = `d${place}:${char}`;
    else {
      const count = seen.get(char) ?? 0;
      seen.set(char, count + 1);
      key = `${char}#${count}`;
    }
    // A space is drawn as one that does not break, at the end of the word before it.
    glyphs.push({ key, char: char === " " ? " " : char });
    if (char === " ") {
      words.push({ key: `w${words.length}`, glyphs });
      glyphs = [];
    }
  });
  if (glyphs.length > 0) words.push({ key: `w${words.length}`, glyphs });
  return words;
}
