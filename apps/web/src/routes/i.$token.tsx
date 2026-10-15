import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";
import { useEffect } from "react";

import { AppPending } from "@/components/shared/app-pending";
import { SHARED_PICTURE, invitePicturePath } from "@/lib/public-pages";
import { apiOrigin, siteOrigin } from "@/lib/site";
import { m } from "@/paraglide/messages.js";
import { getLocale, localizeHref } from "@/paraglide/runtime.js";

import { ENV } from "../env.public";

// The address an account's link is sent by: short, and the same whatever the map's own address
// becomes. It opens the map, with whose link it is and what it makes. Decision 041.
//
// The server renders it, for the sites a link is sent through: they read no script, and show the
// link by the title and the picture of what it answers, which name whose link it is. A browser
// goes on to the map at once.
export const Route = createFileRoute("/i/$token")({
  beforeLoad: ({ params }) => {
    if (typeof window !== "undefined") throw redirect(toMap(params.token));
  },
  loader: async ({ params }) => ({
    site: siteOrigin(),
    username: await ownerOf(params.token),
  }),
  head: ({ loaderData, params }) => {
    const site = loaderData?.site ?? "";
    const username = loaderData?.username;
    const locale = getLocale();
    const title = username
      ? m.invite_meta_title({ username, name: APP_NAME })
      : m.friends_share_text({ name: APP_NAME });
    const description = m.invite_meta_description({ name: APP_NAME });
    return {
      meta: [
        { title },
        { name: "description", content: description },
        // The address is the link itself: no search engine lists it, and no other site is told.
        { name: "robots", content: "noindex" },
        { name: "referrer", content: "no-referrer" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: APP_NAME },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: `${site}${localizeHref(`/i/${params.token}`, { locale })}` },
        { property: "og:image", content: `${site}${invitePicturePath(locale)}` },
        { property: "og:image:width", content: String(SHARED_PICTURE.width) },
        { property: "og:image:height", content: String(SHARED_PICTURE.height) },
        { property: "og:image:alt", content: m.invite_picture_alt({ name: APP_NAME }) },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: Invite,
});

function toMap(token: string) {
  return { to: "/app", search: { invite: token } } as const;
}

// The page the server sent, for the moment the browser takes to go on to the map.
function Invite() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ ...toMap(token), replace: true });
  }, [navigate, token]);
  return <AppPending />;
}

/** The username of the link's owner, as the API answers whoever was given the link. */
async function ownerOf(token: string): Promise<string | null> {
  try {
    const response = await fetch(`${apiOrigin(ENV.VITE_SERVER_URL)}/v1/friends/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const owner = (await response.json()) as { username?: unknown };
    return typeof owner.username === "string" ? owner.username : null;
  } catch {
    return null;
  }
}
