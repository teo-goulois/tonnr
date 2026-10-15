import { createFileRoute, redirect } from "@tanstack/react-router";

// The address a surf break is sent by: short, and the same whatever the map's own address
// becomes. It opens the map on the break's panel.
export const Route = createFileRoute("/b/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app", search: { break: params.id } });
  },
});
