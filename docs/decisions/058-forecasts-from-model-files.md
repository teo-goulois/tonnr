# 058. Forecasts read from the models' open files

Status: proposed on 2026-10-16, after Téo asked on the evening of 2026-10-15 whether the instance had to go through Open-Meteo's API at all ("y'a pas un service plus bas niveau qu'on peut use ?") and to try the open data. Built that night in the branch `spike/open-meteo-files`, for him to read and deploy. It amends [decision 005](005-forecasts.md), which said that the models' grids need tools TypeScript lacks, [decision 023](023-forecasts-kept.md), whose budget becomes the budget of a fallback, [decision 037](037-finer-wave-model.md), which keeps its fine model, [decision 038](038-swell-apart.md), whose swell now comes from the same model read elsewhere, and [decision 057](057-public-pages-of-breaks.md), whose pages no longer wait for a share of a quota.

## Context

The instance asks Open-Meteo's HTTP API for every forecast it does not hold, two requests a cell, within 8,000 requests a day (decision 023). The quota bounds everything the product does with a forecast: the alerts, the people who look, and since decision 057 the pages of the listed breaks, which share the day in three. The paid plan lifts the quota for about 29 € a month.

Open-Meteo is open source, and publishes the files its API reads on a public bucket, `s3://openmeteo` on AWS, under CC-BY-4.0 (`github.com/open-meteo/open-data`): one folder a model, one a variable, files of a fortnight of hours in its own format, OM, chunked so that one point is read in a few kilobytes by range requests. An official reader exists for TypeScript, `@openmeteo/file-reader`, over WebAssembly.

Measured on the night of 2026-10-15 (`scratch/open-meteo-files/REPORT-058.md` in the branch, not in the repository):

- The 10 m wind of `dwd_icon_eu` read from the bucket at Mundaka is the API's, value for value, at the same grid point. So are the global models at Bells Beach.
- MFWAM's waves and swell from `meteofrance_wave` are the marine API's, byte for byte, at 7 points of 8: the API serves these very files. Its directions are stored 180° off, which the API corrects for this model alone.
- The API does not take the nearest grid point for a wave model: it reads a land mask, `static/HSURF.om`, and takes the sea cell nearest in squared degrees within two cells. The nearest cell with a value is another cell at Mundaka, and another height.
- One point over one chunk of one variable is four range requests and one to two kilobytes. A chunk holds a whole row of longitudes: neighbouring cells cost nothing more.
- The Met Office's fine model of decision 037 is not in the bucket. ECMWF's 9 km models are, on a reduced Gaussian grid the reader does not index.
- The API's `best_match` is a table of regions, the finest model first, the next filling what it lacks, with a ramp of three hours where one hands over to the next.

## Decision

### What is read, and from where

- A forecast is read from the models' files on Open-Meteo's bucket, through `packages/conditions/src/forecasts/open-data.ts`, and asked of the HTTP API only when the files cannot be read. The budget of decision 023 counts that fallback and nothing else. A cell is still kept in the database as decision 023 says, and the memory, the store and the age of a forecast do not change.
- The wind, its gusts, the air temperature, the cloud cover and the precipitation come from one model and the next, as the API combines them, in this order where each covers the point: `dwd_icon_d2` (2 km, two days) where its grid reaches, else `meteofrance_arome_france0025` (2.5 km, two days) over France, then `dwd_icon_eu` (7 km, five days) over Europe, then `dwd_icon` (11 km, seven and a half days) over the world, and `ncep_gfs013` (13 km, sixteen days, without gusts) for the hours that are left. Where a finer model ends, its last three hours are blended into the next one, a quarter, a half and three quarters, as the API does. The models stored as speed and direction, and the ones on a projected or a Gaussian grid, are left for later.
- The whole sea and the swell apart come from `meteofrance_wave`, MFWAM at a twelfth of a degree, every three hours: the height, the mean period and the direction of the whole sea, and the height, the period and the direction of the first swell. Its directions are turned by 180°. The peak period of the whole sea, which MFWAM's files lack, comes from `ecmwf_wam025` (0.25°). The three-hourly values are read at every hour between, as the API reads them.
- The fine model of decision 037 is still laid over the north-west European shelf from Copernicus Marine's store. The swell store of decision 038 is read no more: the same MFWAM gives the swell here, and the peak period that the fine model gives is kept where it has its sea.
- A wave model's cell is the sea cell the API would take: its land mask, `static/HSURF.om`, and the cell nearest in squared degrees within two of the grid point. A model with no land mask in the bucket, as ECMWF's, has its nearest cell with a value stand for the sea. A point with no sea cell within that reach has no sea forecast, as before.

