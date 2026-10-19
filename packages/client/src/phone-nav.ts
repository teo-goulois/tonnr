// The bar a phone goes from one screen of the product to another by: decision 040. The map is
// one of its tabs, and each of the others is a panel of the map that a phone shows whole.

export const PHONE_TABS = ["map", "saved", "alerts", "account"] as const;
export type PhoneTab = (typeof PHONE_TABS)[number];
/** A panel that is a tab's screen on a phone, and a drawer beside the map on a wide screen. */
export type TabPanel = Exclude<PhoneTab, "map">;

/** What the bar reads of an address of the product. */
type AppSearch = {
  panel?: string;
  station?: string;
  break?: string;
  spot?: string;
  list?: string;
  shared?: string;
};

export function isTabPanel(panel: string | undefined): panel is TabPanel {
  return panel === "saved" || panel === "alerts" || panel === "account";
}

/**
 * The tab an address shows. Whatever is selected is read on the map, and so is the panel that
 * adds a spot: an address that names a selection and a tab's panel shows the selection.
 */
export function tabOf(search: AppSearch): PhoneTab {
  if (search.station || search.break || search.spot) return "map";
  return isTabPanel(search.panel) ? search.panel : "map";
}

/**
 * The address a tab leads to. The list the map shows alone stays, by its id or by its link. The
 * map comes back as it was left. Another tab opens on its first screen, with nothing selected.
 */
export function tabSearch<Search extends AppSearch>(tab: PhoneTab, previous: Search) {
  if (tab === "map") {
    return { ...previous, panel: undefined, alerts: undefined, settings: undefined };
  }
  return {
    ...(previous.shared
      ? { shared: previous.shared }
      : previous.list
        ? { list: previous.list }
        : {}),
    panel: tab,
  };
}
