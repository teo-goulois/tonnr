# 066. Photos and videos of a session, kept in a bucket

Status: accepted on 2026-10-18. Téo asked for it that day: photos and videos added when a session is written, "uniquement à usage personnel", kept with security in mind, on Cloudflare R2 to begin with, through files-sdk "pour simplifier les changements", and made smaller as they come in "tout en gardant la qualité". He left the details to choose, then answered the questions I asked: ten files a session, a minute of video, 2 GB an account, read by its owner alone. What is marked "chosen here" is his to overturn. Codex challenged the design before it was built; what it changed is said where it applies.

## Context

A session said where, when, how long and how it was ([decision 043](043-session-log.md)), and listed its photos among what was not built. An instance had nowhere to keep a file: everything it holds is rows of Postgres, and the API and the worker are two containers on one machine, with no disk that outlives a deployment.

A photo of a phone is 3 to 5 MB, often in HEIF, and a minute of its video, in 4K and HDR, several hundred. Kept as they are sent, they would fill a bucket for nothing that a screen shows, and some would not play in every browser.

## Decision

### Where the files are

- A bucket of Cloudflare R2, private, read and written through files-sdk, its R2 adapter on the `fetch` client: requests signed in place, with no SDK of Amazon's in the images. Another store takes its place by changing the adapter in `packages/media/src/storage.ts`, and a store with R2's API, such as RustFS for development, by `MEDIA_ENDPOINT`.
- An instance keeps media when `MEDIA_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are all set, and none otherwise: the API then signs no upload, and the web app offers none, as an instance without its pair of keys sends no push. The token's id is a part of every address the bucket signs, so it is no secret, and Varlock is told so: it blocks a response that holds a secret.

### How a file comes in

- A file goes from the browser to the bucket, and never through the API. `media.prepare` takes its type and its size, and answers an address that takes that file with PUT for fifteen minutes. The type and the size are signed into the address, so that the bucket refuses another file: files-sdk binds the type alone, since R2 caps no size in a form, and its own signer is asked for both. Codex said that a size declared and not bound lets an account send more than it said: this is the answer, checked against RustFS. Whether R2 refuses a length that is not the one signed is to be seen against R2 itself.
- The browser says it is sent with `media.uploaded`. The API asks the bucket what it holds, keeps its ETag, and wakes the worker with `NOTIFY`. A file of another size or type is deleted there.
- Before it signs, under the account's row: a photo is a JPEG, PNG, WebP, AVIF or a phone's HEIF of 40 MB at most, and a video an MP4, a QuickTime or a WebM of 1 GB and a minute at most; an account keeps 2 GB, counting what waits at the size it was said; it asks for 40 files an hour; every account together sends 20 GB a day. Chosen here, but for the three of Téo's.
- The files of the hour and the bytes of the day are counted apart from the media, in `media_sent_hour` and `media_sent_day`, so that deleting a medium gives back nothing of them, and each count takes its share in one statement that refuses once it is full, so that two requests at once never pass the day's budget together. Codex's review found both: a medium deleted gave its share back, and two accounts could pass the budget at the same moment. The worker deletes the hours after two days and the days after a week.
- A file is sent under `up/<id>`, a key the browser may write to while its address works and that nothing ever shows. What is shown is under `m/<id>/`, which only the worker writes. Codex said that a browser could put a file again under the first key while it is read: the worker reads the file that has the ETag the API kept, and refuses another.
- An operator stops every upload from the admin's page of the instance, `PUT /v1/media/uploads`, which writes `media_pause` and says who in `operator_action`; what is kept is still shown and deleted. A file whose address was signed in the quarter of an hour before still arrives and is made. The page says how many media are kept, their size, and how many wait or failed.

### What the worker makes of it

- The job `process-media` of the worker runs every minute, and as soon as the API says a file waits. It takes one medium at a time, for a few minutes, holds it by a claim of twenty minutes, and writes its row only while the claim is still its own: a medium deleted or taken by another meanwhile keeps nothing, and what was written for it is deleted.
- A photo: sharp turns it the way the camera held it and keeps its color profile, then writes an AVIF of 2,560 pixels at most on its longest side to look at, and a WebP of 480 on its shortest for a list. A phone's HEIF, which sharp's build does not open, is decoded by libheif in WebAssembly. A photo of more than a hundred million pixels is refused.
- A video: ffprobe reads it, then ffmpeg writes an H.264 of 1080p and 30 images a second at most, which every browser and phone plays, with its sound, a poster, and a small picture. A phone's HDR is turned into the colors every screen shows, where ffmpeg has the filter for it: Debian's, in the worker's image, does. A video longer than a minute is refused.
- Nothing of what a file said is written again: no place, no time, no device. The file sent is deleted once it is made.
- ffmpeg reads one file, of a phone's or a browser's containers, with their decoders alone, and nothing it points to; it runs with no setting of the worker in its environment, at a lower priority, on two threads, and is killed with what it started when its time runs out or the job is stopped. Codex asked for a processor of its own, with no access to the database: see "Rejected".
- A medium that could not be read after three tries is given up. One that was not a photo or a video, too big or too long, is refused at once, and says why.

### How a file is read

- The API answers addresses of the bucket, signed for an hour after the hour they are given in, and the same all through that hour, so that a browser keeps the file. Codex said that an address of the API that sends on to the bucket would be refused to an image, which carries no `Origin`, and that its answers are kept by no cache. An address given stays good until it expires: an account that signs out, or deletes a medium, leaves addresses that work until then.
- The media of a session are answered by `media.sessions`, to its owner alone. A session's own answer says nothing of them: `sessions.list` and `sessions.get` are tools of an account's assistant ([decision 047](047-agents-sign-in.md)), which reads no photo. No friend, no list and no link reads them either.

### How a file goes

- A medium belongs to the account, then to the session it is given to, and goes with either, by the database's own cascade. One given to nothing goes a day after it was asked for, and so does a file that never came.
- Whatever way a row of `media` goes, a trigger of the database writes the keys of its files to `media_trash`, which the worker empties. Codex said that rows deleted by a cascade leave files that nothing names: none does now. A key the bucket would not delete stays in the trash for the next run: files-sdk resolves a bulk delete whatever the bucket refused, and the storage reads its answer. A file the worker wrote for a medium that then failed is deleted at once, or put in the trash when the bucket does not answer.
- A session takes its media in the order of `mediaIds`, through `sessions.create` and `sessions.update`. A request holds the account, then the session, then the media in the order of their ids: two requests that give the same medium wait for each other, and the worker passes over what is held.

### In the web app

- The form of a session has a line of its photos and videos, under how big the waves looked: a strip of squares and a last one that adds more. A file goes up as soon as it is chosen, with a ring of how far it went, while the rest of the form is filled in. A file the browser can tell is of another type, or too big, is refused before anything is asked. One that failed is sent again with a press. Chosen here.
- A file goes on going up once its form is closed: the files being sent are kept by the route, not by the form, and a session saved while a video still goes up keeps it and says so. A file taken out of a new session's form is deleted at once; one taken out of a session that keeps it goes when the form is saved.
- A press on a square opens the viewer, `MediaViewer`: one photo or video at a time, over the whole screen and dark in either theme, with arrows on a wide screen, a slide of a finger on a phone and the arrow keys. A video plays when it is asked to, with its sound.
- The log and the tab of a place's sessions draw the first photo of a session small at the end of its line. The media of what is on screen are asked again every three seconds while one is being made.
- `media.status` says whether the instance takes media: the line is not drawn on an instance that keeps none.

## Rejected

- **Uploads through the API.** The API would see every byte and need no bucket's CORS, but a minute of 4K would hold a request of the API for minutes on a phone's network, and its memory.
- **An address of the API for each file, that sends on to the bucket.** It would let an operator hide a file at once. An image carries no `Origin`, so it would need a door of its own, and every image of a list would be one more call, which nothing caches.
- **Making the files smaller in the browser.** A minute of 4K would go up ten times faster. The browsers do not all encode, a phone would spend its battery, and the server must read and make the file all the same, for what it says and for what is safe.
- **A processor of its own**, with no access to the database or to the mail, as Codex asked against a file made to break ffmpeg. It is the next step if the instance takes media from people it does not know. For an instance of a few accounts, a second service to run is the larger risk: ffmpeg is held to a few containers and decoders, and runs with none of the worker's settings.
- **WebP for the picture that is looked at.** Every browser reads it, but AVIF keeps a phone's photo as sharp at two thirds of the size, and every browser of the last three years reads it.
- **files-sdk's `aws-sdk` client.** It sends a large file in parts, which no file of this size needs, and adds Amazon's SDK to both images.

## Consequences

- The instance needs a bucket before any media: Téo creates it, with an API token of R2 limited to it, a CORS rule that lets the web app's addresses PUT, and a rule that deletes what is under `up/` after a day. `docs/self-hosting.md`, "Photos and videos", says how.
- The worker's image installs ffmpeg, which grows it.
- The migration `session-media` adds `media`, `media_trash`, `media_pause` and the trigger. The API and the worker apply it as they start; the worker must be deployed for anything sent to be made.
- Deploy the API before the web app.
