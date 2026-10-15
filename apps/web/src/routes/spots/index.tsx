import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { CountriesHub } from "@/components/spot-pages/hubs";
import { SpotClosed, SpotNotFound } from "@/components/spot-pages/spot-frame";
import { fetchCountries } from "@/lib/pages-api";
import { SPOTS_ROOT } from "@/lib/public-pages";
import { m } from "@/paraglide/messages.js";

import { closedHead, closedHeaders, hubHead, loadPage } from "./-loading";

// The countries that hold a listed surf break: the first hub, where the path from the landing to
// a break begins. Decision 057.
export const Route = createFileRoute("/spots/")({
  loader: () => loadPage((site) => fetchCountries(site)),
  headers: ({ loaderData }) => closedHeaders(loaderData),
  head: ({ loaderData }) => {
    if (!loaderData || loaderData.closed) return closedHead();
    return hubHead(loaderData.site, SPOTS_ROOT, {
      title: m.page_countries_title(),
      description: m.page_countries_description({ app: APP_NAME }),
      crumbs: [],
    });
  },
  component: Countries,
  notFoundComponent: SpotNotFound,
});

function Countries() {
  const loaded = Route.useLoaderData();
  if (!loaded || loaded.closed) return <SpotClosed />;
  return <CountriesHub countries={loaded.data} />;
}
