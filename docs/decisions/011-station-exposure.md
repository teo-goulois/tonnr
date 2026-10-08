# 011. Telling sheltered sites from the open sea

Status: proposed to Téo on 2026-10-08, who asked that such sites be told apart from the data. On the demo's data the rule called 8 stations sheltered, all Dutch harbour and estuary sites, and 93 open.

## Context

A provider's "mooring" is not always a buoy at sea. Copernicus Marine uses that word for buoys, measuring poles, oil platforms, and sites inside harbours and estuaries. A lock on the Oosterschelde shows 5 cm while the North Sea outside runs at 3 m, and on a map both are dots.

Nothing the providers publish tells them apart. The files of Copernicus label an offshore platform, an estuary site, and a Spanish buoy the same way, and the three report the same variables. Whether a site is a pole or a buoy matters little: a platform in the open sea measures the real swell. What matters to a surfer is whether the open sea reaches the site, and the waves themselves say that.

## Decision

- A station has an exposure: `open`, `sheltered`, or none. The public API returns it with the station. None means that nothing is known yet, and such a station is shown like any other.
- Once a night the worker reads it from the readings of the last thirty days, for every station that measures waves, whatever its provider.
- A station's strong waves of a day are the height that nine of its readings in ten stay under. They are compared with those of the stations within 60 km. A day counts when it is rough around the station: three neighbours in four reach one metre.
- A station is `open` as soon as, on one rough day, its waves reach half its neighbours'.
- A station is `sheltered` when its waves stay under a fifth of its neighbours' on every rough day, each seen among ten neighbours or more.
- A station the night's run can say nothing of keeps what was known of it.
- The web app draws a sheltered site smaller and faded, and says so when the site is opened.

## Consequences

- A buoy on an open coast can be in the lee of the land for one swell, and would then look sheltered for a day. This is why a station with few neighbours is never called sheltered, and why one high day is enough to call a station open. Where stations are sparse, a sheltered site stays unknown.
- Nothing is known of a station until a rough day comes: on the first night, 410 of 511 wave stations had no exposure.
- A group of sheltered sites does not hide itself, as long as three neighbours in four are in the open: the comparison is with the upper quartile of the neighbours.
- The rule says nothing of what a site is, a buoy, a pole, or a platform.
- The thresholds were set on three days of Dutch and Belgian data around one rough day. Check them again once a month of readings from several coasts exists.
