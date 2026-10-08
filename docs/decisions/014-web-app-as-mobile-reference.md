# 014. One design for the web app and the mobile app

Status: accepted on 2026-10-08.

## Context

A mobile app follows the first release. Téo changes an interface fastest on the web, and wants the mobile app to look like the web app without designing it twice.

## Decision

- `/` is the landing page, in English and in French. `/app` is the product on the web, with accounts and real data.
- Each screen under `/app` is designed as a phone screen first: one column, no hover-only action, and only patterns a native app has, such as a stack, tabs, and a bottom sheet.
- The mobile app will be a React Native app in `apps/native`, built with Expo. It reuses the API client, the schemas, and `packages/conditions`. It rewrites the screens with native components and does not share the web components.
- The Tonnr theme, made in Graphical, is the one design language. Its values are defined in `packages/ui/src/styles/globals.css`, and the mobile app will read the same values.
- The mobile app starts with HeroUI Native as its component library. It is styled with Tailwind 4 through Uniwind and themed with CSS variables, as the web app is. Its tokens have other names than the theme's, so one file maps them. This is a trial: react-native-reusables is the alternative if its components cannot take the theme's shapes.
- The components of `packages/ui` come from the teogoulois registry and take the theme's colors, edges, radius and type. Icons are Nucleo, behind `@repo/ui/icon`, in place of the set the theme's snapshot names.
- Paraglide JS translates the web app. English is the base locale and has no URL prefix. French lives under `/fr`.

## Consequences

- A screen exists twice. A change of layout is made on the web, then ported.
- Gestures, transitions between screens, the keyboard, and haptics cannot be judged on the web. Start `apps/native` once two or three screens are stable, not at the end.
- A component of `packages/ui` that the theme has not reached yet still has its scaffold styling. Convert it when a screen first uses it.