### How the files are read

- Each model's `static/meta.json` says its grid, its step, its last run and the length of its chunks. It is read again every half hour. A chunk's number is the second of the hour asked divided by the chunk's length in seconds. A forecast of eight days may straddle two chunks, which are both read. A model's box may reach further than its values, as ICON-D2's does at Mundaka: a model that answers nothing at the point is passed over, and the next stands.
- The reader keeps the blocks it fetched in memory, 64 KB at a time and 32 MB at most for each process, as the Copernicus pieces are kept: a chunk read for one cell answers its neighbours on the same row, and the trailers and indexes of a file are read once. A file's version is learnt by a probe of its first bytes, kept five minutes, and a block of another version fails the read, which is tried again. Every model that covers the point is read at once, and a cell waits twenty seconds for the files before the API is asked instead.
- The point of a forecast is the grid point of the finest model that answers it, and its `models` name each model from the hour it takes over, as today.
- Nothing is counted: the bucket has no quota. The requests are logged by their number in the worker's run, as the Copernicus reads are.

### The credit

- A forecast says that its weather data is by Open-Meteo.com, under CC-BY-4.0, and names the producers of the models that answered it: DWD, Météo-France, NOAA, ECMWF. `/sources`, `docs/data-sources.md` and the credits of a forecast change together.

### What follows for the worker and the pages

- The job of decision 057 refreshes the cells of the listed breaks every three hours, all of them at each run, since a refresh costs no quota. The three shares of the day stay as the budget of the fallback.
- A forecast that the files gave is kept and read as any other: the pages, the alerts and the map see no difference but the hours they get and the models they name.

## Rejected

- **The provider's paid plan.** 29 € a month lifts the quota to a million requests, and leaves every forecast a request away. The files are the same data for nothing, and the instance already reads two stores this way.
- **Open-Meteo's own container**, synced from the bucket and serving the same API on the server. Exact parity with no code of ours, but a fourth container, several gigabytes a day of chunks downloaded whole, and a self-hoster who would have to run it or stay on the public API. The files read by range are a hundred megabytes a day.
- **The raw files of the weather services**, ICON's and GFS's GRIB2. No reader in TypeScript, an icosahedral grid for ICON, and the bucket already holds them regridded and chunked.
- **Reading every model the API combines.** A dozen regional models, half of them stored as speed and direction or on their own projection. The five chosen cover the catalogue's coasts at 2 to 13 km; the others are a table entry away once their grids are indexed.
- **Dropping the HTTP API altogether.** The bucket has no promise of service. A file that cannot be read for a minute costs one request of the fallback, within a budget that is now almost never spent.
- **Keeping the Copernicus swell store beside MFWAM's files.** The same model twice, with grids labelled half a cell apart.

## Consequences

- A forecast costs the instance no quota, so the listed pages, the alerts and the map stop competing for a day's requests. The closure to visitors of decision 039 still counts the fallback's requests, and all but never closes.
- The dependency `@openmeteo/file-reader` is pinned: its interface changed between its early versions, and the format changed at the end of 2024. The read is behind one module, `open-data.ts`, and a change of either changes that module alone.
- The bucket is in Oregon. Measured on 2026-10-16 from Europe: a cold cell took 5.6 s at Mundaka, where three models answer, and 1.4 s at Bells Beach, against about a second through the API; a warm cell, whose chunks are in memory, a few tenths of a second. The worker keeps the listed cells warm every three hours, so a page is never rendered on a cold one; a person who opens a cold spot on the map waits those seconds once.
- ECMWF's IFS, which the API ranks first over the world, is not read: its 9 km files are on a Gaussian grid, and its 0.25° ones are three-hourly. `dwd_icon` answers the world instead until the grid is indexed.
- The peak period of the whole sea is ECMWF's where the fine model has no sea, and the fine model's where it has. A buoy's peak period is compared with one or the other, as it was with the API's.
- A wave direction of MFWAM read without the 180° would point the other way. The test of the module fixes it on a saved sample.
- A test asks the bucket nothing: the reader is given to the module, and the tests give one that reads saved samples, as the stores' tests do.
