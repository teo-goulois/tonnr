# 049. The catalogue kept from the admin, and the candidates of a list decided one at a time

Status: accepted on 2026-10-14. Téo asked for it that day, after a list of breaks taken from a guide had been checked in a page served from his Mac: "in the admin, a part to manage the spots, with all our spots on a map, to look at them, edit them, merge one with another, delete one. And then the import part, where I go when I have the time and check whether a spot is to add, to merge, or to leave out." He wants "a permissive flow, but the simplest possible". He chose that a break accounts use is not deleted but merged, that a merge fills what is empty and lets him choose where two values differ, and that a list's own texts stay with the operator, who writes a description of his own. Decision 024 left "a way to change a break from the app" unbuilt: this is it.

## Context

The catalogue was filled once by a command and changed by nothing after: a correction was a statement on the database. Two breaks of one place stayed two. A list prepared outside the repository, with the research that matched each of its breaks to the catalogue, could only be added whole by `job breaks`, which matches nothing.

## Decision

- The admin has a page Catalogue, with two tabs. Everything there is an operator's, through `adminProcedure`, and is recorded with the operator's other actions.
- **Breaks** draws every break on a map. An operator finds one by its name, sees those of which nothing is known and those closer than 60 m to another, and opens one. They change its name, its point, its characteristics and its description, see what uses it, what each list said of it, and the breaks within 1 km, and merge or delete it.
- A break has a **description**: a few sentences, 600 characters at most, which its operator writes, with the language they wrote it in. The API answers it with the break, and the guide shows it. A list's own text is never copied there: it is read, and written again in the operator's words.
- An operator changes the catalogue's values. A line of words that accounts confirmed still shows over them in the guide (decision 041), and the admin says so under that line.
- What changes a break names the version that was read, its `updated_at`: a break that changed since is not changed, and the answer is 409.
- **Merging** two breaks keeps one. The spots, lists, sessions, answers, recent views, listings and candidates that named the other name it, and the other is deleted. The one that stays takes the values the operator chose: by default its own, and the other's where it says nothing. It keeps the source of the one the operator names, by default the one that gives a licence.
- A break that accounts wrote in the guide of, or that was made of a spot (decision 034), is not merged away: the points its authors were counted name it. The other is merged into it.
- **Deleting** a break is refused while a spot, a list, a session, a guide or a request uses it: it is merged instead.
- **What a list said of a break** is kept in `surf_break_listing`, one row by list and reference: the break's own list, and each list whose break was merged into it. A row stays, with no break, when its break is deleted. `job breaks` skips a reference that has a row, so adding a list again brings back neither what was merged nor what was deleted. `job breaks-remove <list>` deletes the list's breaks and forgets its rows. An operator reads these rows in the admin; no other procedure does. They replace `surf_break_record`, which stays one release (decision 009).
- **A candidate** is a break a list proposes, with what whoever prepared the list says of it: a point, the catalogue's words, a proposal (add it, merge it into a break, or not sure) with its reasons and doubts, the pages that were read, the list's texts, and pictures of its own, such as the page of a guide's map with the break's label marked. `job candidates <folder>` stores them, from a file and its pictures prepared outside the repository. Storing again brings up to date what waits, and leaves what was decided. `job candidates-remove <list>` deletes them.
- **Import** reads the candidates one at a time, by state and by region. An operator adds one as a new break, merges it into a break of the catalogue, choosing what the break keeps, puts it off, or leaves it out with a note. Each is one transaction, from the version that was read, and the next opens at once. One left out or put off goes back into the queue at a word. One whose break is deleted waits again.
- A break added from a candidate names its list and its reference, and nothing else of where it was read: no page, no attribution, no licence. What the list said of it is kept in its listing.
- Every change of the catalogue, by a command or in the admin, holds the catalogue first: one at a time.

## Rejected

- **A page served from the operator's computer**, as the list was checked until now. It needs that computer on and a tunnel, writes nothing to the database, and leaves an export to carry over.
- **Deleting a break that accounts use**, and letting their links go. A merge keeps what they saved.
- **Merging a break that accounts wrote in the guide of.** Its contributions would move to a break whose words they were not written about, and the points of a spot made public name the break it became: one counted again at the next start.
- **Copying a list's description into the guide.** It is the author's text, and the list's terms do not give it.
- **A column for each list's words**, or the list's text beside the catalogue's. Decision 024's reasons hold: what a list says stays aside.
- **Matching candidates automatically**, by name and distance. The research that comes with a list proposes, and the operator decides.

## Consequences

- Whoever adds a list answers for it, as decision 024 says. The pictures of a list are stored in the database, and only an operator reads them.
- A request that names a break while it is merged away fails once, as one that names a deleted break does.
- A break merged into another leaves no redirection for an address that named it: a link to it finds nothing.
- `surf_break_record` is read by nothing, and the next migration drops it.
