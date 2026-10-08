# Data sources

Where Tonn's data comes from and what each provider allows. Checked on 2026-10-08 unless a row says otherwise. Update a row when you integrate or re-check its provider.

Fetch from these upstream providers. La Bouée's own API is proprietary and is not a source.

## Buoy measurements

| Provider               | Region                  | Access                                                                                                                                                                                                                   | Terms                                                                                                                                                   | Status                                                                                                         |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| NOAA NDBC              | United States, global   | `ndbc.noaa.gov/data/latest_obs/latest_obs.txt` gives every station's latest observation in one file. Names and owners come from `/activestations.xml`. A station's recent history is at `/data/realtime2/<station>.txt`. | NOAA's own stations are public domain (`weather.gov/disclaimer`). Stations relayed for partners follow each owner's terms, which have not been checked. | Integrated, polled every 10 minutes. 225 stations reported waves on 2026-10-08, 186 of them owned by partners. |
| CANDHIS (Cerema)       | France                  | No API. `cartes.php` lists the campaigns with their position and a real-time flag. Each `campagne.php` page embeds two days of readings in JavaScript variables. `robots.txt` allows both pages.                         | Licence Ouverte Etalab. Credit Cerema and the partner bodies of each campaign, listed in `candhis.cerema.fr/doc/01_UtilisationFR.pdf`.                  | Integrated, polled every 30 minutes. 27 real-time campaigns on 2026-10-08. Real-time values are unvalidated.   |
| Météo-France           | France                  | API portal with a free account, and yearly buoy archives on data.gouv.fr.                                                                                                                                                | Licence Ouverte.                                                                                                                                        | Whether the API serves wave data is unconfirmed.                                                               |
| Puertos del Estado     | Spain                   | THREDDS and OPeNDAP at `opendap.puertos.es`.                                                                                                                                                                             | Asks for attribution. License text not read.                                                                                                            | Server answered 200.                                                                                           |
| Cefas WaveNet          | United Kingdom, Ireland | Data portal with CSV and WFS for the last 48 hours.                                                                                                                                                                      | Set per station: Open Government Licence, or non-commercial government and academic use only, or no download.                                           | Use the Open Government Licence stations only.                                                                 |
| ISPRA Rete Ondametrica | Italy                   | `mareografico.it`                                                                                                                                                                                                        | Not checked.                                                                                                                                            | To audit.                                                                                                      |
| Instituto Hidrográfico | Portugal                | Not checked.                                                                                                                                                                                                             | Not checked.                                                                                                                                            | To audit.                                                                                                      |
| Queensland Government  | Australia               | `data.qld.gov.au`. It returned an empty 202 to a plain request.                                                                                                                                                          | Not checked.                                                                                                                                            | To audit.                                                                                                      |
| SHOA                   | Chile                   | Not checked.                                                                                                                                                                                                             | Not checked.                                                                                                                                            | To audit.                                                                                                      |
| Vegagerðin             | Iceland                 | Not checked.                                                                                                                                                                                                             | Not checked.                                                                                                                                            | To audit.                                                                                                      |
| Sofar Ocean            | Global                  | Token API.                                                                                                                                                                                                               | Its agreements forbid resale and republication.                                                                                                         | Excluded.                                                                                                      |

EMODnet Physics aggregates European networks. Its ERDDAP server at `data-erddap.emodnet-physics.eu` publishes near-real-time wave height, period, and direction collections as CSV and JSON. The license is CC-BY or CC-BY-SA depending on the dataset. It could replace several per-provider fetchers. Its freshness has not been measured.

## Wind stations

Decision 007 records the model.

| Provider                        | Region                | Access                                                                                                                                                                                  | Terms                                                                                                                                                                                  | Status                                                                     |
| ------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| NOAA NDBC                       | United States, global | The same `latest_obs.txt` as the buoys.                                                                                                                                                 | As for the buoys.                                                                                                                                                                      | Integrated. 674 stations reported wind on 2026-10-08.                      |
| OpenWindMap (formerly Pioupiou) | Mostly France         | `api.pioupiou.fr/v1/live-with-meta/all` returns every station in one request, with speeds in km/h averaged over four minutes. No more than one request a minute.                        | Community License: free, commercial use allowed, credit "Wind data (c) contributors of the OpenWindMap wind network" with a link. The other sensors combined with it must be open too. | Integrated, polled every 10 minutes. 674 stations were live on 2026-10-08. |
| Météo-France                    | France                | `public-api.meteofrance.fr/public/DPPaquetObs`, one request for all stations every 6 minutes, with a key from `portail-api.meteofrance.fr`. Wind is `ff`, direction `dd`, gust `fxi10`. | Licence Ouverte.                                                                                                                                                                       | Not integrated. Waits for a key.                                           |
| Airports (METAR)                | Global                | `aviationweather.gov/data/cache/metars.cache.csv.gz`, every current observation in one file, wind in knots.                                                                             | United States government data.                                                                                                                                                         | Not integrated. About 5,000 stations, so it needs a coastal filter.        |

