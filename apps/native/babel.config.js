module.exports = {
  presets: ["babel-preset-expo"],
  plugins: [require("@varlock/expo-integration/babel-plugin")],
  overrides: [
    {
      // oRPC writes parameters such as `async (...[input, options = {}]) =>`, a rest parameter
      // with a pattern, which Hermes does not parse: its client failed as it was made. These
      // two transforms write such parameters out for it. Decision 069.
      test: (filename) => filename !== undefined && /[\\/]@orpc[\\/]/.test(filename),
      plugins: ["@babel/plugin-transform-destructuring", "@babel/plugin-transform-parameters"],
    },
  ],
};
