# 010. Copernicus Marine as a source of buoys

Status: proposed to Téo on 2026-10-08, who asked for it and holds the account. The adapter ran once against the real files. Decision 004 gives the model every provider follows.

## Context

Each country's wave buoys have their own owner, format, and terms. The Copernicus Marine Service gathers the measurements of Europe's national networks and gives them out under one licence, which allows any use. Its product `INSITU_IBI_PHYBGCWAV_DISCRETE_MYNRT_013_033` covers the seas from Ireland to the Canaries, and in practice the North Sea too. Its files are readable without an account.

## Decision

- The provider `copernicus` reads the "latest" dataset of that product once an hour, over the last three days. Most measurements show up within one or two hours. The product says they are distributed within 24 to 48 hours on average, and a day is added so that the next hourly run still reads one that arrives that late. It finds the dataset in the product's record at each run, since the dataset's name carries a version.
- The dataset's record says where the files are and how each variable is cut in time. A file is a SQLite database that holds one variable for every platform over a few days. The worker reads it in memory with the SQLite that comes with Node, so no library is added. A file may say that others continue it, and those are read too.
- Only moorings are read, and only what describes the waves and the sea: height, maximum height, peak and mean periods, direction and spread at the peak, and the sea temperature measured within five metres of the surface. The wind is left out: it comes at other moments than the waves, so a mooring's latest reading would often hold no wave height.
- A buoy whose waves Tonn already reads from its owner or through another provider is left out, by its institution or by its code. The list is in the adapter. Add to it when a new provider brings buoys that Copernicus also has.
- A station is named by the code the product gives it, such as `6200024` or `Bilbao-coast-buoy`.
- A station carries its institution and the credit the licence asks for a product that was changed: "Generated using E.U. Copernicus Marine Service Information" and the product's DOI. Commercial use is allowed.
- No reading is marked validated: these are near-real-time values with an automatic check. A value keeps its place when its flag says no check, good, or probably good.
- What comes from outside is bounded. A download stops at 32 MB. A window takes at most four files of a variable, each continued by at most four others. A file may give 200,000 rows of the window and a run 600,000, counted file by file as they are read. A file is refused when it holds anything but the two plain tables the store writes: an index, a view, a trigger, another table, or a column with an expression would make reading it run what the file says. It is then checked for damage.
- A moment of a mooring is rejected when its rows disagree: two different rows of one variable at one depth, or two variables that place the mooring at two spots. A mooring is placed where its latest kept reading puts it.

## Consequences

- The licence asks that the credit be clearly visible on the home page or on the page that gives access to the data. The station panel of the temporary web app shows each station's attribution. Before a public release, check that the credit and the DOI are plain to see there.
- Section 2.6 of the licence asks the licensee and its customers to keep records that document and trace the use of the products, to show them on reasonable notice, and to pass that requirement on in every licence that descends from it. Keeping records applies already: the worker's logs and each station's stored attribution are what there is, and how long they are kept is not decided. Tonn's API has no terms yet. They must carry this requirement before the API is opened to others.
- The licence is an agreement with a registered user. Téo is that user. The worker does not use his login, and the licence does not ask that each download be logged in.
- A run downloads about 4 MB in a dozen requests. The store answers 403 for a file that does not exist, as it would for a file it refuses. A file that is missing because its stretch of time has no measurement yet is skipped, and a run with no file of wave heights fails. A refusal that hit one variable alone would not be told from a missing file.
- A "mooring" is any fixed platform: buoys, but also measuring poles, oil platforms, and some harbour or estuary sites, mostly Dutch. Nothing tells them apart yet, so they all show as stations.
- The layout of the files is described by the dataset's record, not by a documented API. The adapter checks how the files are cut in time, that the first band of depth still holds the first five metres, and that there is no horizontal cut. A change that breaks one of these is a `FormatError`, and the adapter must then be read again against the record and against the reader Copernicus publishes (`arcosparse`).
- The files are read in the worker's own thread. The limits above bound that work by the size of a file, and a 30 MB file took a fifth of a second in a test, but nothing stops the reading once it has started.
- A file may be continued by others, which its notes count. Like the reader Copernicus publishes, the adapter fetches what the first file counts and does not follow the count of a continuation, whose notes must still be well formed. No file with a continuation was seen.
- The Portuguese buoys of Leixões and Sines are in this product too, under this licence. They are read from the Instituto Hidrográfico, whose licence is non-commercial. If Tonn gets paid parts, read them from Copernicus instead.
- The Met Office's buoys that NDBC relays with their wind only are read here for their waves, so such a buoy is two stations: one of NDBC for the wind, one of Copernicus for the waves.
- Not read: the product's other variables, the buoys that report a wave height only as H1/3, the sea temperature measured deeper than five metres, and the products of the other seas.
