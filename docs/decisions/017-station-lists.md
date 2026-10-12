# 017. Station lists

Status: proposed to Téo on 2026-10-08, who asked for favorites and lists. Amended on 2026-10-09, when he asked that a surf break be saved as a buoy is: a list holds breaks too. Amended on 2026-10-12, when he asked that a spot be added to lists from its panel, "because it remains a spot": a list holds its owner's spots too.

## Context

An account kept spots and nothing about stations. A surfer who reads the same few buoys and wind stations had no way to keep them. Téo asked for favorites, and for lists to sort stations into.

## Decision

- A list belongs to one user and holds stations, surf breaks of the catalogue, and spots of its owner's. `station_list` is the list, `station_list_item` is one station in one list, `station_list_break` is one break in one list, and `station_list_spot` is one spot in one list. Each can be in several lists, once in each. The tables keep the name of what a list held first.
- Each user has one default list, the favorites, marked by `is_default`. It is created the first time the user adds something to it, so an account that saved nothing has no list. A partial unique index allows one per user.
- The favorites cannot be renamed or deleted. They are stored under the name "Favorites", and a client shows its own label, in the reader's language.
- In a path, `favorites` stands for the caller's default list. `PUT /v1/lists/favorites/stations/{stationId}` saves a station without asking for the list's id first, `PUT /v1/lists/favorites/breaks/{breakId}` a break, and `PUT /v1/lists/favorites/spots/{spotId}` a spot. A list's id is a UUID, so no list has that word as its id.
- Adding a station, a break or a spot twice, or removing one that is not in the list, changes nothing and is not an error.
- A list comes with the ids of its stations in `stationIds`, of its breaks in `breakIds` and of its spots in `spotIds`, each in the order they were added. The stations themselves are read from `/v1/stations`, the breaks from `/v1/breaks`, and the spots from `/v1/spots`.
- An account holds at most 50 lists besides its favorites, and a list at most 200 stations, 200 breaks and 100 spots, which is all the spots an account holds.
- The API gives a caller their own lists and no one else's. A list that is not theirs is reported as missing, as a private spot is.
- A list holds spots of its owner's alone. A spot that is someone else's is reported as missing when it is added, as it is everywhere (decision 006). A spot that is deleted leaves the lists it was in, and taking it out of a list leaves the spot.
- All of an account's spots are still listed apart, under "My spots": a spot is its owner's whether or not a list holds it. A break in a list is a place kept at hand, and making a spot of it is another act.

## Consequences

- Sharing a list is not built.
- `stationIds` names the stations a list holds. Once `v1` is released the field cannot change (decision 003), so the breaks came in a second field next to it, and the spots in a third.
- A list keeps the order in which its stations were added, its breaks after them in theirs, and its spots last. Letting the user reorder them, or mix the kinds, needs a position column.
- No route returns several stations or several breaks by their ids. A client that shows a list asks for each one, or finds them among those it has already loaded.
- Two lists of one account may have the same name.
- A station that is deleted leaves the lists it was in. No job deletes a station today. A break removed from the catalogue by `job breaks-remove` leaves the lists it was in.
- The map marks a saved station with a star. It does not mark a saved break yet.
