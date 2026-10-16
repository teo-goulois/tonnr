# 060. Learning to read a surf forecast, in three guides beside the landing

Status: proposed on 2026-10-16, at Téo's request for a part of the landing that teaches how to read a surf forecast, in three levels, "le plus simple et ludique, avec des vraies démos interactives". He read the first draft of the beginner's guide the same day and asked for three things more: the period as a lesson of its own, a page that leads to the three guides, and, for every technical word, a link that opens a glossary, which says what the word means and where the thing comes from, "pour en apprendre toujours un peu plus"; and that a figure be read in the unit the reader picks beside it, knots or kilometres an hour, metres or feet. Nothing is built. The French texts are his to correct before they are translated: they are his voice.

## Context

The page of a surf break (decision 057) says the sea now in one sentence (decision 059): the waves, their height, their period and where they come from, the wind and how it meets the shore, the tide and its way. It then says which of four things fit the break's own words, the swell's direction, the size, the wind and the tide. Nothing on the page explains any of them. A reader who comes from a search engine with the name of a spot and the word surf is often someone who has surfed a few times and does not yet know why 14 s has nothing to do with 8 s, or what onshore means. They leave with figures they cannot read.

The landing says what the product does and where its figures come from. It does not say how to read them. Surf report sites each have such a guide, in text and pictures, and it brings them readers who search for "how to read a surf forecast" or "période houle surf" before they search for a spot.

The web app already draws every piece of a forecast with components of its own: a direction with `Bearing`, a curve with `SeaChart`, the tide beside what an alert asks of it with `AlertTideChart`, a figure that moves with `MorphText`, the heights, periods and winds in the colors of `sea-scales.ts`, and what a break is like with the rings of `surf-icons.tsx`. The landing's cards (`LandingFeatures`) draw a piece of the app with them, with example figures, and move a little as they come into view.

Thousands of pages of breaks are listed. A link from each of them to a few guides gives the guides what a search engine weighs most, links from many pages of one site, and gives each page a way out for the reader the sentence lost.

## Decision

### Three guides, and a page that leads to them

- Three guides, one for each level, each at an address of its own under `/learn`, beside `/sources` and `/agents`, in each language under its prefix: `/learn/beginner`, `/learn/intermediate`, `/learn/advanced`, and `/fr/learn/beginner`. The paths are in English, as every path of the site is. `/learn` presents the three in a few lines, each with its lessons listed, and the glossary, so that a reader picks their level and a search engine has a page for the general question.
- A guide is one page of five lessons. Each lesson is a section with an id of its own, so that a link may lead to one lesson: `/learn/beginner#period`. A lesson says in a few short paragraphs what the figure is, what it changes in the water and what to look for, shows it in one interactive demo, and ends on one line to remember.
- The reader is addressed as the app addresses them, and the texts say what the app shows: a lesson names the words of the sentence, of the week's table and of a break's guide, so that the reader finds them on the next page.

### The lessons

The beginner's guide is to be read before a first session. Its lessons are the things the sea's sentence writes and judges:

1. `#height`: what the forecast's height is, the swell offshore, and what the face of the wave at the beach has to do with it. What to look for at first.
2. `#period`: the time between two waves, why a 14 s swell has nothing to do with an 8 s one at the same height, and the figures that mean chop, a surfable sea and a real swell.
3. `#swell`: where the swell comes from, written as the app writes a direction, and the window of a spot: a swell outside it passes offshore and leaves the beach flat.
4. `#wind`: offshore, onshore and side-shore, named from the beach and so spot by spot, and how much its strength weighs.
5. `#tide`: how the depth of water over the bottom changes the wave, low, mid and high, rising and falling, and that each spot has its own tide.

The intermediate guide is for a reader who surfs and wants to choose their day:

1. `#swell-and-wind-sea`: the primary swell and the wind sea, which the week's table shows apart (decision 038), and why the total height may lie.
2. `#energy`: height and period together, as one figure, and why 1 m of 14 s moves more water than 2 m of 7 s.
3. `#fetch`: where a swell is born, from the wind that blew over a stretch of ocean, and why a long swell announces itself days ahead.
4. `#week`: reading seven days at once, telling a window from a day that looks good at noon, and the hour the wind usually sleeps.
5. `#neighbours`: why two spots a few kilometres apart do not work the same day: exposure, window, shelter and bottom.

