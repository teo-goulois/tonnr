# 063. What an account says of itself as a surfer, asked once as it comes

Status: asked for by Téo on 2026-10-16, and built the same evening. He asked for "un petit onboarding" after an account is made, to learn the surfer's level, the biggest waves they surf, how well they read the conditions and which density to advise, "pour ensuite quand on utilise le MCP que les conseils soient beaucoup plus justes", and to say what the app does best, "très simple et rapide". He agreed to the proposal that followed, and answered its three questions: the accounts that exist are asked too, and may put it off; the sizes are said as is most fitting, which was left to me; and the questions end on a button that leads to the map, nothing more.

## Context

An assistant signed in by an account ([decision 047](047-agents-sign-in.md)) reads its spots, its alerts and its sessions, and nothing of the person. Asked where to surf tomorrow, it does not know whether it speaks to someone who learns in the white water or to someone who waits for two metres. The sessions of [decision 043](043-session-log.md) say it in time, once there are a few rated ones. A new account has none.

The app could use the same answers. The catalogue says which levels a break suits (`ABILITY_LEVELS`, [decision 015](015-surf-breaks.md)), the boards it suits, and the panel shows less or more of the forecast by a setting ([decision 061](061-a-panel-that-shows-less-or-more.md)).

## Decision

### What is asked

- **The level**, in the four words the catalogue gives a break's levels in, `beginner`, `intermediate`, `advanced` and `pro`, each with a line that says what it means: the white water and the first green waves, green waves ridden along, turns in most conditions, heavy waves at a competitor's level. One word for both, so that a break and a surfer compare without a table between them.
- **The waves surfed, from the smallest to the biggest**, and not the biggest alone: a beginner has a top and someone who surfs well has a floor, under which they stay home. They are said among the nine pictures of a session's sizes (decision 043), a surfer of 1.75 m beside a wave, each with its name and the height of face it stands for in the reader's unit: a first press says the smallest, a second the biggest, and the sizes between are marked. Chosen here over metres, as Téo left it to me: surfers say a size against a body, a height in metres is misjudged, and the sessions say sizes on the same scale, so that what a surfer says of themselves and what their sessions say compare. The API also answers the heights of face these stand for, from `SURF_FACES`.
- **How well the surfer reads a forecast**, in three answers said as the surfer would: they look whether it is good; they read the swell, its period and the wind; they read all of it, the models, the buoys and the energy. The answer puts the panel's density in force, essentials, details or everything, and keeps it in the account as the density's own setting does: the question says so, and the setting stays the reader's to change. It is asked of the reading and not of the level, which decision 061 refused to read a density from.
- **The boards**, as many as the surfer rides, among those of the catalogue one rides in the waves of a break: shortboard, fish, funboard, longboard, gun, bodyboard, bodysurf, foil and stand-up paddle.
- An account with no username, made by Google ([decision 046](046-google-sign-in.md)) or before usernames, chooses it there first, with the form of decision 041.
- Each question may be skipped: what is not said is null. Nothing else is asked. Age, how often one surfs or where one lives change no advice the product gives today.

### When it is asked

- Once, to every account, as it opens `/app`: a new one after its sign-up and one that exists at its next visit, as Téo asked. A row of `surfer_profile` is written when the account answers or puts the questions off, and an account without a row is asked.
- It opens over the map, in a dialog: three lines on what the app does best, alerts on one's own spots, the log of sessions, and an assistant that reads them, then the questions one at a time with "1 of 4" over them, or "1 of 5" with a username to choose, and on the last "Explore the map", which keeps the answers and closes. "Later", the close button or Escape puts the questions off: the account is not asked again, and answers in its panel when it wishes. A press beside the dialog does nothing, so that no answer is lost to a press that missed.
- It waits while another dialog stands over the map, the one of a friend's link (decision 041), and while a public page has asked for an alert (decision 059), so that a surfer who came to set an alert sets it first.
- The answers are changed one step into the account's panel, `?panel=account&settings=profile`, all on one page and saved at once. The line that leads there says what the account answered, its level and its waves, and the command palette finds it.

### What keeps it, and who reads it

- A table of its own, `surfer_profile`, one row an account, which goes with the account: the level, the smallest and the biggest wave as sizes of decision 043, the reading, the boards, and when the account answered and when it put the questions off. The answers are a person's, and not a preference of how the apps draw, which is why the table is not `display_preferences`.
- Three procedures of the versioned API, on `protectedProcedure`: `profile.get`, `profile.save`, which replaces every answer at once and refuses a biggest wave smaller than the smallest, and `profile.putOff`. Saving and putting off are the events `surfer_profile_saved` and `surfer_profile_put_off`, which carry nothing of the answers.
- `profile.get` is a tool of the MCP server for an account's assistant, `get_my_surfer_profile`, listed to no key ([decision 045](045-mcp-server.md)). Its description tells the model that these are what the person thinks of themselves, that their sessions say more once there are a few, and to fit its advice to them: a break whose levels are above theirs, or waves bigger than they surf, is said to be so. The server's instructions to an account's assistant say to read it before advising where or when to surf.
- Nobody else reads it: no friend, no operator in the admin, no public page. The privacy policy says it is kept and that an assistant reads it.

## Rejected

- **Questions as part of the sign-up form.** One step fewer. But a sign-up that asks more is left more often, an account made by Google has no form, and the accounts that exist would never be asked.
- **A tour of the features, screen by screen.** It shows more. But it is skipped, and Téo wanted it short: three lines before the questions say it, and the map does the rest.
- **The biggest wave alone, in metres.** What Téo first named. But it says nothing of a floor, a surfer misjudges metres, and the sessions would say sizes on another scale.
- **Reading the profile from the sessions alone.** Nothing to ask. But a new account has no session, and the sessions take weeks to say anything.

## Consequences

- An assistant fits its advice to the person from the first day, and can tell what they say of themselves from what they surfed.
- A surfer who reads a forecast at a glance opens the essentials from their first visit, where decision 061 gives everyone everything.
- Every account that exists is asked once, at its next visit.
- Not built: a break's panel or page that says whether its levels and its usual sizes fit the reader, and an alert's editor that begins with the waves the surfer said. Both read this profile when they come.
