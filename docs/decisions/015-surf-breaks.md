# 015. A catalogue of surf breaks

Status: superseded in part by [decision 024](024-one-catalogue-of-breaks.md) on 2026-10-09. The table, the two routes and the OpenStreetMap source stay. The weekly import does not: a break is now added once, by hand, and its source is secondary. What follows is the record as it was. The catalogue and its import had been in use since 2026-10-08. Téo proposed to build the list from Surfline's map. The catalogue does not hold that list, for the reason under "Rejected", and decision 016 says where a list of that kind is kept. Publishing a user's spot after moderation is not built.

## Context

Tonnr has the wave stations and the wind stations. It lacked the places where people surf. Téo wants a user who creates an alert to pick the spot from a list, or to add a spot of their own. A spot of their own stays private, and becomes public only after moderation, so that nobody publishes a secret spot by accident.

No open list of the world's surf breaks exists. What was measured on 2026-10-08:

| Source                                             | Licence                | What it holds                                                                                                                              |
| -------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenStreetMap, objects tagged `sport=surfing`      | ODbL 1.0               | 1,279 objects. Most are shops, schools and clubs. 340 pass the filter described below.                                                     |
| Wikidata, "surf break" and "surf spot"             | CC0                    | 49 items, 37 with coordinates.                                                                                                             |
| Overture Maps places, category `surfing`           | CDLA Permissive 2.0    | 5,246 places, almost all from Meta pages. Half have a website or a phone number. The rest mixes beaches, breaks and vague areas.           |
| Foursquare Open Source Places                      | Apache 2.0             | Not measured. Its public bucket is empty, and the data is behind a sign-up.                                                                |
| OpenWaterAtlas 1.0.0                               | CC BY 4.0, as labelled | 547 surf rows, with slugs instead of names and no source per row. Part of it comes from OpenStreetMap, so the label cannot be taken as is. |
| Regional open data, such as New Zealand's councils | CC BY or unstated      | A few dozen breaks each.                                                                                                                   |
| Surfline, Surf-forecast, Wannasurf                 | proprietary            | Curated lists of several thousand breaks.                                                                                                  |

## Decision

- The catalogue is a table of its own, `surf_break`. It holds what open sources list, each row with its source, its licence and its attribution. It holds nothing a user wrote.
- A user's spot stays what decision 006 made it: a name, a point, criteria, an owner. It may start from a break. It then takes the break's name and point unless the request gives others, and keeps them as its own. `spot.break_id` remembers the break.
- The first source is OpenStreetMap. Once a week the worker asks Overpass for every object tagged `sport=surfing`, in one request. `isSurfBreak` in `apps/worker/src/breaks/osm.ts` keeps a named object that is not a business, a facility or a river wave, and its tests are the rule. On 2026-10-08 it kept 340 of the 1,279 objects.
- An import makes the catalogue hold what the source lists now. A break already known keeps its id. A break the source no longer lists is deleted, and the spots made from it lose only the link.
- A break the source lists and that cannot be read, such as an area without a centre, stays as it was.
- An empty list deletes nothing. Neither does a list shorter than half of what the catalogue holds of a source with twenty breaks or more: it is taken for a partial answer. An answer that Overpass cut short is refused whole.
- One import of a source runs at a time, and a list asked for before the one that is stored is left out.
- A failed import is tried again ten minutes later, five times at most. A request to Overpass is never repeated at once: its operators ask a refused caller to wait. The query gives Overpass 25 seconds, less than the 30 the request itself may take.
- The queue holds one run at most, waiting, retrying or running. The weekly schedule and a restart add nothing while a failed run waits for its next try.
- A restart of the worker does not import again. A first start does, and so does one that finds the last import more than eight days old.
- `GET /v1/breaks` lists the catalogue in a box or by name, and `GET /v1/breaks/{id}` gives one break. Both are public and return the source with each break. Pages follow one another, so the whole catalogue can be read: the ODbL asks that a database derived from OpenStreetMap be offered in full.
- A source is one module under `apps/worker/src/breaks`. It knows its provider's format and nothing about the database, as a buoy provider does.

## Rejected

- **Surfline's list in the catalogue.** This repository is public, with an API that states a licence for every record, and a list copied from Surfline has none that could be stated. The same holds for the other proprietary lists. Surfline's terms of use, as read on 2026-10-08, forbid extracting its content and limit its use to personal, non-commercial access to its services. Both `www.surfline.com` and the service behind its map refuse a script with a Cloudflare challenge, and answer a browser. A list of that kind stays out of the catalogue: decision 016.
- **One table for the catalogue and the users' spots, with a status on each row.** This was the first draft, with criteria moved to an `alert` table. A review found three faults. The migration removed columns that the running version reads, against decision 009. An owner could move a proposed spot after the moderator had looked at it and before the decision. And one answer mixed public breaks with the caller's own spots, which a cache keyed by address would serve to someone else.
- **Overture's places.** Too many are businesses or vague areas, and telling them apart needs a person. They could later feed a moderation queue.
- **Wikidata.** Thirty-seven breaks do not pay for merging two sources.
- **Publishing each imported object only after a person reviewed it.** It is the careful choice, and it leaves the catalogue empty until someone has gone through the 435 named objects that are not plainly a business. The errors that remain are few, each break links to its page at the source, and the correction belongs there.

## Consequences

- The catalogue is thin: 340 breaks in the world, under twenty on the French coast. La Torche is not in it. A user will often add their own point, so the list cannot be the only way to choose a spot.
- It grows three ways: OpenStreetMap improves, another open source appears, or users publish their spots.
- A few rows are not sea breaks. Known on 2026-10-08: a river wave in Montreal, a tidal bore on the Dordogne, and a beach on a German lake. The sea forecast has nothing for them.
- An area is placed at the centre of the box around it. On a long beach that can be a few hundred metres from the peak. A user moves their own spot where they surf.
- One break drawn as several objects appears several times. Playa de Chapadmalal has three rows.
- A name is in the language and the script of the place.
- A spot made from a break does not follow it. When OpenStreetMap corrects the break, the spot keeps its old point.
- An object replaced at the source, such as a point redrawn as an area, comes back as a new break with a new id.
- `visibility: "public"` on a user's spot means what it meant: whoever has the spot's id can read it. It lists the spot nowhere. Its meaning is to settle with sharing.
- Each instance sends Overpass one request a week, and a few more after a failure or on its first start. The public servers are shared and often answer 504, hence the later retries.
- A source that really loses more than half its breaks keeps them in the catalogue until someone deletes them by hand. The worker says so at each import.
- The pages of `GET /v1/breaks` describe the list as it is when each is asked for. A break added during the reading can be missed.
- The OpenStreetMap credit is in the API's answers and in the viewer's panel. The product's interface will have to show it too.

## Not built: publishing a user's spot

The review named what it needs. None of it is decided.

- The proposal is a copy of the name and the point, which the owner can no longer change. The moderator's decision applies to that copy.
- A moderator publishes it as a new break, attaches it to an existing one, or declines. Two users will propose the same place.
- Proposing a spot shows its name and its point to the moderators, and the user is told so first.
- The contributor accepts a licence when proposing, and the acceptance is recorded. A catalogue that mixes OpenStreetMap's rows with users' spots is one database under the ODbL, so that licence is the natural one. Téo has to confirm it.
- A moderator is a role on the account that no client can set.
