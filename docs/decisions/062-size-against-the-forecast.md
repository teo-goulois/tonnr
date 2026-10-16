# 062. How big the waves get at a break, against what the forecast says

Status: proposed on 2026-10-16, and built the same day at Téo's word, as proposed. Téo asked for it that day, from two breaks a kilometre apart near Brest, Le Petit Minou and Dalbosc, which read the same forecast, the same cell of the model and the same buoy 25 km out, while Dalbosc is nearly always twice as big. He wants to know it at those two, and ideally at every break. He said yes to the two things below, learning it from the sessions and asking the people who surf the break, and no to a model of the coast for now. The thresholds, the steps of the guide's line and where the sentence stands are proposed here, for him to confirm or change.

## Context

A forecast gives the sea off the coast: the height of the waves at a point of a grid of a few kilometres, out where the model computes. What reaches the sand is another thing. The bottom, which way the beach faces, the points that shelter it, the sandbanks of the month: a break takes its share of the swell and makes its own faces of it, and two breaks a kilometre apart take different shares. The share depends on where the swell comes from and on its period, since a long swell wraps around a point that a short one does not.

The product has two things that speak of this and never meet. A session (decision 043) keeps how big the waves looked, said against a body, `wave_size`, which `SURF_FACES` in `packages/conditions/src/sessions/sizes.ts` reads as a height of face, and what the model said of that hour, which `sessionFigures` reads from the copy kept with the session. The comment of `sizes.ts` already says that what the two have to do with each other "is what the sizes said are kept to learn". And the guide of a break (decision 041) is where the people who surf it write what the catalogue cannot know, in lines of words and short texts, each confirmed before it stands.

Decision 059 judges the size of the hour with the catalogue's size, the faces the break works at (decision 050), against the model's height. The one is a face on the sand and the other a height out at sea: at Dalbosc the verdict says "too small" on a day that is head high.

Production holds three sessions today. Whatever is learned will say nothing for a while, and must be right while it says nothing.

## Decision

### Learned from the sessions

- A break has a **size factor**: how many times the height of the forecast its waves run, read from the sessions surfed there, of every account, and said to anyone as one figure with the number of sessions it comes from. "Here, the waves usually run about 1.8 times the forecast, from 14 sessions." Nothing names an account, and no session is answered: the figure and the count, and nothing else.
- A session counts when it says how big the waves were, `wave_size`, and the model gave a height at its middle, `waveHeightMeters` of `sessionFigures`, of 0.2 m or more. Below that the sea is flat and the ratio says nothing. Its ratio is the face height the size stands for, `drawn` in `SURF_FACES`, over the model's height. The waves, not the sets: the sets are the largest of the day, and the model's height is the significant height, nearer the usual wave. The model's height, not the buoy's: it is what the tiles and the alerts read, and the sentence is read against them.
- A session is at a break when its row names the break, or names a spot of the account's that stands on it. The figure is the **median** of the ratios, to the tenth: one session on a wrong day moves a mean and not a median.
- The factor is said once **5 sessions from 2 accounts** gave a ratio. One account's eye, however often, is one account's guide line, and the guide has one for that. Under the threshold the API answers the count and a null factor, and the web app says nothing.
- The same figure is read **by swell**: the direction in eight sectors of 45 degrees centred on the points of the compass, and the period in three, under 9 s, 9 to 13 s, and 13 s and over. A sector and a period that hold 5 sessions have a factor of their own, from them alone. The panel reads the factor of the hour's swell when there is one, and the break's otherwise, and says which: "With a swell from the west of 13 s, about twice the forecast here, from 6 sessions."
- The rules read no clock and no database: `sizeFactor` in `packages/conditions/src/sessions/size-factor.ts`, with its constants, `FACTOR_SESSIONS`, `FACTOR_ACCOUNTS`, `FACTOR_MODEL_LEAST`, the sectors and the periods, and its tests, after `liked.ts`, which `LIKED_SESSIONS` and `LIKED_FROM` set the precedent for. `factorFor` picks the factor of an hour.
- The API answers it with `breaks.sizeFactor`, `GET /v1/breaks/{id}/size-factor`, built on `callerProcedure` and counted, which a visitor reads as a key does. It reads of the latest 500 sessions at the break what it needs and no more, the size, the times and the hours of the model, and never the readings of the stations. It is not a tool of the MCP server in this change, and not a field of `breaks.get`: a panel asks for it when it opens, the map never does.

### Asked of the people who surf the break

