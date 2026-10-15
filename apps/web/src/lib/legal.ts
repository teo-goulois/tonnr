import { CONTACT_EMAIL } from "@repo/config/app";

import { m } from "@/paraglide/messages.js";

/**
 * Who publishes this instance, who hosts it and who processes its data: what `/legal` and
 * `/privacy` name. They are the facts of Téo's instance. Whoever hosts another one writes their
 * own here, and reads the three legal texts again, since what they promise is theirs to write.
 */
export const PUBLISHER = {
  name: "Téo Goulois",
  email: CONTACT_EMAIL,
};

/** What each host holds: the web app, or the API with its database and its worker. */
export type Hosted = "web" | "api";

export const HOSTS: { hosts: Hosted; name: string; address: string; phone?: string }[] = [
  {
    hosts: "web",
    name: "Cloudflare, Inc.",
    address: "101 Townsend St, San Francisco, CA 94107, United States",
    phone: "+1 650 319 8930",
  },
  {
    hosts: "api",
    name: "Scaleway SAS",
    address: "8 rue de la Ville-l'Évêque, 75008 Paris, France",
  },
];

/**
 * Whoever receives personal data from the instance or from a reader's browser, what for, and
 * where, when it is known. A provider that the instance starts or stops calling changes here.
 */
export const RECIPIENTS: {
  name: string | (() => string);
  does: () => string;
  where?: () => string;
}[] = [
  { name: "Cloudflare", does: m.privacy_does_web, where: m.privacy_where_us },
  { name: "Scaleway", does: m.privacy_does_api, where: m.privacy_where_france },
  { name: "Unosend", does: m.privacy_does_mail, where: m.privacy_where_us },
  { name: "PostHog", does: m.privacy_does_analytics, where: m.privacy_where_eu },
  { name: "Umami", does: m.privacy_does_audience },
  { name: "Google", does: m.privacy_does_google, where: m.privacy_where_us },
  { name: "komoot (Photon)", does: m.privacy_does_search, where: m.privacy_where_germany },
  { name: "OpenFreeMap", does: m.privacy_does_tiles },
  { name: "Copernicus Marine", does: m.privacy_does_sea, where: m.privacy_where_eu },
  { name: m.privacy_push_services, does: m.privacy_does_push },
];
