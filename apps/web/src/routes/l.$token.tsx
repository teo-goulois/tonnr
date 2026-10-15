import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";
import { useEffect } from "react";

import { AppPending } from "@/components/shared/app-pending";
import { SHARED_PICTURE, listPicturePath } from "@/lib/public-pages";
import { apiOrigin, siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";
import { getLocale, localizeHref } from "@/paraglide/runtime.js";

import { ENV } from "../env.public";

// The address a shared list is sent by: short, and the same whatever the map's own address
// becomes. It opens the map with that list alone, and its panel.
//
// The server renders it, for the sites a link is sent through: they read no script, and show the
// link by its title, which names the list and whoever shares it, and its picture. A list that asks
// for a password says who shares it, and not its name. A browser goes on to the map at once.
export const Route = createFileRoute("/l/$token")({
  beforeLoad: ({ params }) => {
    if (typeof window !== "undefined") throw redirect(toMap(params.token));
  },
  loader: async ({ params }) => ({
    site: siteOrigin(),
    list: await listOf(params.token),
  }),
  head: ({ loaderData, params }) => {
    const site = loaderData?.site ?? "";
    const list = loaderData?.list;
    const locale = getLocale();
    const title = titleOf(list ?? null);
    const description = m.list_picture_text();
    return {
      meta: [
        { title },
        { name: "description", content: description },
        // The address is the key to the list: no search engine lists it, and no other site is told.
        { name: "robots", content: "noindex" },
        { name: "referrer", content: "no-referrer" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: APP_NAME },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: `${site}${localizeHref(`/l/${params.token}`, { locale })}` },
        { property: "og:image", content: `${site}${listPicturePath(locale)}` },
        { property: "og:image:width", content: String(SHARED_PICTURE.width) },
        { property: "og:image:height", content: String(SHARED_PICTURE.height) },
        { property: "og:image:alt", content: m.list_picture_alt({ name: APP_NAME }) },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: Shared,
});

function toMap(token: string) {
  return { to: "/app", search: { shared: token, panel: "saved" } } as const;
}

// The page the server sent, for the moment the browser takes to go on to the map.
function Shared() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ ...toMap(token), replace: true });
  }, [navigate, token]);
  return <AppPending />;
}

type Sent = { name: string | null; owner: string | null };

function titleOf(list: Sent | null) {
  if (list?.owner && list.name) return m.list_meta_title({ username: list.owner, list: list.name });
  if (list?.owner) return m.list_meta_title_locked({ username: list.owner });
  if (list?.name) return m.list_meta_title_unsigned({ list: list.name, name: APP_NAME });
  return m.list_picture_title();
}

/**
 * The list's name and its owner's username, as the API answers whoever has the link: a list that
 * asks for a password gives no name. Null for a link that opens nothing, or that the API did not
 * answer.
 */
async function listOf(token: string): Promise<Sent | null> {
  try {
    const response = await fetch(`${apiOrigin(ENV.VITE_SERVER_URL)}/v1/shared/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const opened = (await response.json()) as {
      locked?: unknown;
      owner?: unknown;
      list?: { name?: unknown; isDefault?: unknown };
    };
    const owner = typeof opened.owner === "string" ? opened.owner : null;
    if (opened.locked !== false || typeof opened.list?.name !== "string")
      return { name: null, owner };
    return {
      // The favorites are called by a label of their own, in the reader's language.
      name: opened.list.isDefault === true ? m.saved_favorites() : opened.list.name,
      owner,
    };
  } catch {
    return null;
  }
}
