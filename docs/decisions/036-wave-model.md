# 036. One wave model, read the same way everywhere

Status: accepted by Téo on 2026-10-12, after a comparison of the models with the buoys that he asked for. It amends decision 005, which took the model the provider chose, and decision 023 for the values asked for and the credit. Decision 037 added a finer model where one has its sea, which this one left unbuilt. Decision 038 gave the swell apart from the wind sea, from other stores than this decision's provider.

## Context

Téo saw that the panel of Le Petit Minou did not say what Windguru says for the same hours, the energy least of all. Four things made the gap.

- The provider chose the model, and at most points it chose Météo-France's MFWAM. Its period is a mean one, and no peak period comes with it there. A buoy's peak period, the one a surfer reads, is more than a second higher.
- The energy was the power of the sea times the period, 0.49 H²T². Surf forecasts print the energy of one regular wave, 1.96 H²T²: four times as much.
- The row was called "Swell" and held the whole sea, swell and wind sea together.
- An alert read another pair of values: the model's first swell and its mean period, while the panel showed the whole sea. On 2026-10-12 at noon the panel of Le Petit Minou showed 2.0 m and 9 s, and an alert there was checked against 1.84 m and 8.1 s.

The models the provider serves were compared with buoys twice. A height counts as right within 25 % or 25 cm, a period within 2 s, and the energy within a factor of 1.5. Only the hours when the buoy measured 0.5 m or more are counted, and the period is compared with the buoy's peak period.

Seven models over 45 days, at 29 buoys of the United States, Hawaii and Ireland:

| Read as                                       | Height | Period | Energy |
| --------------------------------------------- | ------ | ------ | ------ |
| ECMWF WAM 9 km, whole sea and peak period     | 94 %   | 84 %   | 69 %   |
| NCEP GFS Wave 25 km                           | 91 %   | 80 %   | 56 %   |
| MFWAM, whole sea and mean period, as it was   | 94 %   | 67 %   | 53 %   |
| DWD GWAM, whole sea and the peak of its swell | 77 %   | 70 %   | 48 %   |

Three of them over 31 days, at 461 moorings of the global in-situ product of Copernicus Marine, every three hours, on the same hours for the three:

| Region, moorings        | ECMWF WAM 9 km | MFWAM as it was | MFWAM with its peak period |
| ----------------------- | -------------- | --------------- | -------------------------- |
| All, 461                | 88 / 87 / 61 % | 84 / 71 / 45 %  | 86 / 85 / 57 %             |
| Northern Europe, 152    | 89 / 92 / 61 % | 86 / 81 / 42 %  | 86 / 90 / 56 %             |
| Atlantic Iberia, 21     | 93 / 88 / 73 % | 85 / 71 / 46 %  | 85 / 85 / 63 %             |
| Mediterranean, 27       | 84 / 97 / 55 % | 81 / 91 / 40 %  | 80 / 93 / 49 %             |
| Southern hemisphere, 44 | 75 / 80 / 49 % | 67 / 42 / 44 %  | 80 / 75 / 53 %             |
| North America, 202      | 90 / 84 / 61 % | 87 / 72 / 47 %  | 88 / 84 / 58 %             |
| Hawaii, 9               | 94 / 82 / 70 % | 85 / 57 / 53 %  | 84 / 80 / 62 %             |

The last column reads MFWAM from Copernicus Marine itself, which gives its peak period. It shows that MFWAM's height is as good as ECMWF's, and that what was wrong was the period read with it.

A forecast issued five days earlier keeps the order: 79 / 77 / 53 % for ECMWF, 82 / 62 / 44 % for MFWAM as it was, at the 29 buoys.

## Decision

