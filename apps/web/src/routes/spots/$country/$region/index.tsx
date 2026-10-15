import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { RegionHub } from "@/components/spot-pages/hubs";
import { SpotClosed, SpotNotFound } from "@/components/spot-pages/spot-frame";
import { fetchRegion } from "@/lib/pages-api";
import { SPOTS_ROOT } from "@/lib/public-pages";
import { m } from "@/paraglide/messages.js";

import { closedHead, closedHeaders, hubHead, loadPage } from "../../-loading";

// The listed surf breaks of a region, each with a line on what it is like. Decision 057.
export const Route = createFileRoute("/spots/$country/$region/")({
  loader: ({ params }) => loadPage((site) => fetchRegion(params.country, params.region, site)),
  headers: ({ loaderData }) => closedHeaders(loaderData),
  head: ({ loaderData, params }) => {
    if (!loaderData || loaderData.closed) return closedHead();
    const region = loaderData.data;
    return hubHead(loaderData.site, `${SPOTS_ROOT}/${params.country}/${params.region}`, {
      title: m.page_hub_title({ name: region.name }),
      description: m.page_hub_description({
        count: region.breaks.length,
        name: region.name,
        app: APP_NAME,
      }),
      crumbs: [
        { name: m.page_spots(), page: SPOTS_ROOT },
        { name: region.country.name, page: region.country.page },
      ],
    });
  },
  component: Region,
  notFoundComponent: SpotNotFound,
});

function Region() {
  const loaded = Route.useLoaderData();
  if (!loaded || loaded.closed) return <SpotClosed />;
  return <RegionHub region={loaded.data} />;
}
