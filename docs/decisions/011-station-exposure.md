# 011. Telling sheltered sites from the open sea

Status: proposed to Téo on 2026-10-08, who asked that such sites be told apart from the data. The rule was tightened the same day after a review. The demo then held two whole days of readings, too few for the rule to call any station sheltered yet.

## Context

A provider's "mooring" is not always a buoy at sea. Copernicus Marine uses that word for buoys, measuring poles, oil platforms, and sites inside harbours and estuaries. A lock on the Oosterschelde shows 5 cm while the North Sea outside runs at 3 m, and on a map both are dots.

Nothing the providers publish tells them apart. The files of Copernicus label an offshore platform, an estuary site, and a Spanish buoy the same way, and the three report the same variables. Whether a site is a pole or a buoy matters little: a platform in the open sea measures the real swell. What matters to a surfer is whether the waves reach the site, and the readings say that.

## Decision

- A station has an exposure: `open`, `sheltered`, or none. The public API returns it with the station. None means that nothing is known yet, and such a station is shown like any other.
- The exposure compares a station with the stations around it and says nothing else. A buoy on a lake is `open` when it gets what the lake's other buoys get.
- Once a night the worker reads it from the last thirty whole UTC days, for every station that measures waves, whatever its provider. The day under way is left out.
- A station's strong waves of a day are the height that a quarter of its readings reach. The day counts when its readings fall in three of its four quarters.
- Stations within 2 km of each other are one place, and a place's waves are the median of its stations'. A station is compared with the places within 60 km, its own left out.
- A day says something of a station when three places around it had strong waves of one metre or more. The station is compared with the median of those places.
- A station is `open` once it has had half that height on two days. It then stays open: the days leave the window, the place does not change.
- A station is `sheltered` when it stayed under a fifth of that height on every such day, three days at least, each among five places or more. One day at a fifth or above takes the label back.
- A station the days say nothing of keeps what was known of it.
- A station seen more than about 5 km from where it was loses its exposure, and its earlier readings no longer count. Each sighting is compared with the one before, so a station that creeps by smaller steps is not seen to move.
- The web app draws a sheltered site smaller and faded, and says what was measured when the site is opened.

## Consequences

- The rule reaches few stations. On the demo, 76 of 511 wave stations have five places within 60 km and can be called sheltered: 50 of Copernicus Marine's around the southern North Sea, 25 of NDBC's, and one in Queensland. 141 have three and can be called open. A harbour site on a coast with few stations stays unknown.
- `sheltered` is what the rough days seen so far show. A buoy in the lee of a headland for three swells from the same direction is called sheltered until a swell from elsewhere shows it open. `open` is not taken back, so a site that twice had half its neighbours' waves is shown as any other from then on.
- Nothing is known of a station until rough days come, and three are needed to call it sheltered.
- Sheltered neighbours do not lower what a station is compared with: only the places with a rough day are counted.
- The rule says nothing of what a site is, a buoy, a pole, or a platform, nor of the body of water it is on.
- The thresholds are judgments, not measurements. On the four days the demo held, the last one not over, 141 days of 92 stations could be compared. Eight Dutch harbour and estuary sites fell between 1% and 17% of their neighbours' waves, 119 days were at half or more, and six fell in between. Check the thresholds again once a month of readings from several coasts exists.
- The search compares every station with every other. It takes under a second for 2,000 stations and about six for 5,000.
