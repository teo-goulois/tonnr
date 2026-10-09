# 016. A private list of surf breaks

Status: asked for by Téo on 2026-10-08, built on 2026-10-09. No screen and no procedure of the API reads the list.

## Context

The catalogue of decision 015 holds what open sources list: 340 breaks. The fuller lists are proprietary.

An operator can hold one of them for their own instance, from a provider whose terms give no right to republish it. Téo wants that for his, to see what such a list says of a break before the model of a spot changes. Nothing of it may leave the instance while the right to share it is not established.

The catalogue cannot hold it. Every row of `surf_break` goes out through `GET /v1/breaks`, with a licence that the API states.

## Decision

- A list that may not be republished lives in a table of its own, `private_break`. No procedure of the API reads it, no scheduled job does, and no other table points to it.
- A row says where it comes from: the provider, the provider's reference, the address of its page, the provider's terms, and when the provider was read. Its `rights` say `not-established`. A list whose rights are established belongs in the catalogue, through a source of decision 015.
- The name and the position are columns. Whatever else the file says of a break is kept as the file gives it, in `details`. Tonnr converts nothing in it and reads no unit into it: a size, a rating or a direction stays the provider's value.
- The list comes from a file, by hand: `job private-breaks <file>`. Tonnr fetches nothing. No module, no queue and no schedule asks the provider, on this instance or on anyone else's.
- The command checks the whole file before it writes. One fault refuses the file, and the command names the line.
- A value the database would hold differently from the file refuses the file too: a number past what JavaScript holds, a time finer than a millisecond, half of a surrogate pair, the character U+0000.
- Without `--write` the command says what it would change and stores nothing.
- An import is one transaction: all of the file is stored, or none of it. One import or removal runs at a time.
- A break already known keeps its id and takes the file's values. Importing the same file again writes nothing and records nothing.
- A break that a later file leaves out stays. The command says how many there are, and deletes none.
- Each import that wrote something is recorded with the SHA-256 of its file and what it did then. The counts are not kept up to date afterwards.
- `job private-breaks-remove <import>` deletes the breaks that import added, as they are now, and nothing else. It is a deletion, not a step back: a break the import only changed keeps the values it gave. Importing the earlier file again brings the earlier values back.

## Rejected

- **A column on the catalogue that says "do not publish".** Every reader of `surf_break` would have to remember it: the two routes, the creation of a spot, and whatever comes next. A table that no route reads cannot be forgotten.
- **A source that reads the provider on a schedule.** Other people run the worker. A module that calls the provider would call it from every instance, for a list none of them may publish.
- **A column for each characteristic.** Their shape is not settled, and which of them become fields of a spot is not decided. They wait in `details` until then.
- **Making the table hold what the file lists, as the catalogue's import does.** A file can be cut short, and here nothing fetches the list again a week later. Deleting is a command of its own.

## Consequences

- Whoever imports a list answers for holding it. The label on the row grants nothing, and keeping a list private is not a permission from its provider: its terms may forbid collecting it at all.
- The separation is in the code, not in the database: the tables sit next to the public ones, and whoever can query the database reads them. A dump holds the list, so a backup is as private as the list.
- A user cannot pick a private break, and `GET /v1/breaks` is what it was. Showing the list to anyone, the operator included, takes a procedure that checks who asks. That is a decision to record first.
- The private list and the catalogue can hold the same place. Nothing matches them.
- A number is kept by its value, not by how it is written: 1.50 comes back as 1.5, and -0 as 0.
- Of a field that a file's object gives twice, the last one counts, as JSON readers do.
- The two tables exist on every instance, empty unless its operator imports a file.
