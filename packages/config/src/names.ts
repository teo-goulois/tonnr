// How a name is read by a search, for the API that searches the catalogue and for the web app
// that searches what it holds: both read what is typed the same way.

// The letters that carry a mark in the names the catalogue holds, and the letter each is read as.
// Both cases are listed: a database whose locale knows ASCII alone lowers no other letter. A
// hyphen and an apostrophe part two words as a space does.
const MARKED = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ-'’";
const PLAIN = "aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy   ";

/**
 * A name as a search reads it: in small letters, without its marks. "Guéthary" is found by
 * "guethary", which is what a phone's keyboard writes.
 */
export function fold(text: string) {
  return Array.from(text.toLowerCase(), (letter) => {
    const at = MARKED.indexOf(letter);
    return at < 0 ? letter : PLAIN.charAt(at);
  }).join("");
}

/** What a database is told to read a name the same way: `translate(lower(name), marked, plain)`. */
export const FOLDING = { marked: MARKED, plain: PLAIN } as const;

// The letters a slug reads as plain ones beyond `fold`'s: the names of the catalogue carry them,
// from Scandinavia to Turkey. One letter at a time, so that a database writes the same slug with
// `translate`: a letter that stands for two, such as æ, is replaced before. A letter that is in
// neither list is not a letter of a slug, and parts two words as a space does.
const SLUG_MARKED = "øØłŁđĐğĞşŞıİțȚșȘčČćĆžŽšŠăĂāĀēĒīĪōŌūŪőŐűŰěĚřŘůŮąĄęĘńŃśŚźŹżŻ";
const SLUG_PLAIN = "ooLLddggssiittsscccczzssaaaaeeiioouuoouueerruuaaeennsszzzz".toLowerCase();
const SLUG_PAIRS: readonly (readonly [string, string])[] = [
  ["æ", "ae"],
  ["Æ", "ae"],
  ["œ", "oe"],
  ["Œ", "oe"],
  ["ß", "ss"],
];

/** What a database is told to write a slug the same way, with `replace` for each pair, then `translate`. */
export const SLUGGING = { marked: SLUG_MARKED, plain: SLUG_PLAIN, pairs: SLUG_PAIRS } as const;

/**
 * A name as an address writes it: small letters and digits, the marks taken off, the rest
 * joined by a dash. "Praia da Cordoama" is `praia-da-cordoama`, "Jeffreys Bay (J-Bay)" is
 * `jeffreys-bay-j-bay`. Empty when the name has no letter or digit. Decision 057.
 */
export function slugify(text: string) {
  let paired = text;
  for (const [letter, plain] of SLUG_PAIRS) paired = paired.replaceAll(letter, plain);
  // The slug's own letters are read before the name is lowered, as the database reads them: a
  // capital İ lowered first would leave a dot behind.
  const plain = Array.from(paired, (letter) => {
    const at = SLUG_MARKED.indexOf(letter);
    return at < 0 ? letter : SLUG_PLAIN.charAt(at);
  }).join("");
  return fold(plain)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
