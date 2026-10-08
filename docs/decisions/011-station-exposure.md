# 011. Telling sheltered sites from the open sea

Status: proposed to Téo on 2026-10-08, who asked that such sites be told apart from the data. The rule was tightened twice the same day after reviews. The demo then held two whole days of readings, too few for the rule to call any station sheltered or open yet.

## Context

A provider's "mooring" is not always a buoy at sea. Copernicus Marine uses that word for buoys, measuring poles, oil platforms, and sites inside harbours and estuaries. A lock on the Oosterschelde shows 5 cm while the North Sea outside runs at 3 m, and on a map both are dots.

Nothing the providers publish tells them apart. The files of Copernicus label an offshore platform, an estuary site, and a Spanish buoy the same way, and the three report the same variables. Whether a site is a pole or a buoy matters little: a platform in the open sea measures the real swell. What matters to a surfer is whether the waves reach the site, and the readings say that.

## Decision

- A station has an exposure: `open`, `sheltered`, or none. The public API returns it with the station. None means that nothing is established, and such a station is shown like any other.
- The exposure compares a station with the stations around it and says nothing else. A buoy on a lake is `open` when it gets what the lake's other buoys get.
- Once a night the worker reads it from the last thirty whole UTC days, for every station that measures waves, whatever its provider. The day under way is left out.
- A station's strong waves of a day are the height that a quarter of its readings reach, taken among the heights it measured. The day counts when it has readings in each of its four quarters.
- Stations within 2 km of each other, straight or through other stations, are one place, with or without readings. A station is compared with the other places through the stations they have within 60 km of it, and a place's waves are the median of those stations'.
- A day says something of a station when three places around it had strong waves of one metre or more. The station is compared with the median of those places.
- A station is `open` when it had half that height on two days.
- A station is `sheltered` when it had three such days under a fifth of that height, each among five places or more, and none at a fifth or above.
- A label holds while the days say nothing. One day at a fifth or above takes `sheltered` back. `open` stays until the days show the station sheltered.
- A station seen more than 5 km from where it was loses its exposure, and its earlier readings no longer count. Each sighting is compared with the one before, so a station that creeps by smaller steps is not seen to move.
- The web app draws a sheltered site smaller and faded, and says what was measured when the site is opened.

## Consequences

- The rule reaches few stations. On the demo, 76 of 512 wave stations have five places within 60 km and can be called sheltered: 50 of Copernicus Marine's around the southern North Sea, 25 of NDBC's, and one in Queensland. 142 have three and can be called open. A harbour site on a coast with few stations stays unknown.
- A label is what the rough days of the last thirty show, not a fact about the place. Two or three days may be one storm, and the rule does not tell swells or their directions apart. A buoy in the lee of a headland for a month of swells from one side is called sheltered until two days show it open.
- Nothing is known of a station until rough days come, and three are needed to call it sheltered.
- A neighbour that stays under one metre does not lower what a station is compared with. A sheltered neighbour that reaches one metre counts like any other.
- Two feeds of one buoy placed more than 2 km apart count as two places. A fixed distance cannot tell them from two buoys.
- The rule says nothing of what a site is, a buoy, a pole, or a platform, nor of the body of water it is on.
- The thresholds are judgments, not measurements. The demo held four days when they were set, the last one not over. By the rule's own count, two whole days gave 51 days to compare: 6 under a fifth of the neighbours' waves, 42 at half or more, and 3 in between. Counting also the day under way and every day with readings in two quarters, 141 days of 92 stations: the eight Dutch harbour and estuary sites that the first rule had called sheltered fell between 1% and 17%, two other sites had a day under a fifth, 119 days were at half or more, and 6 fell in between. Check the thresholds again once a month of readings from several coasts exists.
- The search compares every station with every other, twice. Thirty days of 2,000 stations on a grid of sites 20 km apart took 1.6 seconds, and 5,000 took 9.
- The queries and the move test are not covered by the automated tests, which have no database. They were run by hand on a copy of the demo's database.
