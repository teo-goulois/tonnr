# 040. A phone goes from one screen to another by a bar of tabs

Status: accepted on 2026-10-12. Téo asked for it that day, of a phone: "a bottom nav with icons, and no top bar any more, to have something more native." He then asked for three things with it: a way to choose one of his lists from the map itself, a "+" in the bar that adds a spot or an alert, and a place for an account's settings, with the units and how to be told of the alerts. It follows [decision 014](014-web-app-as-mobile-reference.md), and changes where [decision 031](031-alerts.md) and [decision 033](033-units.md) put their settings. Where a rule is not his but follows from one, the text says "chosen here": those are his to overturn. Amended the same day: the lists were first a row that stood on the map all the time, and Téo, who saw it, asked that a button unfold it: "it is not there by default, and we gain a little room." Amended again that evening: the bar first stood against the bottom edge, with thin icons and a grey pill under the tab in view. Téo was "not a great fan" of its buttons, "the icons or the hover state", and asked for "something a little more modern, crisp". He compared four looks of it and kept the one that floats, with the icons he chose.

## Context

Decision 014 asks that each screen of `/app` be designed as a phone screen first, with only patterns a native app has: a stack, tabs, a bottom sheet. One thing was not: the header. It took 56 pixels at the top of a phone for four links, where a thumb does not reach, and one of them was the theme, which is chosen once.

The product is one screen, the map, with panels. On a phone the saved places and the alerts were sheets that rose over the map from a link at the top. Settings were in three places: the units in a dialog of the account's menu, how to be told of the alerts in a tab of the alerts panel, and the theme in the header.

## Decision

- Under 1024 pixels of width, which is `lg` and where the viewer already took a screen for a phone's, the product has no header. A bar at the bottom has four tabs, each an icon with its name: the map, the saved places, the alerts with the count of what is not read, and the account. A wide screen keeps its header and has no bar.
- The bar floats over the bottom of the screen, on the surface of the map's own buttons: the map and a tab's screen go on under it and show around it. What stands at the bottom of a phone's screen keeps clear of it: the sea's timeline, the map's credits, the end of a screen that scrolls, a toast.
- A tab is drawn as a line, and the tab in view has its art filled, on a soft ground: it is told by more than its color. The icons are Téo's choice: a map, a bookmark, a bell, a person.
- The bookmark is the sign of what is saved, wherever it is drawn: the tab, the button of a panel that keeps a place in the favorites, the mark of a saved station on the map, the link of a wide screen's header, and the button of the lists. It was a star, as [decision 017](017-station-lists.md) wrote it. Chosen here: that the star goes everywhere, once the tab is a bookmark.
- The map is a tab, and so is each of the three panels. On a phone, a tab's panel is the whole screen, in place of the map, with no button that closes it: the bar leads elsewhere. On a wide screen it stays a drawer over the map.
- The address does not change: `?panel=saved`, `?panel=alerts`, and `?panel=account` for the new one. A phone and a wide screen draw the same address differently.
- A phone shows one thing at a time: what is selected, on the map, or a tab's screen. A tab opens with nothing selected, and keeps the list the map shows alone. An address that names a selection and a tab's panel, as a wide screen makes, shows the selection on a phone and drops the panel: the panel of what is selected may hold an alert that is written and not saved. Chosen here.
- The panel of what is selected, and the one that adds a spot, stay sheets over the map. A sheet rises over the bar, as it does over the timeline.
- Beside the bar stands a "+", round and of its height. It is no tab: it opens a sheet that asks what to add, a spot or an alert. A spot goes to the panel that adds one, and the map's own button for it is left to wide screens. An alert is set on a spot: an account with one spot goes to it, an account with several says which, and an account with none is led to add one first. The spot's panel then opens on a new alert. A visitor is asked for an account at the choice. Chosen here: the two choices, and what an alert asks first.
- The account's lists are on the map itself, behind a button under the one that finds the reader. A press unfolds the row of chips of the saved panel beside it, and another folds it. A chip shows a list alone on the map and opens nothing else, and the first one shows everything again. The row is folded until it is asked for, and stays open once a list is chosen, so that another can be. The button is filled while the map shows a list alone, so that a folded row still says that the map does not show everything. On a phone the row unfolds where the legend opens: opening one folds the other. Chosen here: that the button is filled, and that it is the last of its column, so that no other button moves when the lists are known. Whoever reads a list by its link has no other list, and keeps the button that names it.
- The account's panel holds who is signed in and the settings: the units, how to be told of the alerts, the theme, the language, and on a wide screen the keyboard shortcuts. A phone opens it from the bar and a wide screen from the account's menu, "Settings". A visitor has it too, with the form's two buttons in place of a name: the browser keeps their units, their theme and their language.
- How to be told of the alerts is one step into that panel, `?panel=account&settings=alerts`, with a button that goes back. The alerts panel loses its third tab and has a button that leads there. `?panel=alerts&alerts=settings` is taken there too, for good: the mails that were sent name it.
- The units are lines of that panel, and their dialog is gone. The theme is chosen there among three, the system's, light and dark, and the header of a wide screen keeps its button.
- Before the product knows who opens it, it draws the bar or the header as it will be: CSS tells a phone from a wide screen there, since the server knows no width.
- The wall of an instance that is closed to visitors (decision 039) has no bar: it leads nowhere but in.

## Rejected

- **A bar that opens the same sheets.** Nothing to rebuild in the panels. But a sheet that covers the bar makes it a toolbar: one tab cannot be left for another without closing first.
- **Icons alone.** A narrower bar. But four icons without a name are guessed at, and the bar is where a new user learns what the product has. Téo saw it among the four looks, and did not keep it.
- **The bar against the bottom edge**, which was built first, with the "+" in its middle. Téo saw it with its art filled, and with a line that slid from one tab to the next. But on the map everything else floats, and a bar that floats leaves the map its whole screen.
- **The "+" as an entry in the address**, `?panel=create`. The browser's way back would close it. But closing it would land on the map, whatever tab it was opened from.
- **The row of lists always on the map.** One press to a list, and what was built first. But it took a line of a phone's map all the time, for what is used now and then.
- **`viewport-fit=cover`**, so that the page draws under the phone's home indicator. Without it the browser keeps the page, and the bar with it, above the indicator. With it, every screen would have to keep clear of the notch itself. Not verified on an iPhone: see below.

## Consequences

- A new tab is a name in `PHONE_TABS`, in `apps/web/src/lib/phone-nav.ts`, a panel drawn through `ViewerTab`, and a value of `panel` in the route. `tabOf` says which tab an address shows, and the bar and the viewer both read it. Its art is a line and its fill, in `BottomNav`.
- What a phone puts at the bottom of its screen adds `--bottom-nav-lift` to where it stands. `apps/web/src/index.css` sets it where `AppShell` draws a bar, and nowhere else.
- A fifth tab has no room: on a phone 320 pixels wide, four names and the "+" fill the width.
- A new setting of an account is a line of `AccountPanel`, or one step into it when it is long.
- The mobile app of decision 014 takes the same four tabs and the same "+".
- On a phone the map no longer has a button that adds a spot, and the header's link to the landing page is gone.
- A tablet held upright is under 1024 pixels wide, and has the phone's layout.
- Decision 033's dialog and its line in the account's menu are replaced by the panel. Decision 031's settings are no longer under the bell.
- Not built: a field at the top of a phone's map that finds a place or a list, where the header was. The command palette is opened by a key, so a phone has none.
- Not verified on a device: an iPhone, in Safari and from the Home Screen, where the bar floats just above the browser's own and the home indicator. The bar was checked in a desktop browser at a phone's size.
