# 017. Station lists

Status: proposed to Téo on 2026-10-08, who asked for favorites and lists.

## Context

An account kept spots and nothing about stations. A surfer who reads the same few buoys and wind stations had no way to keep them. Téo asked for favorites, and for lists to sort stations into.

## Decision

- A list belongs to one user and holds stations. `station_list` is the list, and `station_list_item` is one station in one list. A station can be in several lists, once in each.
- Each user has one default list, the favorites, marked by `is_default`. It is created the first time the user adds a station to it, so an account that saved nothing has no list. A partial unique index allows one per user.
- The favorites cannot be renamed or deleted. They are stored under the name "Favorites", and a client shows its own label, in the reader's language.
- In a path, `favorites` stands for the caller's default list. `PUT /v1/lists/favorites/stations/{stationId}` saves a station without asking for the list's id first. A list's id is a UUID, so no list has that word as its id.
- Adding a station twice, or removing one that is not in the list, changes nothing and is not an error.
- A list comes with the ids of its stations, in the order they were added. The stations themselves are read from `/v1/stations`.
- An account holds at most 50 lists besides its favorites, and a list at most 200 stations.
- The API gives a caller their own lists and no one else's. A list that is not theirs is reported as missing, as a private spot is.
- Lists hold stations only for now. Spots may join them later.

## Consequences

- Sharing a list is not built.
- `stationIds` names what a list holds today. Once `v1` is released the field cannot change (decision 003), so spots would come in a second field next to it.
- A list keeps the order in which its stations were added. Letting the user reorder them needs a position column.
- No route returns several stations by their ids. A client that shows a list asks for each station, or finds them among those it has already loaded.
- Two lists of one account may have the same name.
- A station that is deleted leaves the lists it was in. No job deletes a station today.
