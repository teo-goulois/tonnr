import { createFileRoute, redirect } from "@tanstack/react-router";

// The address an account's link is sent by: short, and the same whatever the map's own address
// becomes. It opens the map, with whose link it is and what it makes. Decision 041.
export const Route = createFileRoute("/i/$token")({
  // The address is the link itself: no search engine lists it, and no other site is told.
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app", search: { invite: params.token } });
  },
});
