import { fold } from "./names";

// What others read of an account holds no insult and no slur: a username, and the note of a
// report, which everyone reads at its break. Apple asks an app that shows what its accounts write
// for a way to filter it before it is shown (guideline 1.2); a flag, a block and an operator do
// the rest. Decisions 041 and 067.
//
// A short list, in the four languages of the instance, written as `fold` reads a text: in small
// letters and without marks. A word is found whole, alone or in the plural, and never inside
// another: "connard" is refused, "connaisseur" is not. Words that a surfer writes of the sea or
// that mean something else in another of the four languages are left out: "retard" is a delay in
// French, "puto" a kid in Portugal, "pede" asks in Portuguese, "con" is "with" in Spanish, a
// wind or a swell may be "bâtard", and an English slur that its plural would find in "spices" is
// left to the operator.
const INSULTS = new Set([
  // English
  "asshole",
  "bitch",
  "bastard",
  "cunt",
  "dickhead",
  "faggot",
  "kike",
  "motherfucker",
  "nigga",
  "nigger",
  "retarded",
  "slut",
  "twat",
  "wanker",
  "whore",
  // French
  "bougnoule",
  "connard",
  "connasse",
  "encule",
  "enfoire",
  "fdp",
  "negre",
  "ntm",
  "pd",
  "pute",
  "salaud",
  "salope",
  "tarlouze",
  "youpin",
  // Spanish
  "cabron",
  "gilipollas",
  "hijodeputa",
  "hijoputa",
  "maricon",
  "puta",
  "subnormal",
  "sudaca",
  "zorra",
  // Portuguese
  "badalhoca",
  "cabrao",
  "maricas",
  "paneleiro",
]);

/** Whether one word, as `fold` reads it, is one of the list, or its plural. */
function isInsult(word: string) {
  return (
    INSULTS.has(word) ||
    (word.endsWith("s") && INSULTS.has(word.slice(0, -1))) ||
    (word.endsWith("es") && INSULTS.has(word.slice(0, -2)))
  );
}

/**
 * Whether a text holds an insult or a slur of the list, whatever its case and its marks. A word
 * is what stands between two characters that are not letters: an underscore and a digit part
 * the words of a username, as a space does.
 */
export function hasInsult(text: string) {
  return fold(text)
    .split(/[^\p{L}]+/u)
    .some((word) => word !== "" && isInsult(word));
}
