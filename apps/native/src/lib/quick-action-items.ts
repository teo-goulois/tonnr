import { m } from "@/paraglide/messages";

import type { Route } from "./links";

// The quick actions of the app's icon, on both systems: log a session, a new alert, search
// (decision 074). Each opens its route, as the "+" and the map's search do. A module that reads
// no phone, so that a test reads it.

export type QuickAction = {
  id: string;
  title: string;
  /** An SF Symbol on iOS. Android draws none until the app has drawables of its own for them. */
  icon: string;
  params: { href: Route };
};

/** The actions, in the app's language, in the order a long press on the icon shows them. */
export function quickActionItems(): QuickAction[] {
  return [
    {
      id: "session",
      title: m.native_push_log_session(),
      icon: "symbol:figure.surfing",
      params: { href: "/session/new" },
    },
    {
      id: "alert",
      title: m.alert_new(),
      icon: "symbol:bell.badge",
      params: { href: "/alert/new" },
    },
    { id: "search", title: m.search_title(), icon: "search", params: { href: "/search" } },
  ];
}
