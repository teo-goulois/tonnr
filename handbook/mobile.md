<!--
Handbook 0aa73bf22aec, from https://teogoulois.com/code/mobile.
Replaced on every handbook update: record a project's exceptions in docs/decisions/, not here.
-->

# Mobile

React Native by default, native code when a platform API makes it clearly simpler.

```choose
Most apps → React Native, from the Better-T-Stack Expo option
A platform API is missing or much simpler natively → native code
```

Docs: [React Native](https://reactnative.dev), [Expo](https://docs.expo.dev).

- Share domain code, schemas, and the API client with web. Don't force every UI
  component to be shared.
- Translate from day one: [Expo Localization](https://docs.expo.dev/versions/latest/sdk/localization/)
  for the device locale, [react-i18next](https://react.i18next.com) for
  messages. Not yet tested in one of my apps.
