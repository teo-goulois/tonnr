// The languages the product is written in: the web app's, and those of its mails and pushes.
// `apps/web/project.inlang/settings.json` names the same, English first, which a test checks.
export const LOCALES = ["en", "fr", "es", "pt"] as const;

export type Locale = (typeof LOCALES)[number];

export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);

/** What the web app's addresses begin with in a language: nothing in English, "/fr" in French. */
export const localePrefix = (locale: Locale) => (locale === "en" ? "" : `/${locale}`);
