# 067. Reports of the waves at a break, checked to be of there, of now, and of the sea

Status: accepted on 2026-10-18. Téo asked for it that day, after the photos of a session ([decision 066](066-photos-and-videos-of-a-session.md)): on the public spots, a part where people send photos and videos of the waves as they are, checked to belong to the spot, "uniquement autoriser les images avec exif et vérifier que la location soit pas trop loin", and analysed "pour vérifier que c'est bien une image de vague, plage etc... et pas autre chose". He then answered the questions I asked: the position of the phone stands in for a file that says none, within 2 km and two hours; an open model in the worker, with nothing sent out; one to four media, a size and a few words; published at once when the checks pass, three flags hide it, the admin decides; a report is the sea of now for six hours and shown a week; no score. He changed one answer: after a week a report is not deleted but kept, hidden from everyone, "pour pouvoir faire de test plus tard", with the deletion built and switched off. And he asked to see in the admin, for each photo, whether it passed. What is marked "chosen here" is his to overturn. Codex challenged the design before it was built.

## Context

A forecast says what the models compute and a buoy what the sea does offshore. Neither says what a break looks like now, which a surfer asks a friend on the beach. [Decision 041](041-community-guides.md) set aside the answers of the day after an alert, "never shown as they come, so that nobody reads there where it is good now". Téo asked for the opposite at the public breaks, whose catalogue and forecasts everyone already reads: this decision overrides that sentence for them, and a spot of an account's own takes no report.

A photo says where and when it was taken in its EXIF, and a video in its container, but an iPhone's browser takes the place out of a photo taken in the form, and out of one of the library unless the person asks to keep it. And a file says what anyone writes in it: what is checked here is a mistake, a photo of another day or another place, not a lie.

## Decision

### What a report is

- An account with a username sends a report at a break of the catalogue: one to four photos and videos of half a minute at most, how big the waves and the sets look, as a session says it, and a note of 280 characters with no address in it. Ten a day, and one an hour at a break, counted in `report_sent`, which deleting a report gives nothing back of: Codex's review found that deleting and sending again passed both. Chosen here, but for what Téo answered.
- Its media are sent as a session's are, `POST /media` for `report`, then given to it by `reports.create`, which takes the version of the terms they are sent under. The worker makes nothing of a medium of a report before the report is written: the checks need its break and the moment it was sent.
- The report keeps the hour of the forecast kept for its break's cell, a copy that nothing asks the provider for, to set it beside the forecast later. Decision 062's figure reads no report yet: Codex said that frequent reports of one person or one swell would weigh it more than sessions do, and that each report would need its swell's direction and period.

### What is checked

- Where: the place the file says, or else where the phone stood as the report was sent, which the browser gives when its person lets it, with a precision of a kilometre or better. Within 2 km of the break: from the beach, a cliff or a car park. Chosen here, at Téo's word.
- When: the GPS's time, which is UTC; the camera's with its offset; the camera's alone, read at the offset of the browser that sent it, which is nearly always the phone that took it; or a video's own date. Within the two hours before it was sent, a clock fifteen minutes ahead forgiven, against the moment the API received the report, not the moment the worker read it. A file that says where and not when is refused. One that says neither and was placed by the phone is taken as just taken: the time is the time it was sent. Codex said that an iPhone's capture says nothing, and that nothing then proves it is fresh: it is the price of taking iPhones at all, and the next two checks and the flags stand behind it.
- What it shows: two open models run in the worker, on its own processor, and nothing is sent anywhere. OpenAI's CLIP ViT-B/32, MIT, reads how near an image is to seven sentences of the sea, a wave or a beach and to eighteen of what a report must not be, from a selfie to a screenshot of a map: the share of the first seven is the sea's score. A ViT trained to tell nudity, Apache-2.0, gives its own. A video is judged by the worst of three images, at a fifth, a half and four fifths of it. The analysis looks only at what was taken there and lately.
- The numbers, chosen here from 48 photos of Wikimedia Commons on 2026-10-18: a medium passes at 60 % of sea and refuses under 30 %, and is refused at 85 % of nudity. Between, an operator decides: Codex said that a classifier refuses ordinary beaches and misses what matters, and that its doubt should go to a person rather than to a refusal. Waves and surf scored 91 % to 100 %; food, streets, rooms, pools and screens under 10 %; screenshots of a map under 15 %.
- The models are downloaded as the worker's image is built, at a revision and with a SHA-256 for each file, `packages/media/src/models.ts`, and the worker never downloads one as it runs. A worker that has none leaves every report to an operator.
- A report is shown when each of its media passed, left to an operator when one is unsure, and refused when one is refused or could not be made. Its author reads why, in a sentence for each reason.
- The position of the phone is kept only when it placed a medium within the radius, and the point of a file only within it: further away, only the distance is kept, to the kilometre. Codex said that a refused report should not keep where someone was, and, in its review, that an operator's decision before the checks ended kept it: the position is forgotten whatever the report became.
- A report is decided once each of its media is made or refused, apart from making them: a report that could not be decided then loses nothing, and the next run decides it. Codex's review found that a failure there deleted what was made.
- A video of a report loses its sound: it would carry what people said beside the camera.

