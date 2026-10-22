// Hermes, the app's engine, has Intl's dates, numbers and collation, and neither PluralRules,
// which Paraglide's plural messages and the settings' words ask, nor RelativeTimeFormat, which
// "seen 5 min ago" asks, nor ListFormat, which the sea now's "what fits this spot: the wind and
// the tide" asks: without them a screen that writes one stops. FormatJS writes them where the
// engine has none, in the four languages of the app, and leaves an engine that has them as it is.
// Imported first, by the root layout (decision 069).
import "@formatjs/intl-getcanonicallocales/polyfill.js";
import "@formatjs/intl-locale/polyfill.js";
import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-pluralrules/locale-data/fr.js";
import "@formatjs/intl-pluralrules/locale-data/es.js";
import "@formatjs/intl-pluralrules/locale-data/pt.js";
import "@formatjs/intl-relativetimeformat/polyfill.js";
import "@formatjs/intl-relativetimeformat/locale-data/en.js";
import "@formatjs/intl-relativetimeformat/locale-data/fr.js";
import "@formatjs/intl-relativetimeformat/locale-data/es.js";
import "@formatjs/intl-relativetimeformat/locale-data/pt.js";
import "@formatjs/intl-listformat/polyfill.js";
import "@formatjs/intl-listformat/locale-data/en.js";
import "@formatjs/intl-listformat/locale-data/fr.js";
import "@formatjs/intl-listformat/locale-data/es.js";
import "@formatjs/intl-listformat/locale-data/pt.js";
