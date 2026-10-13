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
