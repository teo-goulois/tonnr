# 059. The sea now, in a sentence, on the page of a surf break

Status: decided by Téo on the morning of 2026-10-16, after he showed a surf report site that writes its forecast as a paragraph and asked whether such a sentence was useful: yes, written from the data, in the design of the alert's own sentence, with a button that begins an alert at the spot ("ok parfait et reprendre ce design… ajouter un petit CTA genre crée mon alerte personnalisée"). Built the same day. It amends [decision 057](057-public-pages-of-breaks.md), whose page gains the sentence and the button.

## Context

The page of a break (decision 057) says what the break is like, what the nearest stations measure, the next tides and a table of the week. Nothing on it says in words what the sea does now, nor whether it is what the break likes: a reader who does not read a table leaves without the one thing the product is for. Nothing on it leads to an alert either, which is what the product does that a report site does not.

Other sites write a paragraph from their figures: "the swell is well oriented, the waves are very large, the wind is offshore", with a grade of their own. Search engines read such prose, which changes with the sea, as a page that lives; they treat text written by a model, or the same words on thousands of pages, as thin.

The catalogue says of 2,407 breaks what they like: the directions of swell and wind, the tides, the size at which they work, and every break its offshore direction. The alert's editor already writes conditions as one sentence, each part set in a darker type with a dotted line under it, and the landing shows that sentence.

## Decision

### The sentence

- Under the title, a card says the sea now in one sentence, from the forecast the worker keeps for the break's cell, at the hour the reader's moment falls in: the waves, their height, their period and where they come from; the wind, its speed and where it comes from, and how it meets the shore when the break knows its offshore direction; the tide, rising or falling, and the next high or low water at its time in the break's time zone, with its height now. A measurement is written in the reader's units, as everywhere.
- It is written as the editor writes an alert, `apps/web/src/components/alerts/`: grey prose, each figure in the darker type with the dotted line under it, a direction as an arrow then its name with `Bearing`, the tide's way with `TideTrend`. The words are messages of their own, in the four languages, and they borrow the editor's where the editor has them.
- A second line judges the hour by what the break itself says, and by nothing else: the swell within a point of the compass of a best swell direction; the height within the size at which the break works; the wind off the shore or across it off the shore, or within a point of a best wind direction; the stage of the tide, read from the height now between the next low and the next high water, among the best tides. What fits is named, then what does not. A thing the break says nothing of is not judged, and a break that says nothing is given the facts alone. There is no grade and no adjective: the words are the break's own, laid against the hour.
- The rules read no clock and no database: `packages/api/src/sea-now.ts`, with its tests, since the words of the catalogue live beside the schema. [Decision 061](061-a-panel-that-shows-less-or-more.md) moved them to `packages/conditions/src/sea-now.ts`, and the words to `packages/config/src/sea-words.ts`, so that the app judges as the page does. The API gives the page the hour, how its wind meets the shore and the verdict, as `week.now`, and the tide's height and way, as `tide.now`: `hourOf` in `packages/conditions/src/forecasts/week.ts` picks the hour from the kept forecast, and `nextTides` in `packages/api/src/pages.ts` reads the height now from the same prediction as the extremes. The web app writes them and judges nothing.
- Each underlined part leads to the lesson of the beginner's guide that explains it, the height, the period, the swell's direction, the wind and the tide, and so do the names in "What fits this spot": [decision 060](060-learning-to-read-a-forecast.md).
- The card names no hour: Téo chose, on reading it, that the week's table, which says when the forecast was fetched, is enough, and that a line beside the button read as the button's own.
- With no forecast kept for the cell, the card is not drawn: the week already says that the forecast is on the map. A break that is not listed has no forecast kept, and so no sentence.

### The button

- Under the sentence, one button, "Set my alert for this spot", leads to `/app?break=<id>&create=alert`. The map opens on the break. A visitor is asked for an account. An account that has a spot at that break opens the alert's editor there. One that has none gets one made at the break, with its name and its point, and the editor opens on it: the reader goes from the break to the alert's name and conditions with no step between, which Téo asked for on 2026-10-16, after a first version led to the panel that adds a spot, where the place could be chosen again. The address keeps `create=alert` until the editor opens, so that a sign-in or a saved spot takes the reader on.
- `create` is a parameter of `/app` beside the others, read by the viewer: nothing else changes in the app.

## Rejected

- **A grade or an adjective**, "A4", "excellent". A scale of the instance's own would say more than the catalogue knows, and would be the same for a reef and a beach. The break's words laid against the hour say what a grade would, and say where they come from.
- **A paragraph written by a model.** Decision 057 keeps generated text off the pages, and a sentence from the data says the same without it.
- **The sentence in the head's description.** The description is written for a search result, which is read for days; the sentence is for the hour.
- **Asking the provider for a cell that is cold**, so that every page has its sentence. Decision 057 rejected it for the week; the files of decision 058 make a cold cell rare for the listed breaks, which are the pages that are read.
- **A button that opens the map and no more.** A button that says "alert" and leaves the reader to find the editor would be a promise unkept.

## Consequences

- The page of every listed break gains a sentence that changes every three hours and a button to the product's own feature. The sitemap and the head do not change.
- A reader on a cached page reads a sentence up to an hour old, and a forecast refreshed every three hours: "right now" is within a few hours.
- An alert begun from a page makes a spot of the break in the account, named after it, as the "+" of the map would: the account then has a spot it did not name itself, which it may rename.
- The design system shows the card, with and without the break's words, and with the button.
