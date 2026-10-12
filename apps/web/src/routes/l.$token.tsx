import { createFileRoute, redirect } from "@tanstack/react-router";

// The address a shared list is sent by: short, and the same whatever the map's own address
// becomes. It opens the map with that list alone, and its panel.
export const Route = createFileRoute("/l/$token")({
  // The address is the key to the list: no search engine lists it, and no other site is told.
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app", search: { shared: params.token, panel: "saved" } });
  },
});
