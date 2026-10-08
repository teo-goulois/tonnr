# 010. Copernicus Marine as a source of buoys

Status: proposed to Téo on 2026-10-08, who asked for it and holds the account. The adapter ran once against the real files. Decision 004 gives the model every provider follows.

## Context

Each country's wave buoys have their own owner, format, and terms. The Copernicus Marine Service gathers the measurements of Europe's national networks and gives them out under one licence, which allows any use. Its product `INSITU_IBI_PHYBGCWAV_DISCRETE_MYNRT_013_033` covers the seas from Ireland to the Canaries, and in practice the North Sea too. Its files are readable without an account.

## Decision

- The provider `copernicus` reads the "latest" dataset of that product once an hour. It finds the dataset in the product's record at each run, since the dataset's name carries a version.
- The dataset's record says where the files are and how each variable is cut in time. A file is a SQLite database that holds one variable for every platform over a few days. The worker reads it in memory with the SQLite that comes with Node, so no library is added.
- Only moorings are read, and only what describes the waves and the sea: height, maximum height, peak and mean periods, direction and spread at the peak, sea temperature. The wind is left out: it comes at other moments than the waves, so a mooring's latest reading would often hold no wave height.
- A buoy that Tonn already reads from its owner or through another provider is left out, by its institution or by its code. The list is in the adapter. Add to it when a new provider brings buoys that Copernicus also has.
- A station is named by the code the product gives it, such as `6200024` or `Bilbao-coast-buoy`.
- A station carries its institution and the credit the licence asks for: "Generated using E.U. Copernicus Marine Service Information" and the product's DOI. Commercial use is allowed.
- No reading is marked validated: these are near-real-time values with an automatic check.

## Consequences

- The licence asks that the credit be clearly visible on the home page or on the page that gives access to the data. The interface must show it before a public release. A station's attribution in an API answer is not enough for the web app.
- Section 2.6 of the licence asks the licensee and its customers to keep records that document and trace the use of the products, to show them on reasonable notice, and to pass that requirement on in every licence that descends from it. Tonn's API has no terms yet. They must carry this before the API is opened to others.
- The licence is an agreement with a registered user. Téo is that user. The worker does not use his login.
- A run downloads about 4 MB in a dozen requests. A file that is missing because its stretch of time has no measurement yet is skipped. A run with no file of wave heights fails.
- The layout of the files is described by the dataset's record, not by a documented API. A change in it is a `FormatError`, and the adapter must then be read again against the record.
- The Portuguese buoys of Leixões and Sines are in this product too, under this licence. They are read from the Instituto Hidrográfico, whose licence is non-commercial. If Tonn gets paid parts, read them from Copernicus instead.
- Not read: the product's other variables, the buoys that report a wave height only as H1/3, and the products of the other seas.
