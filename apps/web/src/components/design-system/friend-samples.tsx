import { toast } from "sonner";

import { FriendsPanel } from "@/components/friends/friends-panel";
import type { Friending } from "@/components/friends/types";
import type { Friend, FriendDetail } from "@/components/viewer/types";

const SINCE = new Date("2026-10-10T08:00:00Z");

// Invented friends: one that the account brought and that counts for it, one it brought that
// has written nothing yet, one that simply opened its link, and one left without a username.
const FRIENDS: Friend[] = [
  { id: "f-1", username: "maelle_lg", rank: "cs", since: SINCE, sponsored: "counted" },
  { id: "f-2", username: "yann_29", rank: null, since: SINCE, sponsored: "waiting" },
  { id: "f-3", username: "nolwenn", rank: "qs", since: SINCE, sponsored: null },
  { id: "f-4", username: null, rank: null, since: SINCE, sponsored: null },
];

const DETAIL: FriendDetail = {
  id: "f-1",
  username: "maelle_lg",
  rank: "cs",
  since: SINCE,
  sponsored: "counted",
  contributions: [
    {
      id: "c-1",
      break: { id: "b-1", name: "Anse du Phare" },
      line: "access",
      value: "Park at the end of the lighthouse road, then five minutes down the path.",
      language: "en",
      confirmedAt: SINCE,
    },
    {
      id: "c-2",
      break: { id: "b-2", name: "Roche Noire" },
      line: "bottomTypes",
      value: ["rock"],
      language: null,
      confirmedAt: SINCE,
    },
    {
      id: "c-3",
      break: null,
      line: "bestTides",
      value: ["low", "mid_low"],
      language: null,
      confirmedAt: SINCE,
    },
  ],
};

// The page changes nothing: it says what would have been done.
const friendingOf = (friends: Friend[], opened?: string): Friending => ({
  link: "https://tonnr.example/i/Wq3vN8sXc1LbT0yRk2PzAg",
  friends: { data: friends, isPending: false, isError: false },
  opened: opened
    ? { id: opened, detail: { data: DETAIL, isPending: false, isError: false } }
    : undefined,
  onOpen: (id) => toast(id ? `Open ${id}` : "Close"),
  isRenewing: false,
  onRenew: () => toast("New link"),
  isRemoving: false,
  onRemove: (id) => toast(`End ${id}`),
});

const framed = "edge rounded-(--radius-xs) p-m";
const refuseTaken = async () => "This username is taken.";

/** The link of an account and its friends, as each account meets them. */
export function FriendSamples() {
  return (
    <div className="grid gap-m lg:grid-cols-2">
      {/* Friends, one of them open on what they wrote. */}
      <div className={framed}>
        <FriendsPanel
          username="nolwenn"
          onUsernameSave={refuseTaken}
          friending={friendingOf(FRIENDS, "f-1")}
          onOpenBreak={(id) => toast(`Open ${id}`)}
        />
      </div>
      {/* No friend yet. */}
      <div className={framed}>
        <FriendsPanel
          username="nolwenn"
          onUsernameSave={refuseTaken}
          friending={friendingOf([])}
          onOpenBreak={() => {}}
        />
      </div>
      {/* An account with no username has no link to give: it chooses one first. */}
      <div className={framed}>
        <FriendsPanel
          username={null}
          onUsernameSave={refuseTaken}
          friending={{ ...friendingOf([]), link: undefined }}
          onOpenBreak={() => {}}
        />
      </div>
    </div>
  );
}
