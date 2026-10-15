import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppPending } from "@/components/shared/app-pending";
import { placeHead, placeNameOf, placeOnMap } from "@/lib/place-links";
import { siteOrigin } from "@/lib/site";

// The address a station is sent by: short, and the same whatever the map's own address becomes.
// It opens the map on its panel.
//
// The server renders it, for the sites a link is sent through: they read no script, and show the
// link by its title, which names the station, and its picture. A browser goes on to the map at once.
export const Route = createFileRoute("/s/$id")({
  beforeLoad: ({ params }) => {
    if (typeof window !== "undefined") throw redirect(placeOnMap("station", params.id));
  },
  loader: async ({ params }) => ({
    site: siteOrigin(),
    name: await placeNameOf("station", params.id),
  }),
  head: ({ loaderData, params }) =>
    placeHead(loaderData?.site ?? "", "station", params.id, loaderData?.name ?? null),
  component: Sent,
});

// The page the server sent, for the moment the browser takes to go on to the map.
function Sent() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ ...placeOnMap("station", id), replace: true });
  }, [navigate, id]);
  return <AppPending />;
}
