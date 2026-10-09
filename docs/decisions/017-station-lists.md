# 017. Station lists

Status: proposed to Téo on 2026-10-08, who asked for favorites and lists. Amended on 2026-10-09, when he asked that a surf break be saved as a buoy is: a list holds breaks too.

## Context

An account kept spots and nothing about stations. A surfer who reads the same few buoys and wind stations had no way to keep them. Téo asked for favorites, and for lists to sort stations into.

## Decision

- A list belongs to one user and holds stations and surf breaks of the catalogue. `station_list` is the list, `station_list_item` is one station in one list, and `station_list_break` is one break in one list. A station or a break can be in several lists, once in each. The tables keep the name of what a list held first.
- Each user has one default list, the favorites, marked by `is_default`. It is created the first time the user adds a station or a break to it, so an account that saved nothing has no list. A partial unique index allows one per user.
- The favorites cannot be renamed or deleted. They are stored under the name "Favorites", and a client shows its own label, in the reader's language.
- In a path, `favorites` stands for the caller's default list. `PUT /v1/lists/favorites/stations/{stationId}` saves a station without asking for the list's id first, and `PUT /v1/lists/favorites/breaks/{breakId}` a break. A list's id is a UUID, so no list has that word as its id.
- Adding a station or a break twice, or removing one that is not in the list, changes nothing and is not an error.
- A list comes with the ids of its stations in `stationIds` and of its breaks in `breakIds`, each in the order they were added. The stations themselves are read from `/v1/stations`, and the breaks from `/v1/breaks`.
- An account holds at most 50 lists besides its favorites, and a list at most 200 stations and 200 breaks.
- The API gives a caller their own lists and no one else's. A list that is not theirs is reported as missing, as a private spot is.
- A list holds no spot. A spot is a user's own, with the conditions that make it work (decision 006): a break in a list is a place kept at hand, and making a spot of it is another act.

## Consequences

- Sharing a list is not built.
- `stationIds` names the stations a list holds. Once `v1` is released the field cannot change (decision 003), so the breaks came in a second field next to it, and spots would come in a third.
- A list keeps the order in which its stations were added, and its breaks after them in theirs. Letting the user reorder them, or mix the two kinds, needs a position column.
- No route returns several stations or several breaks by their ids. A client that shows a list asks for each one, or finds them among those it has already loaded.
- Two lists of one account may have the same name.
- A station that is deleted leaves the lists it was in. No job deletes a station today. A break removed from the catalogue by `job breaks-remove` leaves the lists it was in.
- The map marks a saved station with a star. It does not mark a saved break yet.