The advanced guide is for a reader who wants to know what the figures are made of:

1. `#models`: the models the instance reads and their resolutions, what a cell of a few kilometres sees and what it misses, and why a forecast changes from one run to the next.
2. `#buoys`: a buoy measures and a model computes, where the two differ and which to trust at what range.
3. `#secondary`: the secondary swells, a sea that holds two swells at once, and what the table says of them.
4. `#shadow`: shadowing and refraction, an island or a headland that takes a swell away, a bay that bends it in.
5. `#alert`: from the sessions one logged to the conditions one likes (decision 043), and an alert made of them (decision 031): the end of the course is the product's own feature.

### The demos

- Each lesson has one demo, built with the components the app draws the same figure with, and invented figures, as the landing's cards are: the reader changes one thing with a slider or by turning a dial, and sees what it changes. Nothing is asked of the API or of a provider: a lesson needs an example that does not move with the sea, and decision 053 counts every forecast question to its caller.
- The first version's demos, one for each lesson of the beginner's guide: a height to slide, with the sea's color and a swimmer or a surfer drawn to its scale as `SurfSizePicture` draws them; a period to slide at equal height, with the waves drawn closer or further apart, their energy as a figure that moves with `MorphText`, and the colors of `WAVE_PERIOD_SCALE`; a swell direction to turn in front of a spot's window, drawn as the guide's ring draws it, which says whether the swell enters; a wind to turn in front of a coast, named offshore, side-shore or onshore by `shoreWind`, with the wave drawn clean or messy; a tide that rises over the profile of a spot, with the curve of `AlertTideChart` and its way written by `TideTrend`. The intermediate and the advanced demos are listed with their lessons once the beginner's are built and Téo has read them.
- The server renders every demo at its starting value: a reader without a script, and a search engine, read the whole lesson. A reader who asked for no motion sees the demos still and changes them all the same, since turning a dial is theirs, not the page's: what moves by itself, a figure that morphs or a wave that rolls, follows `prefers-reduced-motion` as the landing's cards do.
- A demo is a component of the guides, in `apps/web/src/components/learn/`, and a primitive the demos share, such as a dial for a direction, is shown in `/design-system`.

### The glossary

- A fifth page, `/learn/glossary`, holds every technical word the guides use, in the reader's language, each with an id of its own: what the word means in two or three sentences, and where the thing comes from, how a swell is born of the wind, why the tide turns twice a day, what a buoy measures. An entry says the word as the app writes it, so that a reader meets the same word on the page of a break.
- In a lesson, every technical word is a `Term`: a link to its entry, drawn as the sentence underlines a part, which a search engine and a reader without a script follow to the glossary. With a script, a press opens the entry's first sentences in a popover over the lesson, with the way to the entry, so that the reader learns the word without leaving the demo. On a phone the popover is a small sheet at the bottom.
- The first entries, from the beginner's guide: swell, wind sea, period, set, chop, buoy, model, window, sector, offshore, onshore, side-shore, knot, tide, high and low water, rising and falling, spring and neap tides, reef, beach break, point break, take-off. The intermediate and the advanced guides add theirs: fetch, energy, resolution, run, secondary swell, shadowing, refraction, exposure.
- The words of a break's page may become `Term`s later, once the glossary is read: this decision keeps them to the guides and the landing's part.

### Units

- A demo that writes a wind speed or a height writes it as everywhere, through `formatWind` and `formatHeight`, and has beside its figure the choice of its unit: the same segmented control as a row of `UnitsSettings`, knots, kilometres an hour, metres a second or miles an hour, metres or feet. The choice goes through `useSaveUnits`: the browser keeps it, and the account too when one is signed in, so that the app opens in it (decision 033). A reader who picks feet in a lesson reads feet on the map.
- The lessons' prose names figures in the reader's unit too, where a threshold is given, "under 10 knots", through the same functions: a message holds the sentence with its figure as a parameter.

### Where the guides are linked from

