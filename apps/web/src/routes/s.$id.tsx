import { createFileRoute, redirect } from "@tanstack/react-router";

// The address a station is sent by: short, and the same whatever the map's own address becomes.
// It opens the map on the station's panel.
export const Route = createFileRoute("/s/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app", search: { station: params.id } });
  },
});
