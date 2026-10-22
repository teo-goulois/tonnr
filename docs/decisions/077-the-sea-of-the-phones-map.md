# 077. The sea and the land of the phone's map, drawn by the app as the web draws them

Status: decided on 2026-10-22. Téo chose the route among the three that the plan for the phone map's parity with the web proposed: a module of the app that answers MapLibre's tiles with what the JavaScript draws. The other two were pictures stitched by the app and tiles drawn by the API. A spike on the iPhone's simulator proved the route before the rest was written. It amends [decision 018](018-swell-map.md), whose sea the web colored in the browser, and [decision 069](069-an-app-for-phones.md), whose map drew the sea another way.

## Context

The web colors the sea of decision 018 through a protocol of maplibre-gl: it spreads each gray tile of the model to the shore and colors it in the browser, then draws the land again over the colors from the basemap's own tiles, so that the coast stays sharp. MapLibre Native, which draws the app's map, has no such protocol. MapLibre React Native has no source that a program fills.

The app read the gray tiles as a relief instead: a raster DEM that a `color-relief` layer colored by its height. That had four faults:

- The model's cells showed as blocks along every coast.
- A band of the calm's blue ran along the land.
- The sea covered the land from zoom 10.
- A bay where the model has no sea stayed gray.

The relief also mixed the levels before it colored them, where the web mixes the colors, so a blend between two cells passed through other hues.

## Decision

- A local module of the app, `apps/native/modules/map-tiles`, answers the tiles MapLibre asks of a host of its own, `map-tiles.invalid`. No DNS answers that name (RFC 2606). The module sends each request to the JavaScript, which draws the tile and gives it back as a PNG. Every other request goes to the network as before.
- On iOS, a `URLProtocol` is put first in the session configuration of MapLibre's `MLNNetworkConfiguration`. A subscriber of the app's delegate does it before anything of the app runs, because MapLibre makes its one session from that configuration, once. The protocol tells URLSession nothing after the request is stopped.
- On Android, an OkHttp interceptor is put in the client of MapLibre's `HttpRequestUtil`. This is done on the main thread, after `MapLibre.getInstance`, which MapLibre React Native also calls. MapLibre React Native replaces that client only when the JavaScript adds a transform of the requests, which the app never does. `setOkHttpClient` takes a `Call.Factory`.
- On both platforms the module reaches MapLibre through reflection, since it does not depend on it.
- A tile is answered with an HTTP status as MapLibre reads one:
  - 200, with its image;
  - 204, when it holds nothing;
  - 404, when it never will;
  - another status, for a tile MapLibre should ask for again later.
- A tile asked while nothing listens waits until something does. A tile MapLibre no longer wants is cancelled, and its drawing aborted.
- The address of a tile says all that it is drawn from:
  - the address of its source, with the sea's moment in it;
  - the name of the palette, read from the colors it paints;
  - the colors of the land and the water;
  - the version of what draws it.

  MapLibre keeps a tile by its address, as it keeps any, and asks the app again only for a tile it does not have.

- The app draws with the web's rules, which `packages/client` holds for both:
  - `spreadSea` and `paintSea`, in `src/map/sea.ts`, with `SEA_DRAWING`, their version;
  - `waterOf`, in `src/map/land.ts`, which reads the water of a basemap tile into two SVG paths, the ocean and the rest, with `LAND_DRAWING`.

  Their tests hold what they draw: a test that changes there changes the version. The web paints the tiles on a canvas, and the app with Skia, in `apps/native/src/components/map/tile-painter.ts`. The addresses are `drawn-tiles.ts`, beside it, which has the version of the app's own painting.

- The map has the web's two layers:
  - the sea, tiles of 256 points, blended pixel to pixel, asked no closer than zoom 4;
  - over it the land, tiles of 512 points drawn as finely as the web draws them, which appear at once.

  A tile with no water is one color, which a picture of 16 pixels says. The sea is not drawn without the land, which it would cover.

- Each moment of the sea is a source of its own. The one in view stays until the next has its tiles, then fades into it in 250 ms, as on the web. MapLibre Native loads no tile of a layer it does not draw, so the coming moment is drawn at 1% while its tiles come. MapLibre says the map is drawn once a style is loaded, and after that only frame by frame. So the coming moment is shown at the first frame drawn whole after one that waited for tiles, or after 3 s at most.
- The raster DEM and its `color-relief` are gone.

## Consequences

- On the iPhone's simulator, the coast, the bays, the rias and the rivers are the web's at the three views it was compared at, and so are the blends between two cells. Lakes keep the basemap's gray, and the parks under the land are not drawn.
- The app fetches each basemap tile in view twice, once for MapLibre's own layers and once for the land, as the web fetches it twice. OpenFreeMap sees no more of a reader than before.
- The drawing runs on the JavaScript's thread. On the simulator, a tile of land took from 3 to 300 ms to read and fill, and about 30 ms to write as a PNG. A tile of the sea took about 60 ms. A pan or a zoom asks for a few at a time. Nobody has measured it on a phone. If it holds the app back there, the PNG can be written natively, off that thread.
- The module is native code on two platforms, which every build must carry. A build made before it shows no colored sea, and the rest of its map works. As of this decision, the Android side has been reviewed but not compiled or tried.
- A drawing that changes must change its version, or MapLibre keeps the tiles it had for up to a week.