- The sentence of a break's page (decision 059): each underlined part leads to the lesson that explains it, the height to `#height`, the period to `#period`, the waves' direction to `#swell`, the wind's speed, direction and name to `#wind`, the tide to `#tide`, and the names in "What fits this spot" the same way. The links are plain anchors in the reader's language, as the pages link one another, since a page is served from the Worker's cache. A line under the week's table leads to the beginner's guide for whoever reads a table for the first time.
- Each guide ends on the way to the spots, `/spots`, and to the map, and the advanced guide on the log of sessions and an alert. Each lesson that names a thing the app shows links to it where a page shows it.
- The landing gains a part, `LandingLearn`, after what the product does and before who makes it: the three levels as cards, each with its lessons' names, and a sentence that says what the guides are for. The header's links and the footer's "Product" column gain the guides, and the command palette the five pages.
- `/llms.txt` names the guides: a program that reads the site is told how the figures are read.

### Head, sitemap and pictures

- The five pages are in `PUBLIC_PAGES`, so that the sitemap of decision 021 names them in each language and the Worker sends no `noindex`. Each route gives `pageMeta` and `pageLinks` to its head: a title written for a search, "How to read a surf forecast: height, period, swell, wind and tide", with the product's name after it, and a description of a sentence. A guide's head carries an `Article` and a `BreadcrumbList` in JSON-LD, as a break's page carries its `Place`.
- The pages are sent with the landing's shared picture. A picture of their own, taken by `landing-shots.mjs` from a development route, is for a later change, once the guides have readers.
- The Worker keeps a guide an hour in Cloudflare's cache, as it keeps a hub, since nothing on it is anyone's and it is rendered the same for everyone.

### The texts

- Every string is a message in `apps/web/messages/`, one for each paragraph, in the four languages, as `/sources` and `/agents` do. The French is written first, by Téo or corrected by him, and the three others are translated from it.
- The guides say nothing the product does not show. A figure the table gains or loses, a word the catalogue gains, a way the sentence changes, changes its lesson in every language in the same change: the landing bullet of `AGENTS.md` says so.

### Docs in the same change

`AGENTS.md`, the landing bullet; `docs/decisions/README.md`; a note in `changes/`; `/llms.txt`; `/design-system` for the primitives the demos share, `Term` and the unit picker among them; the lines of decisions 033 and 059 that this one amends, the units chosen on a public page and the sentence's parts leading to the lessons.

## Rejected

- **One long page for the three levels.** Three addresses answer three searches, a beginner is not made to scroll past the models, and the sentence can lead to the beginner's lesson alone.
- **A page for each lesson**, fifteen pages. Each would say a few paragraphs, which a search engine treats as thin, and a reader of one lesson wants the next under it. The lessons have anchors instead; a page for one may come if Search Console shows the demand.
- **Texts kept outside the messages**, in Markdown files or a content service. The texts are the product's words, change with it, and are checked by the test that holds the four languages together.
- **Texts written by a model**, from the data or from nothing. The guides are Téo's voice, and a search engine treats generated text as thin, as decision 057 says.
- **Pictures or videos from elsewhere.** Each has a licence, and none draws the figure as the app draws it. The demos use the app's own components, so that the reader recognises on a page what they learnt.
- **Real figures in the demos**, from the forecast kept for a break. A lesson needs an example that shows what it says whatever the sea does, and a demo that asks the API is counted to its caller (decision 053).
- **A quiz with a score kept in the account.** Nothing of the guides is kept: a first version has no account in it, and a lesson that ends on a question does what a quiz would.
- **A link only in the footer.** The sentence is where a reader meets the figures; the guide is for that moment.
- **A definition in a tooltip alone**, with no page behind it. A search engine reads no tooltip, and a reader who wants the whole entry would have nowhere to go. The popover shows the entry's start, and the page holds it.
- **A unit picker of the guides' own**, kept apart from the account's. Two choices would disagree, and the reader who picked feet on a lesson would find metres on the map.

## Consequences

- About two hundred messages in each of four languages, the glossary's among them, which the instance's size takes without notice, and three pages that say how the product reads the sea: a change to the week's table or the sentence is a change to a lesson.
- The header of the landing gains a sixth link on a wide screen.
- The breaks' pages gain links out, towards three pages of the same site: a reader who leaves the sentence for a lesson comes back by the guide's way to the spots.
- The demos are the first interactive parts of a public page: a page of a break stays as it is, and a guide is drawn by the server with its demos at rest.
- The translations in English, Spanish and Portuguese are made from Téo's French and read by nobody who speaks them until a reader writes to him.
