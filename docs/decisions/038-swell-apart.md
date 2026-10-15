# 038. The swell apart, in the week's table and in an alert's advanced part

Status: asked for by Téo on 2026-10-12, who wanted an advanced part of an alert "where one can really speak of the difference between the swell and the height of the waves". He chose what it asks, the swell's height and where it comes from, and asked for a row in the panel too. It amends decision 036, which gave no swell apart, and adds to decisions 031 and 037. The same day he asked for the two things first left out: the mails and the pushes of an alert that asks about the swell say it, and the whole sea's conditions took their own names, with a migration.

## Context

Since decision 036 a panel and an alert read the whole sea: the swell that comes from far away and the sea the wind raises on the spot, together, as a buoy measures them. A sea of 1.5 m with a peak of 12 s may be a swell of 1.0 m under 1.1 m of chop.

American buoys measure the two apart. Over 45 days at 21 of them, 20,699 hours with 0.5 m or more, a height counting as right within 25 % or 25 cm:

- The swell was under 70 % of the whole sea in 49 hours of 100.
- In those hours, taking the whole sea for the swell was right 2 times in 100, and 0.98 m too high on average. The swell MFWAM gives apart was right 47 times in 100, and 0.28 m too high.
- Over all the hours, MFWAM's swell was right 65 times in 100, and NCEP's 55.
- The wind sea was right 39 times in 100 for MFWAM, 0.45 m too low, and 68 for NCEP where it has one.
- The whole sea was right 95 times in 100 for MFWAM and 94 for ECMWF.
- The ratio of ECMWF's mean period to its peak period says nothing of the share of swell: the two are not correlated.

So the swell a model gives apart is much less sure than its whole sea, and much nearer the swell than the whole sea is when the two differ. Decision 036 found the swell's direction within 30° of a buoy's 70 times in 100, against 80 for the whole sea, and its period, a mean one, 3.3 s under a buoy's.

ECMWF's model gives no swell apart through Open-Meteo. Copernicus Marine's stores do: the fine model of decision 037, and MFWAM over the world.

## Decision

- A forecast gives the first swell apart from the wind sea, hour by hour: its height and where it comes from. `GET /v1/forecasts` gives them as `primarySwellHeightMeters` and `primarySwellDirectionDegrees`, with `swellModels`, the models they come from, listed as `waveModels` is.
- For the hours whose waves are the fine model's, the swell is the fine model's own (`VHM0_SW1`, `VMDR_SW1`), and empty where it gives none: the other model does not fill in. Every other hour takes the swell of MFWAM, read from Copernicus Marine's store of the world, at the nearest cell with a sea within 14 km.
- That store has a field every three hours. Between two fields the height goes from one to the next, and the direction is that of the nearer field, since bearings do not average.
- Where the swell comes from another model than the waves, it is never given above the whole sea of its hour: a part is not more than the whole.
- No period is given for the swell, and no wind sea.
- The week's table of a panel has a row "Swell" under the rows of the waves, with its direction, at a point where a model gives one. The credits name the swell's models and say that it is less sure than the waves.
- An alert may ask two things of the swell apart: its height (`primarySwellHeightMeters`) and where it comes from (`primarySwellDirectionDegrees`). They are in an advanced part of the editor, closed until it is used, which says what the swell is beside the waves, and what the two are at the spot now.
- A condition on the swell is not met at an hour where no model gives one, as for any value nobody could give.
- The whole sea is named for what it is. An alert's conditions, the hours a window keeps and what a notification says of the sea name it `waveHeightMeters`, `wavePeakPeriodSeconds` and `waveDirectionDegrees`. A migration renamed them wherever they were saved as `swellHeightMeters`, `swellPeriodSeconds` and `swellDirectionDegrees`, and changed no value.
- The swell apart is `primarySwellHeightMeters` and `primarySwellDirectionDegrees` everywhere, in a forecast as in an alert. Nothing bears the three old names any more: a page loaded before the change that sends one is refused, where it could have been read as something else.
- An alert's period is the one of the peak, with no other in its place: where a model gives no peak period, a condition on the period is not met.
- A window keeps the swell apart with its hours for an alert that asks about it, and for no other. What is told of such an alert, in the list, a mail or a push, says it after the waves: "waves 1.8 m, 11 s ; swell alone 1.2 m".
- `packages/conditions/src/forecasts/copernicus-waves.ts` reads both stores with one reader, under the rules of decision 037: nothing it fails at fails a forecast, what comes from outside is bounded, and a store's pieces are kept in memory, 16 MB at most.

## Rejected

- **A condition on the wind sea.** It is the least sure figure the models give, and too low by nearly half a metre. The wind's own conditions say most of it.
- **The swell's period.** The models give a mean one, which reads three seconds under what a buoy calls the swell's period. An alert's period is the one of the whole sea's peak, which is the swell's whenever the swell carries the most energy.
- **A share of swell worked out from the whole sea's two periods.** It would need no second model, and it says nothing.
- **MFWAM's swell asked of Open-Meteo.** It is the same model, and one request more for each cell out of the budget of decision 023.
- **The old name for the swell apart.** `swellHeightMeters` was the whole sea in every alert saved until this decision. Giving it to the swell would let a page loaded before the change save one for the other without a word.
- **The swell in every mail.** A second height in a mail that never asked for it reads as a contradiction. It is said for an alert that asks about it.

## Consequences

- Every forecast that is not kept now reads the store of the world too: about 1 MB from Copernicus's bucket, in two to four requests. A forecast outside the fine model's box took 0.2 s with it.
- Each store keeps up to 48 pieces, about 20 MB, so the API and the worker each hold up to 40 MB more: decision 053 counts them by their number.
- The swell steps where the fine model hands over to MFWAM, as the waves do: two models do not cut the sea into the same swells.
- The fine model's swell was compared with no buoy. No mooring of the product measures the swell apart on its coasts.
- An alert that asks about the swell where no model gives one never tells. The editor says so.
- A page loaded before the deployment cannot save an alert until it is loaded again: the API refuses the old names.
- The worker is deployed before the API. Its start applies the migration, and it then reads what it expects. A worker of the version before reading renamed conditions would find none on the waves, and tell an alert at every hour. In the minutes between the two, the API of the version before cannot read an alert.
- A window found before the deployment kept no swell: what is told of it says none until the next look, three hours later at most.
- The cap hides how far two models disagree: at Hossegor on 2026-10-12, MFWAM's swell was 1.20 m in a whole sea ECMWF gave as 1.16 m.
- A forecast kept in the shape before lists no models for the swell and is refused: each cell is fetched again the first time it is asked for after the deployment.
- Checked against the real stores on 2026-10-12. At Le Petit Minou the swell was the fine model's to its last hour and MFWAM's after, 0.998 m in waves of 1.086 m at noon. At 45° N 10° W, the reader gave MFWAM's swell as 2.44 m from 278.75°, the values Python's Zarr library reads there.
