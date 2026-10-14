# 050. The size a break works at

Status: accepted on 2026-10-14. Téo asked for it that evening, reading a candidate of the guide's list in the admin, whose pictograms said the waves it works at: "that the ideal size is 1.2 m to 5.5 m [...] these are very useful things to have, for every spot where we have them". The catalogue said where the swell and the wind come from and at which tides, and nothing of how big.

## Decision

- A break has a **size**: the height of the faces of the waves it works at, in meters, from the smallest to the largest. It is `waveSizeMeters`, `{ min, max }`, beside `offshoreDirectionDegrees` among a break's characteristics, and a spot of an account's own takes it too. A bound is null when it was not given: a guide that says "4 feet and up" gives no largest. One bound at least is given, each from 0 to 30 meters, the smallest no larger than the largest.
- It is kept to the tenth of a meter. A list's feet say no more, and a reader who reads feet reads a whole number of them again.
- It is a number, not a word, so it is no line of a guide that accounts write (decision 041): an operator sets it in the admin, a list brings it, and the guide shows it, as it shows the offshore wind.
- The API answers it with the other characteristics, null when nobody said. The web app writes it in the reader's unit of height (decision 033), with a glyph of its own: a gauge whose bar goes from the smallest wave to the largest.

## Rejected

- **Sizes said in words**, such as "small", "medium" and "big". A guide prints figures, and an alert asks figures of the sea: words would lose what a list gives.
- **The height of the swell** in place of the faces of the waves. A guide gives what a surfer sees at the break, which depends on the break as much as on the swell, and the models give the swell: an alert asks that of the sea apart.