## Normalizing measurements

- Store the license and the attribution text on every station, and return them in API responses. Etalab and the Open Government Licence require the credit, and a later commercial use would exclude some stations.
- Keep wave periods in separate fields. Providers publish different ones: CANDHIS gives the significant period (TH1/3), NDBC gives the dominant period (DPD) and the average period (APD).
- Mark real-time readings as unvalidated when the provider says so.

## Forecasts

Integrated through `GET /v1/forecasts`. Decision 005 records the choice.

Open-Meteo's marine API serves wave and swell forecasts as JSON from several models, down to 5 km resolution over Europe. Its weather API serves the wind. The free tier is for non-commercial use, which its terms define as private or non-profit sites and apps without subscriptions or advertising. It allows 10,000 calls a day, 5,000 an hour, and 600 a minute, and requires attribution under CC BY 4.0. Its documentation says accuracy near the coast is limited.

## Tides

Tonn computes tides from open harmonic constants. Decision 002 records that choice and the plan to ask SHOM for a contract after release.

### Computed tides

The `neaps` npm package computes tide heights from harmonic constituents. Its station database (`@neaps/tide-database`, MIT code) ships constants from NOAA and TICON-4, and each station record carries its own license.

The database holds 148 French stations, all from TICON-4. 119 are labelled `cc-by-4.0` and 29 are `cc-by-nc-4.0`, among them La Rochelle, Toulon, and Bayonne Pont Blanc. Keep the license per station, as for buoys. The labels have not been checked against the TICON-4 record on SEANOE.

A first comparison for 2026-10-08, against the SHOM predictions shown on maree.info:

| Port     | Time difference | Height difference                                          |
| -------- | --------------- | ---------------------------------------------------------- |
| Brest    | 0 to 5 minutes  | 0.33 to 0.44 m lower. The tidal range matches within 9 cm. |
| Arcachon | 3 to 10 minutes | Within 7 cm                                                |

Two ports on one day is a first signal, not a validation. Before shipping, compare more ports across spring and neap tides. The tide coefficient is a SHOM figure that Neaps does not return.

The Brest gap is consistent with a datum difference. The database measures heights from the lowest astronomical tide it computes, which it places 0.42 m above the station zero at Brest. Adding that value brings the four heights within 9 cm of SHOM. SHOM publishes each port's reference levels as open data in its "Références Altimétriques Maritimes" (Licence Ouverte 2.0), which is the source to use for this correction.

### Other open building blocks

- For a spot far from any tide gauge, a global tide atlas gives constituents at any point. EOT20 is CC BY 4.0 on a 0.125° grid. FES2022 is finer, at 1/30°. AVISO says its height products may be used for any purpose, but the redistribution clause of its license has not been read. PyFES and pyTMD extract constituents from these atlases. Both are Python, so this would be a one-off extraction per spot, with prediction staying in TypeScript.
- To get constants for a port that TICON-4 lacks, run a harmonic analysis on SHOM's REFMAR tide-gauge observations, which are under Licence Ouverte 2.0.
- The maintainers of the Neaps database reached the same conclusion for France in their issue 148: SHOM is licensed, and TICON is the free alternative, pending a coverage and quality audit.

### maree.info

maree.info is not a source. It republishes SHOM predictions under its own SHOM license. Its terms forbid reproduction without permission and say "Le site web n'est pas une API pour en extraire les données de manière automatique." It offers no API or data service.

### SHOM

La Bouée uses SHOM, according to Téo. SHOM predictions are the official ones for French ports, and they need an exploitation license (`diffusion.shom.fr`, 2026 license directory, page 11):

- A free digital service pays 100 € per port, per distribution channel, for 12 months. A website and a store app are two channels.
- The predictions come from the SPM API with a subscription key bought from the SHOM shop.
- Every reuse carries the notice "Reproduction des prédictions de marées du Shom pour le(s) port(s) - non vérifiée par le Shom et réalisée sous la seule responsabilité de l'éditeur".

SHOM sea-level observations are open data.

### Open-Meteo

Open-Meteo returns a modelled sea level. Its documentation says that value is unreliable near the coast.
