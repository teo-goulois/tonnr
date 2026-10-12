import { APP_NAME } from "@repo/config/app";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { ChevronDownIcon, CopyIcon, ShareIcon } from "@repo/ui/icon";
import { useState } from "react";
import { toast } from "sonner";

import { UsernameForm } from "@/components/account/username-form";
import { m } from "@/paraglide/messages.js";

import { readContribution } from "../guides/contributions-panel";
import { Username } from "../guides/rank";
import type { Friend } from "../viewer/types";
import { QrCode } from "./qr-code";
import type { Friending } from "./types";

type FriendsPanelProps = {
  // The account's username. Null for one that has chosen none: it has no link to give yet.
  username: string | null | undefined;
  onUsernameSave: (username: string) => Promise<string | undefined>;
  friending: Friending;
  // Opens the guide of the break a friend wrote of.
  onOpenBreak: (breakId: string) => void;
};

/** The link an account gives: its code for a camera, and what sends it. */
function OwnLink({ link, friending }: { link: string; friending: Friending }) {
  // A browser that shares hands the link to the phone's own sheet: a message, a nearby phone.
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(m.friends_link_copied());
    } catch {
      toast.error(m.friends_link_copy_failed());
    }
  }
  function share() {
    // Whoever closes the sheet without sending has done nothing wrong.
    void navigator
      .share({ title: APP_NAME, text: m.friends_share_text({ name: APP_NAME }), url: link })
      .catch(() => {});
  }

  return (
    <div className="grid gap-s">
      <QrCode
        text={link}
        label={m.friends_qr_label()}
        className="size-40 justify-self-center rounded-(--radius-xs)"
      />
      <div className="flex flex-wrap gap-xs">
        {canShare && (
          <Button size="sm" onClick={share}>
            <ShareIcon data-slot="icon" aria-hidden />
            {m.friends_link_share()}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => void copy()}>
          <CopyIcon data-slot="icon" aria-hidden />
          {m.friends_link_copy()}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          isPending={friending.isRenewing}
          onClick={friending.onRenew}
        >
          {m.friends_link_renew()}
        </Button>
      </div>
    </div>
  );
}

/** One friend: who they are, and under their name what they wrote and what ends the friendship. */
function FriendRow({
  friend,
  friending,
  onOpenBreak,
}: {
  friend: Friend;
  friending: Friending;
  onOpenBreak: (breakId: string) => void;
}) {
  const [isEnding, setEnding] = useState(false);
  const isOpen = friending.opened?.id === friend.id;
  const detail = isOpen ? friending.opened?.detail : undefined;

  return (
    <li className="grid gap-xs">
      <button
        type="button"
        aria-expanded={isOpen}
        className="focus-ring -mx-xs flex min-h-11 cursor-pointer items-center justify-between gap-s rounded-(--radius-xs) px-xs text-left outline-none hover:bg-neutral-3-transparent"
        onClick={() => {
          setEnding(false);
          friending.onOpen(isOpen ? undefined : friend.id);
        }}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-xs gap-y-xxs">
          {friend.username ? (
            <Username name={friend.username} rank={friend.rank} className="font-medium" />
          ) : (
            <span className="truncate font-medium">{m.friends_no_name()}</span>
          )}
          {friend.sponsored && (
            <Badge variant={friend.sponsored === "counted" ? "success" : "neutral"}>
              {friend.sponsored === "counted"
                ? m.friends_sponsored_counted()
                : m.friends_sponsored_waiting()}
            </Badge>
          )}
        </span>
        <ChevronDownIcon
          data-slot="icon"
          aria-hidden
          className={
            isOpen
              ? "shrink-0 rotate-180 text-neutral-7 transition-transform motion-reduce:transition-none"
              : "shrink-0 text-neutral-7 transition-transform motion-reduce:transition-none"
          }
        />
      </button>
      {isOpen && (
        <div className="grid gap-s pb-xs">
          {!detail?.data ? (
            detail?.isError ? (
              <p className="text-s text-neutral-7">{m.friends_failed()}</p>
            ) : (
              <Skeleton className="h-5 w-full" />
            )
          ) : detail.data.contributions.length === 0 ? (
            <p className="text-s text-neutral-7">{m.friends_contributions_empty()}</p>
          ) : (
            <ul className="grid gap-s">
              {detail.data.contributions.map((one) => {
                const { label, value } = readContribution(one);
                const place = one.break;
                return (
                  <li key={one.id} className="grid gap-xxs text-s">
                    <div className="flex flex-wrap items-baseline gap-x-xs">
                      {place ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-xs max-w-full truncate px-xs font-medium"
                          onClick={() => onOpenBreak(place.id)}
                        >
                          {place.name}
                        </Button>
                      ) : (
                        <span className="text-neutral-7">{m.contribution_break_gone()}</span>
                      )}
                      <span className="text-neutral-7">{label}</span>
                    </div>
                    {value && <div className="break-words">{value}</div>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap gap-xs">
            {isEnding ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  isPending={friending.isRemoving}
                  onClick={() => friending.onRemove(friend.id)}
                >
                  {m.friends_remove_confirm()}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={friending.isRemoving}
                  onClick={() => setEnding(false)}
                >
                  {m.action_cancel()}
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setEnding(true)}>
                {m.friends_remove()}
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * The link an account gives to whoever it wants as a friend, and the friends it made: who they
 * are, what they wrote in the guides, and what ends a friendship. A friend is read by a
 * username, a rank and contributions, and by nothing else. Decision 041.
 */
export function FriendsPanel({
  username,
  onUsernameSave,
  friending,
  onOpenBreak,
}: FriendsPanelProps) {
  const friends = friending.friends.data;

  return (
    <div className="grid gap-l">
      <section className="grid gap-s">
        <h2 className="text-s font-medium text-neutral-7">{m.friends_link_title()}</h2>
        <p className="text-s text-neutral-7">{m.friends_link_text()}</p>
        {username === null ? (
          <div className="grid gap-xs">
            <p className="text-s">{m.friends_username_first()}</p>
            <UsernameForm current={null} onSave={onUsernameSave} onSaved={() => {}} />
          </div>
        ) : friending.link ? (
          <OwnLink link={friending.link} friending={friending} />
        ) : (
          <Skeleton className="size-40 justify-self-center" />
        )}
      </section>

      <section className="grid gap-s">
        <h2 className="text-s font-medium text-neutral-7">{m.friends_list_title()}</h2>
        {!friends ? (
          friending.friends.isError ? (
            <p className="text-s text-neutral-7">{m.friends_failed()}</p>
          ) : (
            <Skeleton className="h-11 w-full" />
          )
        ) : friends.length === 0 ? (
          <p className="text-s text-neutral-7">{m.friends_empty()}</p>
        ) : (
          <ul className="grid gap-xxs">
            {friends.map((friend) => (
              <FriendRow
                key={friend.id}
                friend={friend}
                friending={friending}
                onOpenBreak={onOpenBreak}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
