# 037. A finer wave model where one has its sea

Status: accepted by Téo on 2026-10-12, who was shown what a finer model gained against the buoys and said to add it. It builds what decision 036 left unbuilt, and amends decisions 005 and 023: a forecast's waves may come from a second provider, read as a grid, and a forecast's cell is finer where that provider has its sea. Not built: Météo-France's coastal model, which did no better on the two weeks it could be compared, and whose runs are being kept for a month to judge it.

## Context

Decision 036 chose ECMWF's wave model on a 9 km grid, and found every model weaker near the coast: within 2 km of the shore its height was right 77 times in 100, against 93 beyond 10 km. A surf break is on the shore.

Three finer models of Copernicus Marine were compared with ECMWF's over 31 days, each on the same moorings and the same hours. A height counts as right within 25 % or 25 cm.

| Model, grid                      | Within 2 km of the shore       | 2 to 10 km        | Beyond 10 km      |
| -------------------------------- | ------------------------------ | ----------------- | ----------------- |
| North-west shelf, 1.5 km         | 86 % against 76 %, 22 moorings | 84 % against 83 % | 93 % against 95 % |
| Iberia, Biscay and Ireland, 3 km | 84 % against 80 %, 31 moorings | 84 % against 84 % | 92 % against 94 % |
| Mediterranean, 4 km              | 82 % against 84 %, 9 moorings  | 92 % against 93 % | 92 % against 94 % |

Only the grid of 1.5 km does better, and only near the shore. It is the Met Office's WaveWatch III over the north-west European shelf: from 46° to 62.74° N and from 16° W to 13° E, which is the French coast north of La Rochelle, the Channel, Ireland, Great Britain and the North Sea. It gives a field an hour, about six days ahead, and is renewed once a day at noon UTC.

At Le Petit Minou, in the narrows of Brest, the model the provider served before decision 036 read 1.94 times this one over a month. ECMWF at 9 km reads 1.06 times it.

Decision 005 took a provider that answers point by point because "decoding their gridded output needs tools that TypeScript lacks". This store is Zarr: a grid cut in pieces of sixteen cells by sixteen and five months, each a file of 0.2 MB packed with Blosc and LZ4. Reading one value out of a piece takes a hundred and fifty lines.

## Decision

- Inside the fine model's box, the waves of a forecast are its own for every hour it has. The models of decision 036 answer the hours after its last, and every hour where it has no sea within 4 km of the point.
- `packages/conditions/src/forecasts/copernicus-waves.ts` is the only module that knows the store, `blosc.ts` unpacks a piece, and `cell-forecast.ts` lays the fine model's hours over what Open-Meteo answered. `FINE_WAVE_MODEL` in `wave-models.ts` names the model, its box and its credit.
- The dataset is looked up in the product's record, since its name carries a version. Its own record says where the store is and how it is cut, and the store's description how a number is read. Both are kept an hour. Anything that is not as expected, a number stored another way, another packing, a piece of another size, is a format error, and the forecast goes without the fine model.
- Four values are read, for the whole sea as in decision 036: its height (`VHM0`), the period of its peak (`VTPK`), its energy period (`VTM10`), which is the mean period the other models give, and where it comes from (`VMDR`).
- The model is read at its nearest cell that has a sea, within 4 km of the centre of the forecast's cell. A spot stands on the shore, where the grid's own nearest cell is often land.
- A forecast's cell is 0.0125° wide inside the box, where it is 0.05° wide elsewhere, so that the model is read where the spot stands and not 3 km away. Both widths are counted in steps of 0.0125°: a cell of either has one name.
- A forecast is kept with the list of its models, each with the first hour it answers. `GET /v1/forecasts` gives it as `waveModels`, in place of `waveModel`, and the credits of a panel say when one model takes over from the other.
- Reading the fine model never fails a forecast. It is given ten seconds. A failure is logged, and the forecast has the other models alone.
- The pieces fetched are kept in the program's memory for half an hour, packed as they came, 96 at most: nearby points are in the same pieces. The requests are not counted against the budget of decision 023, which is Open-Meteo's.
- What comes from outside is bounded: a piece may weigh 4 MB packed and 8 MB unpacked, and a piece that says more is refused before anything is set aside for it.
- The credit is "Wave forecast from the Met Office, generated using E.U. Copernicus Marine Service Information", with the product's DOI, beside the credits of decision 036.
- No library is added. Decision 010 reads the same provider's other files with what Node has, and the store writes one packing only.

## Rejected

- **A Zarr library.** `zarrita` read the store in a second, with the packer it brings as WebAssembly: six packages for one format the store writes one way. If Copernicus changes its packing, the forecast falls back on the other models and this choice is to make again.
- **The models of 3 km and 4 km.** They did no better than ECMWF's near the shore, and the first read the heights about 6 % low.
- **Météo-France's coastal WaveWatch III**, on a mesh of 110 m to 700 m along the French coasts. It is the finest, and the only one found that gives a peak period for each swell. A run is one file of 200 MB, three days ahead, and a run is published fourteen days. On those fourteen days, at 62 moorings from Biscay to the southern North Sea, its height was right 79 times in 100, against 82 for ECMWF at 9 km and 87 for the 1.5 km model on the same hours. Within 2 km of the shore, at 16 moorings, it was 65 against 66 and 85. Two weeks are too few to close it: its runs are kept at the moorings' places until 2026-11-12, outside this repository, to compare a month.
- **Reading the fine model at the centre of a 0.05° cell.** The centre is up to 3.5 km from the spot, on the other side of a headland as easily as not.
- **A cell named after the fine model's own.** It would tie what a forecast is kept by to one provider's grid.
- **Blending the two models around the hour one takes over.** It would show a sea neither model computed.

## Consequences

- The waves may step at the hour ECMWF takes over, about six days ahead: at a sheltered spot the two models do not agree. The credits say the hour. Nothing marks it on the curve or in the week's table.
- Inside the box, two spots 2 km apart no longer share a forecast. Each costs its two requests to Open-Meteo, so the same people spend the budget of decision 023 sooner there. The budget is unchanged.
- A forecast kept in the shape before lists no models and is refused: each cell is fetched again the first time it is asked for after the deployment.
- A forecast that is not kept downloads about 1 MB from Copernicus's bucket, in four to eight requests. It took 1.5 s for the first point and 0.07 s for the next one nearby.
- Copernicus states no limit on requests, and these are not counted: the instance's page does not show them. The memory is what keeps them few.
- Section 2.6 of the licence, on keeping records, applies as decisions 010 and 018 say. The API's terms must carry it for this model too.
- A failure shows only as a warning in the log, and as ECMWF named alone in a panel's credits. Nothing on the instance's page says that the fine model stopped answering.
- The layout is read from the dataset's record, as decision 010 reads another: it is not a documented API. A change there is a format error, and the module must then be read again against the record.
- The store answers 403 for a piece it does not have, which is read as land. A refusal of one piece would read the same.
- The gain was measured on a month, at moorings, on the hours the model had last computed. How it does five days ahead was not measured.
- The store also holds a first swell, a second swell and the wind sea. Decision 038 reads the first swell.
- Checked against the real store on 2026-10-12: at Le Petit Minou the forecast took the fine model to 2026-10-18 23:00 UTC and ECMWF from the next hour, and gave 1.086 m with a peak of 11.22 s at noon, the same four values as Python's Zarr library reads in that cell at that hour. No test calls the store: they read one made of a few values.