### Who reads it, and how it goes

- Everyone reads the reports of the last week at a break, visitors too, and a program by its key: `reports.list`, the panel of the break and its public page. The reader's own come with where they stand. A report is "now" for six hours, under its age and its distance to the break. After a week nobody reads it but an operator: the report and its files are kept. The worker deletes those older than `REPORT_KEEP_DAYS` days when the instance sets it, with their files, and Téo's does not.
- An account with a username and a day old flags a report once, with a reason, twenty a day. Three accounts hide it until an operator decides. Codex said that three disposable accounts could hide any report: they need a username and a day.
- The admin's moderation has a third tab, the reports, with every check of each medium: where its place came from, how far, when it was taken and by which clock, the scores of the analysis and what it saw most, and the flags. An operator shows a report, whatever its checks or its flags said, and the flags before count no more, or removes it, which hides it for good. `operator_action` says who.
- An author deletes a report, with its files. A report goes with its account and its break.
- The terms say what a report shows and to whom, that its author shot it and that nobody is recognisable close up without agreeing, and that its author lets the instance keep, reduce and show it while it is kept. The privacy policy says what is read of a file and of the phone, what is kept, and that the analysis runs on the instance. Codex asked for both: AGPL and ODbL say nothing of a photograph.

### In the web app

- The panel of a break has a tab after its forecast, `ReportsPanel` in `apps/web/src/components/reports/`, with the reports of the last hours, then those of the week, a press on a photo opening the viewer of decision 066, and a menu that deletes one's own and flags another's. A visitor is asked for an account.
- The form is `ReportSheet`: the rules in a sentence, the media, the size, the note, the terms in a line, and a button that waits for the files. An account with no username chooses one there. As it sends, the browser is asked where the phone stands. The reader's report says "checking" and is asked again every four seconds until it is decided.
- The public page of a break shows the photos of its last reports, `RecentReports`, with a link to send one from the app.

## Rejected

- **EXIF and nothing else**, as Téo first said. An iPhone sends no place from the form's camera, and none from its library unless its person ticks "Location" in the picker: most reports would be refused for the phone they were taken with.
- **A hosted model**, such as Claude or Workers AI. It reads a scene better, and would tell a screenshot, a photo of a screen or of another day. It costs at each photo, and sends every photo of a report to a third party, which the privacy policy would have to say: an open model in the worker is free, private, and works on any instance with no key.
- **An operator who reads every report before it shows**, as Codex asked. A report is for the next hours: one that waits for a person is gone by the time it shows. The checks decide what they can, and leave the rest to the operator.
- **A report kept a week and deleted**, as I first proposed. Téo wants them for tests later. The deletion exists, `REPORT_KEEP_DAYS`, and his instance does not set it: the privacy policy says they are kept until their author or account goes.

## Consequences

- The worker's image holds the two models, 233 MB, and its memory holds them once a report is read, a few hundred megabytes more.
- The migration `wave-reports` adds `surf_report`, `surf_report_flag`, and `report_id` and `checks` to `media`. The worker and the API apply it as they start. Deploy the API before the web app: a web app of this version reads `reports` in the page of a break, and an API of before says none, which it takes as none.
- `pages.break` answers the reports of the week: the public page, kept an hour in Cloudflare's cache, shows a report for up to an hour after it was hidden, and its photos' addresses work two hours past their hour.
- A moment of a report is judged by the API's clock, a photo's by its own: a phone whose clock is far off is refused.
