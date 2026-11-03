<!--
Handbook e5f830e9c232, from https://teogoulois.com/code/stack/changelog.
Replaced on every handbook update: record a project's exceptions in docs/decisions/, not here.
-->

# Changelog

Every user-visible change ships with a short note, and each release turns the notes into a changelog people enjoy reading.

A changelog is for users, not developers. It tells them what they can do now,
and it shows a new visitor that the product keeps moving.

```flow
A user-visible change ships with a note in changes/
At release, the changelog skill assembles the notes
CHANGELOG.md, release notes, and the app's changelog page
```

## What goes in

```choose
New capability → new
Visible improvement to something that exists → improved
Bug users could have run into → fixed
Refactor, dependencies, CI, tests, internal tooling → no note
```

## The note

One file per change in `changes/<slug>.md`, committed with the code. Separate
files keep parallel branches and agents from conflicting.

```md
---
type: new
highlight: true
image: ./quick-correction.png
link: docs/features/quick-correction.md
---

## Correct any selected text with ⌘⇧C

Select text in any app and press ⌘⇧C: Tippo corrects it in place, without
switching windows.
```

- The title says what the user can do now, not what was built.
- One to three sentences, benefit first, in the user's words.
- `highlight` marks a major feature. It leads its release, with an image.
- `link` points to the feature's own doc instead of repeating it.
- Written in English, or in the site's language when it has only one.
- A later change that alters what a note promises updates that note.

## Releases

- Desktop and mobile apps get one section per version, with its date.
- Web apps get one section per week.
- Highlights come first, then new and improved entries. Fixes close the section
  as a short list.
- The `changelog` skill writes the section into `CHANGELOG.md`, the GitHub
  release notes, and the app's changelog page when it has one, then deletes the
  notes it used.

Model: [Louez's changelog](https://louez.io/fr/changelog).

## For developers

Open-source projects can add a developer changelog generated from Conventional
Commits with [git-cliff](https://git-cliff.org). It stays separate from the
user changelog.
