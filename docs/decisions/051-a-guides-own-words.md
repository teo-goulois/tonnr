# 051. The words of a surf guide for a wave and a bottom

Status: accepted on 2026-10-14. Téo asked for it that evening, reading in the admin that a bottom the guide's list calls an uneven reef was said "rock": "can't we update our catalogue and our definitions, to have all the rather precise terms that come from Stormrider?"

## Context

The catalogue's first words for the kind of a break and its bottom say little: a break is a beach, a reef, a point, a jetty, and its bottom sand, rock, coral or lava. A surf guide says more, with a legend of its own. A wave is shifting beach peaks, a consistent peak, a point, man-made or a rivermouth, and a few are a tidal bore or a standing wave in a river. A bottom is sand, an uneven reef, cobblestones or boulders, or a flat rock shelf, each alone or with sand. Translating these into the first words lost what a reader of the guide uses.

## Decision

- The catalogue gains the guide's words, after its own. A break may be a `peak`, which breaks in the same place, a `rivermouth`, `man_made`, a `tidal_bore` or a `standing_wave`. A bottom may be an `uneven_reef`, `boulders` or a `rock_shelf`. A bottom with sand says `sand` beside it, as a list of words says two things.
- No word is taken away. `beach` is the guide's shifting beach peaks. `rock` stays a hard bottom of which a list says no more, and `jetty` and `pier` stay what a list that knows says in place of `man_made`. What the catalogue already holds is left as it is.
- Each word has its reading in both languages, in the web app and the admin, and a glyph of its own, drawn from what it says as the others are (decision 041 and the glyphs of the guide).
- An account writes these words in a guide as it writes the others: a line of words takes its column's whole vocabulary.
- The API answers them as the others. Until its first public release, `v1` may gain words (decision 003).

## Rejected

- **Replacing `rock` with the three hard bottoms.** The breaks that only say rock would have the guide's words guessed for them.
- **A field apart for the guide's own legend.** A reader would meet two answers to the same question, and an alert or a filter would ask both.
