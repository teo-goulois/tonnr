# 042. What was looked at last, found again

Status: accepted on 2026-10-12. Téo asked for it that day: the surf breaks looked at lately stand out on the map, so that they are easier to reach, and an account keeps them. [Decision 069](069-an-app-for-phones.md) amended it on 2026-10-19: `getRecents`, `saveRecent` and `clearRecents` belong to `v1`, at `/v1/preferences/recents`, since the app for phones reads them too.

## Context

A reader comes back to the same few places: the break of the morning, the buoy off it, the spot of the weekend. Nothing told them from the nine thousand breaks of a catalogue but a list, which takes a press to fill. A break's name comes in at zoom 9, and from afar every break is the same dot.

A marker that stands out helps only where the map already looks. Going back to a place is first a matter of finding it in a list.

## Decision

- What is looked at is what a panel opens on: a station, a break of the catalogue, or a spot of the reader's own. Pointing at a marker is not looking. A spot read in a list someone shared is not kept: it is not the reader's to find again.
- The last five are kept, the last first, each once. The oldest leaves when another comes.
- An account keeps them, so that they are the same on every device: `recent_view`, a row for each, read and written by `preferences.getRecents`, `preferences.saveRecent` and `preferences.clearRecents`. They take a session and no key, as the units do, and are not part of the versioned API.
- A row names what was looked at and holds nothing of it. An answer gives its name and its place as they are then, and leaves out a row whose station, break or spot is gone. A spot is answered to its owner alone.
- The account alone reads its rows: no operator's screen, no friend and no other procedure does. It clears them when it wants, and they go with the account.
- A visitor has them too, in the browser alone. The browser of an account keeps a copy, so that a page opens with it. The account's answer wins, and signing out clears the copy.
- They are listed in the saved panel, under "Recently viewed", for a visitor under what asks for an account, and they come first in the command palette, before a key is pressed.
- On the map, a break looked at lately is no smaller than a disc of four pixels and has its name from afar, in the ink of every break. It is drawn whether it is among the breaks in view or not, and its name is the one kept where two would meet. A list shown alone is drawn as it is.

## Rejected

- **The browser alone.** No table and no route, and nothing of what an account reads on the server. But a reader would find nothing on the phone of what they looked at on the desk. Téo chose the account.
- **A color of their own on the map.** Easier to see. But a color says what was chosen: the accent is the reader's own spots. What was looked at was not chosen, and changes at every press.
- **Every view, with its time, as a history.** A row for each would say when an account looks at what. Five rows that replace each other say the least that finds a place again.
- **Stations and spots made more of on the map too.** The buoys are pills and the spots are pins in the accent: they are seen from afar already.

## Consequences

- The API is deployed before the web app: a web app that asks an older API gets an error, and the browser's own list stands.
- A visitor who makes an account does not bring what the browser held: the account's list, which is empty, takes its place.
- Two views at once may leave a sixth row, which the next view takes away. An answer never holds more than five.
- The mobile app reads the same three routes.
