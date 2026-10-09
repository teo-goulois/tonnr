# 018. The swell map

Status: proposed to Téo on 2026-10-08, who asked for the sea to be colored by the swell. The API's part ran once against the real service.

## Context

The map shows what buoys measure, as dots. Between two buoys it says nothing, and most coasts have none. Téo asked for the sea itself to be colored by the swell, as Surfline's swell map is.

That takes a wave height at every point of the sea, which only a model gives. Open-Meteo, the source of the forecasts, answers point by point, and decision 005 left out decoding a model's gridded files, for lack of tools in TypeScript. The Copernicus Marine Service already draws its global wave model as map tiles, readable without an account, under the licence that decision 010 describes.

## Decision

- The sea is colored by the significant wave height of the product `GLOBAL_ANALYSISFORECAST_WAV_001_027`. It is MFWAM, Météo-France's global wave model, on a 1/12° grid, with a field every three hours up to ten days ahead.
- The browser reads the tiles from Copernicus, as it reads the basemap from OpenFreeMap. Tonnr's servers fetch no tile and store none.
- The API describes the layer, and `packages/conditions/src/forecasts/copernicus-wave-map.ts` is the only code that knows the provider. `GET /v1/maps/wave-height` gives the address of a tile with `{z}`, `{x}`, `{y}`, and `{time}` to fill, the zooms, how a pixel says a height, the moments the model has a field for, and the credit. Another provider, or tiles that Tonnr would draw itself, would change that module and no client.
- The layer is looked up in the service's capabilities, because the dataset's name carries a version.
- The tiles are asked in gray, so the client owns the palette and gives the sea and the buoys the same colors.
- A gray level is not a share of the range. The service's gray ramp is even to the eye and not in its numbers, and reading it as a straight line is wrong by up to 0.6 m. The API reads the ramp from the legend the service gives for the style, and returns the height each of the 256 levels of red stands for, as `encoding.metersByLevel`.
- The legend also names the ramp, the range, and the unit that were used. The service answers a ramp it does not know with the variable's default colors and no error. When the legend is not the one expected, the API says the map is unavailable, so the client never reads heights from the wrong colors.
- The capabilities and the legend are kept an hour, in memory.
- The address of a tile carries the moment the data last changed, in a parameter the service ignores. Copernicus marks a tile to be kept thirty days. Without that parameter a browser would go on showing an old run's field of a coming day.
- The web app's palette is in `apps/web/src/lib/sea-scales.ts`. A sea under half a metre keeps the basemap's color, so a flat sea reads as empty. The colors reach the shore at every zoom, as Téo asked on 2026-10-09: the web app gives the water the model leaves blank the height of the nearest cell, and draws the land again over the colors, from the basemap's own tiles, so the coast stays sharp. It asks for no tile closer than zoom 7, where a cell already covers several pixels.
- The legend steps through the model's fields, three hours at a time, from the latest one that is not in the future.
- The credit is shown on the map. The API returns it as `source.attribution`: "Generated using E.U. Copernicus Marine Service Information" and the product's DOI. A map in Tonnr's palette is a product that was changed, which is the case that wording is for.

## Consequences

- Copernicus sees the address of each visitor and the part of the sea they look at, as OpenFreeMap does for the basemap.
- Tonnr has no say in whether the service answers, nor in how many tiles it gives. Its help page states no limit. When it fails the sea is not colored, and the rest of the map works.
- A self-hosted instance gets the same map with no key and no account. Its API asks Copernicus for two documents an hour, its visitors' browsers fetch the tiles, and it owes the credit as Téo's instance does.
- A cell of the grid is about 9 km and is sea or land as a whole. The model's coast is coarse, and a bay smaller than a cell takes the height of the open sea beside it. Shelter on a smaller scale than a cell does not show. The color at a spot is the height offshore, not the height of the waves that break there.
- The field comes from a model, and a buoy can show one color while the sea around it shows another. Open-Meteo stays the source of the forecast at a point, so the map and a spot's forecast are two sources and can disagree.
- A height of 10 m or more is drawn as 10 m. On 2026-10-08 the model had more than 10.5 m in the southern Indian Ocean.
- Read with the API's table, the 45 pixels checked that day were within 4 cm of the heights the service gave for them.
- Section 2.6 of the licence, on keeping records, applies as decision 010 says. The tiles go from Copernicus to the browser, so Tonnr holds no record of them. What it has is the API's log of the requests for the description. The API's terms must carry the requirement for this map too.
- The licence asks that the credit be clearly visible on the home page or on the page that gives access to the data. The map must show it whenever the sea is colored.
- The gray ramp and the legend in JSON are in the service's help page and not in its capabilities. If the colors of the ramp change, the API follows them at its next reading. If the ramp or the legend goes, the API answers 503 and the module must be read again against that page.
- The moment the data last changed is a field of the service's own, outside the WMTS standard. If it goes, the address loses its parameter, and a returning visitor may see an earlier run's field for up to thirty days.
- With that parameter, each update of the product gives every tile a new address, and a browser downloads again the tiles it had.
- The description is kept in memory, so it is asked again after the API restarts, and once per instance.
- The times start in 2022. The API gives the whole range and leaves the choice of what to show to the client.