- The guide gains a line of words, **"Size against the forecast"**, `sizeFactors`, in five steps: `half`, `same`, `one_and_a_half`, `double`, `more`, which read as "about half the forecast", "about the forecast", "about one and a half times", "about double", "more than double". It is a list, as every line of words is: two neighbouring steps say "between the forecast and one and a half times". It is written, shown, confirmed and contested as the other lines are, and counts 5 points as they do.
- It gains a short text beside it, **"Why"**, `sizeNotes`, of 3 to 140 characters, for what the sessions cannot say in years: "Takes twice what Le Petit Minou takes on a west swell, much the same on a south-west one." It is a text of the guide as the four others are, in the author's language, confirmed by the operator, under the Database Contents License, counting 10 points. Its reader sees it under the line of words.
- `surf_break` gains the column `size_factors`, by a Drizzle migration, so that the line stands where the other lines of words stand and an operator sets it in the admin as the others. No list gives it: it is null from the catalogue and filled by the guide. A spot of an account's own takes it in its characteristics too, as it takes the others, so that a surfer writes it of their own spot.
- The two lines are said in `GUIDE_WORD_LINES` and `GUIDE_TEXT_LINES`, read by `LINE_WORDS`, named for the admin's moderation and for the guide's tool, whose description counts five texts from now on.

### Where it is read

- In the forecast tab of a break's panel, under the tiles and the nearest buoy, one sentence in grey prose, written as an estimate, in the four languages: what the sessions say when they say something, then what the people who surf the break say when they wrote it, each with where it comes from. "Here, the waves usually run about 1.8 times the forecast, from 14 sessions. Locals say about double." With neither, no sentence: nothing is drawn, no empty line.
- The sentence is a component of its own, `SizeAgainstForecast`, which `BreakPanel` builds and `Details` draws in one slot, so that the panel of decision 061 rebases over it.
- Nothing else changes: the tiles, the charts, the week and the alerts stay in the model's units. The sentence is the one place where the two are set against each other.

### Decision 059, later

The verdict of the sea now compares the catalogue's faces with the model's height. Once a break has a factor, by its sessions or by its guide, the size should be judged on the model's height times that factor, and the sentence of the page should say so: "about head high here". Not in this change: the pages are cached an hour, the factor is new, and the first breaks that have one are the ones to look at before the verdict changes on thousands.

## Rejected for now

- **A model of the coast**, SWAN or the like, run on the bathymetry of each break from the offshore spectrum. It is the right answer in the end and gives the share by direction and period for every break at once, with no sessions. It asks for bathymetry that the open sets give at 100 m at best, a run for each of 9,000 breaks at each forecast, and someone to check it against the sand. The sessions and the guide give the same figure where people surf, which is where it matters, and are what a coastal model would be checked against. To take up once a few breaks have both.
- **Reading the tiles, the charts and the alerts through the factor.** A reader who sets an alert at 1 m means the forecast's 1 m, as every other site reads it; a tile that said 1.8 m while the model says 1 m would be read as a forecast and is an estimate from a few eyes. The sentence says the estimate as one.
- **A factor for each account**, "your eye at this break". It is what `likedConditions` does for the conditions, and it would be right for a surfer of 1.55 m. But a factor of one's own is read from one's own sessions, which the logbook already shows beside the model's height, and the figure wanted here is the break's.
- **Learning from the sets.** A set is the largest wave of the hour, which the model does not give.
- **The buoy's height as the reference.** The buoy measures and the model computes, and the buoy is nearer the truth; but the buoy is 25 km out and absent at most breaks, and the figure is read against the tiles, which are the model's.
- **A mean of the ratios.** One session where the model said 0.3 m and the surfer waist-high gives 3; a median takes it as one vote.
- **Saying the factor without its count**, or with a count under the threshold. "About double" from two sessions is a guess dressed as a fact; the count is what makes the sentence honest, and the threshold is what makes it silent.
- **Asking the question in the session's form**, "bigger than the forecast?". The surfer already says the size, and does not have the forecast in mind when they get out of the water.
- **A field of `breaks.get`.** The map and the search read breaks by the page; the factor reads sessions, and only a panel needs it.
- **A line of the guide with a figure typed in.** Two surfers who saw the same wave give two figures; five steps are what a surfer tells another at the car park.

## Consequences

- A session's size now counts for everyone who opens the break, as a share of one figure. The privacy policy, which says that sessions are one's own and lists what others read of them, gains that case, in the four languages, with its date.
- A session at a break with no size says nothing: the form may ask for the size a little more plainly later.
- The guide's tool, `get_surf_break_guide`, answers a fifth text and a ninth line of words: its description, `docs/mcp.md` and `/llms.txt` say so.
- The migration adds a nullable column and runs as the API starts. The API is deployed before the web app.
- The text "why" is a text of the guide as the four others are: the public page of the break shows it with them, and a break whose only confirmed text is that sentence stands on its own for a search engine, as decision 057 has it. The line of words does not count among the eleven characteristics that decision counts.
- The sentence of the panel is drawn at every density of decision 061: under the sentence of the sea now at the least, under the tiles and the stations otherwise.
- Not built: the sentence on the public page of the break and in its verdict, the factor at a spot of an account's own that stands on a break, a tool of the MCP server, and a figure in feet of face in the tiles.
