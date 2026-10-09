# 024. One catalogue of breaks, filled once

Status: decided by Téo on 2026-10-09 and built the same day. It replaces the weekly import of [decision 015](015-surf-breaks.md) and the private list of [decision 016](016-private-breaks.md). Not built: a way to change a break from the app, the reading of a break's best size, and the use of a break's characteristics to fill a spot's criteria. The two tables of the private list were dropped one release later, the same day.

## Context

An instance held two lists of breaks. The catalogue, `surf_break`, took what OpenStreetMap lists, once a week: an import added the new breaks, renamed and moved the known ones, and deleted the ones the source had dropped. The private list, `private_break`, took a file by hand, for the operator alone, and kept whatever the file said of a break as the file gave it.

Téo wants one list that belongs to the instance. A break enters it once. Nothing then renames it, moves it, or deletes it because a source changed, and no second list has to be matched against the first. What a break is like is said in Tonnr's own words, so that the app and the API can read it, where the private list kept a provider's words.

## Decision

- An instance has one list of breaks, the catalogue. The private list is gone, with its two procedures and the panel the web app showed its operator.
- A break is added once, by hand. `job breaks <file>` adds the breaks of a file, and `job breaks-fetch osm` asks OpenStreetMap for its list, once. Neither runs on a schedule, and the worker deletes the queue that the weekly import had scheduled.
- A break already in the catalogue is never changed by a list. A file names its list with a short name and each break with a reference: a break known by both is left as it is, and counted.
- `job breaks-fetch` adds only to a catalogue that holds no break. A place that two lists give would stand twice, and nothing matches one list against another.
- `job breaks-remove <list>` deletes the breaks the catalogue holds from one list. The spots made from them keep their name and their point, and lose the link, as decision 015 said.
- The three commands say what they would do, and do it only with `--write`. Each is one transaction, and one runs at a time.
- What a break is like is a set of columns, each a list of words that Tonnr defines in `packages/db/src/schema/spots.ts`: the type of break, the direction of the wave, the bottom, the levels, the boards, the best seasons, the best tides, and where the swell and the wind come from when it works, as points of the compass. The direction of the offshore wind is a number of degrees. A break also says the places it lies in and its time zone.
- Every one of these columns may be null. Null says that nobody has said.
- A file gives these words and no others. Whoever writes the file translates a list's vocabulary into them: the worker knows no provider's format but OpenStreetMap's.
- Where a break was read is secondary. The list's name, the break's reference and page, the licence and the attribution may all be null, and the API answers null for them. It states a licence for a break only when the list gave one.
- What a file says of a break beyond these columns is kept aside, as the file gave it, in `surf_break_record`. No procedure and no scheduled job reads that table. It waits for the day the model of a break grows.
- The catalogue is read as decision 019 says: by an account's session and by a key, and by no one without a name.

## Rejected

- **Keeping the weekly import.** It is what renames, moves and deletes breaks behind the instance's back, and what a second list would have to be reconciled with every week.
- **Copying the private list into the catalogue by a migration.** The migration would hold, in a public repository, the translation of one provider's words into Tonnr's. The operator translates outside the repository and adds the file with the same command as anyone.
- **Keeping the provider's words in a column of the catalogue.** Every reader of the catalogue would have to remember not to return it. A table that no procedure reads cannot be returned by mistake, which was decision 016's reasoning.
- **A table of characteristics, one row per break and word.** Nothing asks for the breaks that have a word yet. Lists in columns are read with the break, in one row.
- **An arc of degrees for the swell and the wind**, as a spot's criteria have. The points a list gives need not be next to one another, and an arc would add the ones between. Turning them into an arc is for the day they fill a spot's criteria.
- **Dropping the tables of the private list in the release that stopped reading them.** Decision 009 asks that the version a deployment replaces keeps working while it stops, and that version reads them.

## Consequences

- Whoever adds a list answers for it, towards its provider and towards the people the instance serves. The catalogue no longer says that a break may be republished: a list with no licence is served as any other, to every account and every key, and sign-up is open.
- The data rule of this repository does not change: no list, and no sample of one, goes into it, and nothing fetches a list from a provider whose terms forbid it. Only the OpenStreetMap source fetches.
- An instance starts with an empty catalogue. Its operator runs `job breaks-fetch osm --write` for the 340 breaks of decision 015, or adds a file of their own.
- A catalogue filled from OpenStreetMap is a database under the ODbL, and stays one: its rows carry the licence and the credit, and the API returns them.
- The catalogue no longer follows its source. A break that OpenStreetMap corrects stays as it was added, and one it adds does not arrive. An operator who wants the newer list removes the old one and fetches again, and the spots made from the old breaks lose their link.
- Nothing matches a file against another. Two files that give the same place under two list names add it twice.
- A break cannot be corrected from the app yet. Until then a correction is a statement on the database.
- `last_seen_at` is no longer written. It keeps what the weekly import wrote, and is null for a break added since.
- `operatorProcedure` builds no procedure today. It stays for what the instance will next keep to its operator.
- The private list's tables stayed one release, empty of readers, and the next migration dropped them. Their rows went with them: an operator who wants them in the catalogue adds the file again in the new format.
- A break's best size came as text without a unit in the lists seen so far. No column holds it: it stays in what is kept aside.
