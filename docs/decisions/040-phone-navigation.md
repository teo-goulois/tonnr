# 040. A phone goes from one screen to another by a bar of tabs

Status: accepted on 2026-10-12. Téo asked for it that day, of a phone: "a bottom nav with icons, and no top bar any more, to have something more native." He then asked for three things with it: a way to choose one of his lists from the map itself, a "+" in the bar that adds a spot or an alert, and a place for an account's settings, with the units and how to be told of the alerts. It follows [decision 014](014-web-app-as-mobile-reference.md), and changes where [decision 031](031-alerts.md) and [decision 033](033-units.md) put their settings. Where a rule is not his but follows from one, the text says "chosen here": those are his to overturn.

## Context

Decision 014 asks that each screen of `/app` be designed as a phone screen first, with only patterns a native app has: a stack, tabs, a bottom sheet. One thing was not: the header. It took 56 pixels at the top of a phone for four links, where a thumb does not reach, and one of them was the theme, which is chosen once.

The product is one screen, the map, with panels. On a phone the saved places and the alerts were sheets that rose over the map from a link at the top. Settings were in three places: the units in a dialog of the account's menu, how to be told of the alerts in a tab of the alerts panel, and the theme in the header.

## Decision

- Under 1024 pixels of width, which is `lg` and where the viewer already took a screen for a phone's, the product has no header. A bar at the bottom has four tabs, each an icon with its name: the map, the saved places, the alerts with the count of what is not read, and the account. A wide screen keeps its header and has no bar.
- The map is a tab, and so is each of the three panels. On a phone, a tab's panel is the whole screen above the bar, in place of the map, with no button that closes it: the bar leads elsewhere. On a wide screen it stays a drawer over the map.
- The address does not change: `?panel=saved`, `?panel=alerts`, and `?panel=account` for the new one. A phone and a wide screen draw the same address differently.
- A phone shows one thing at a time: what is selected, on the map, or a tab's screen. A tab opens with nothing selected, and keeps the list the map shows alone. An address that names a selection and a tab's panel, as a wide screen makes, shows the selection on a phone and drops the panel: the panel of what is selected may hold an alert that is written and not saved. Chosen here.
- The panel of what is selected, and the one that adds a spot, stay sheets over the map. A sheet rises over the bar, as it does over the timeline.
- The middle of the bar has a "+". It is no tab: it opens a sheet that asks what to add, a spot or an alert. A spot goes to the panel that adds one, and the map's own button for it is left to wide screens. An alert is set on a spot: an account with one spot goes to it, an account with several says which, and an account with none is led to add one first. The spot's panel then opens on a new alert. A visitor is asked for an account at the choice. Chosen here: the two choices, and what an alert asks first.
- The account's lists are one press away on the map itself: the row of chips of the saved panel floats there too. A chip shows a list alone on the map and opens nothing, and the first one shows everything again. On a phone the row stands under the legend, and on a wide screen at the top left. Whoever reads a list by its link has no other list, and keeps the button that names it.
- The account's panel holds who is signed in and the settings: the units, how to be told of the alerts, the theme, the language, and on a wide screen the keyboard shortcuts. A phone opens it from the bar and a wide screen from the account's menu, "Settings". A visitor has it too, with the form's two buttons in place of a name: the browser keeps their units, their theme and their language.
- How to be told of the alerts is one step into that panel, `?panel=account&settings=alerts`, with a button that goes back. The alerts panel loses its third tab and has a button that leads there. `?panel=alerts&alerts=settings` is taken there too, for good: the mails that were sent name it.
- The units are lines of that panel, and their dialog is gone. The theme is chosen there among three, the system's, light and dark, and the header of a wide screen keeps its button.
- Before the product knows who opens it, it draws the bar or the header as it will be: CSS tells a phone from a wide screen there, since the server knows no width.
- The wall of an instance that is closed to visitors (decision 039) has no bar: it leads nowhere but in.

## Rejected

- **A bar that opens the same sheets.** Nothing to rebuild in the panels. But a sheet that covers the bar makes it a toolbar: one tab cannot be left for another without closing first.
- **Icons alone.** A narrower bar. But four icons without a name are guessed at, and the bar is where a new user learns what the product has.
- **The "+" as an entry in the address**, `?panel=create`. The browser's way back would close it. But closing it would land on the map, whatever tab it was opened from.
- **The lists in a menu on the map**, one button that names the list in view. Less room taken. But two presses for what is done often, and the lists an account has are not in sight.
- **`viewport-fit=cover`**, so that the bar draws under the phone's home indicator. Without it the browser keeps the page above the indicator and fills under it with the page's background, which is the bar's. With it, every screen would have to keep clear of the notch itself. Not verified on an iPhone: see below.

## Consequences

- A new tab is a name in `PHONE_TABS`, in `apps/web/src/lib/phone-nav.ts`, a panel drawn through `ViewerTab`, and a value of `panel` in the route. `tabOf` says which tab an address shows, and the bar and the viewer both read it.
- A new setting of an account is a line of `AccountPanel`, or one step into it when it is long.
- The mobile app of decision 014 takes the same four tabs and the same "+".
- On a phone the map no longer has a button that adds a spot, and the header's link to the landing page is gone.
- A tablet held upright is under 1024 pixels wide, and has the phone's layout.
- Decision 033's dialog and its line in the account's menu are replaced by the panel. Decision 031's settings are no longer under the bell.
- Not built: a field at the top of a phone's map that finds a place or a list, where the header was. The command palette is opened by a key, so a phone has none.
- Not verified on a device: an iPhone, in Safari and from the Home Screen, where the bar meets the browser's own and the home indicator. The bar was checked in a desktop browser at a phone's size.