- The waves come from the first model of a list that has a sea at the point: ECMWF WAM at 9 km, then ECMWF WAM at 25 km, then Météo-France's MFWAM. `WAVE_MODELS` in `packages/conditions/src/forecasts/open-meteo.ts` is that list, and the only place that names a model.
- A model has a sea at a point when it gives a wave height for one hour at least. A later model is asked only when the one before has none, with a request that is counted like any other.
- Four values are asked of the model, for the whole sea as a buoy measures it: its height, its mean period, the period of its peak, and where it comes from. No swell apart from the wind sea is asked for or kept.
- A forecast is kept with the model that answered, and `GET /v1/forecasts` gives it as `waveModel`: its name, who produces it, and the size of its grid. Decision 037 made it a list, `waveModels`. Its hours gain `wavePeakPeriodSeconds` and lose the swell and the wind sea.
- A panel reads the height of the whole sea, the period of its peak, and its direction. The row is called "Waves". A model without a peak period gives its mean one, and the credits of the panel say so.
- The energy is the one surf forecasts print: ρg²H²T²/16π, 1.96 H²T² in kilojoules, with the height of the whole sea and the period of its peak.
- An alert reads the same three values. Its conditions keep the names they were saved under, `swellHeightMeters`, `swellPeriodSeconds` and `swellDirectionDegrees`: no saved alert is changed.
- Beside a buoy, the model's period is of the kind the buoy gives: the peak one for a buoy that has it, the mean one for a buoy that gives a significant or a mean period.
- The credit is what each party asks for, shown as links beside the data: the provider's own words with a link to it and to the licence, the credit to DWD that its marine API asks of every user, and for ECMWF the words its terms give for a service, with its licence and its disclaimer. A panel and a mail also say that the values were rounded and converted, since the licence asks that changes be told. What covers several points, an alert on several spots or a mail, credits every producer of the list. `docs/data-sources.md` quotes what each asks.

## Rejected

- **DWD's two models, the European one then the global one.** The European one ends 3.8 days ahead and had a sea at 24 % of 640 surf breaks. The global one read too high: its energy was 1.4 times the buoys', and 2.5 times in Hawaii.
- **NCEP GFS Wave.** It answered a height of zero, where the others answer nothing, at 24 % of the surf breaks.
- **The swell the provider gives apart.** Against the swell that American buoys measure apart, the best height was right 69 times in 100, and its period read 3.3 s low: it is a mean period, and the buoy's is a peak one. The energy made of the two was right fewer than one time in two for every model.
- **The height of one model with the period of another.** A first proposal did it. Two models do not cut the sea into the same swells.
- **MFWAM read from Copernicus Marine**, for its peak period and its swells. It came out a little behind ECMWF, every three hours where ECMWF is hourly, and nine days ahead where ECMWF gives fifteen. Its files are grids, read with a library the instance does not have. It stays the way to a swell apart, and to a use that is paid: its licence allows it, and the provider's free API does not.
- **The power of the sea in kW/m.** It is the figure with a physical meaning. No surf forecast prints it, and Téo reads the other.
- **New names for an alert's conditions.** The names say swell and the values are the whole sea. Renaming them changes saved alerts, the API and the mails, and a swell apart may come back: it waits for that decision.

## Consequences

- At Le Petit Minou, over a month, MFWAM as it was served read 1.94 times a model with a grid of 1.5 km, and ECMWF at 9 km reads 1.06 times it. The cell the provider took for MFWAM is outside the narrows.
- Every energy is four times what it was. The colors of `WAVE_ENERGY_SCALE` moved with it, so a sea keeps its color.
- A forecast kept in the shape before names no model and is refused: each cell is fetched again the first time it is asked for after the deployment.
- A point with no sea costs four requests where it cost two, since every model is asked. A point with a sea costs two, as before, at nearly every surf break: of 640, ECMWF at 9 km had a sea at 637.
- An alert set on a period of ten seconds or more now meets the period a surfer reads. It was checked against a mean period, about three seconds lower. An alert saved before the change keeps its numbers and may tell more often.
- The sentence of an alert, its mails and its pushes say "waves" since 2026-10-12, as the panel does: they said "swell" for the whole sea. The conditions keep their saved names.
- The API no longer gives a swell or a wind sea. It may change freely until its first public release: decision 003.
- Near the coast every model is weaker. Within 2 km of the shore ECMWF's height was right 77 times in 100, against 93 beyond 10 km. A model with a grid of 3 or 4 km did no better there. One of 1.5 km did, by ten points, where it exists: `docs/data-sources.md` lists them, and decision 037 reads that one.
- DWD is credited though no value shown is DWD's: the provider's marine page asks it of every user. The credit says who asks, so that it claims nothing of the waves. The first version of this decision left DWD out, and Téo asked the same day that the credit follow what is asked.
- The mean period beside a buoy is not the buoy's own statistic. The model's is the energy period, a buoy's is a zero-crossing or a significant one, and they differ by up to a fifth.
- The comparison is one month and a half of autumn. The southern hemisphere is Australia and Samoa alone. The forecast of five days earlier was compared at 29 buoys, not at 461. Compare again after a winter.
- The third model of the list answered at no real point that was tried: with the nearest sea cell taken, ECMWF at 25 km had a sea wherever MFWAM had one. It is covered by its test alone.
