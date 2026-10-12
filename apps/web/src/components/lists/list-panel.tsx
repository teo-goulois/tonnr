import { Button } from "@repo/ui/components/ui/button";

import { m } from "@/paraglide/messages.js";

import {
  AccountPrompt,
  BreakRow,
  SpotRow,
  StationRow,
  StationRowSkeleton,
} from "../viewer/saved-panel";
import type { JoinedList, ListView, SavedBreak, SavedList, Station } from "../viewer/types";
import { ListChips } from "./list-chips";

type ListPanelProps = {
  now: number;
  list: ListView;
  // The stations and the surf breaks the list names, by id. One that is still loading is missing.
  stations: Map<string, Station>;
  breaks: Map<string, SavedBreak>;
  onSelect: (stationId: string) => void;
  onSelectBreak: (breakId: string) => void;
  onSelectSpot: (spotId: string) => void;
  signedIn: boolean;
  // An account that opened the list by its link keeps it among its lists.
  onKeep?: () => void;
  isKeeping: boolean;
  // An account that kept the list lets go of it.
  onLeave?: () => void;
  // The owner opens what shares the list.
  onShare?: () => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
  // The account's lists and those it kept, to go from this one to another, or back to all.
  // None for a visitor, who has this list alone.
  lists: SavedList[];
  joined: JoinedList[];
  onPick: ((listId: string | undefined) => void) | undefined;
};

/**
 * One list alone, beside the map that shows nothing else: its owner's, one that was kept, or one
 * opened by its link. Whoever does not own it reads it, and changes nothing.
 */
export function ListPanel({
  now,
  list,
  stations,
  breaks,
  onSelect,
  onSelectBreak,
  onSelectSpot,
  signedIn,
  onKeep,
  isKeeping,
  onLeave,
  onShare,
  onSignIn,
  onCreateAccount,
  lists,
  joined,
  onPick,
}: ListPanelProps) {
  const size = list.stationIds.length + list.breakIds.length + list.spots.length;

  return (
    <div className="grid gap-l">
      {onPick && (
        <ListChips
          lists={lists}
          joined={joined}
          // A list opened by its link is none of the account's until it is kept.
          current={list.access === "link" ? undefined : list.id}
          onPick={onPick}
        />
      )}
      {size === 0 ? (
        <p className="text-neutral-7">{m.saved_list_empty()}</p>
      ) : (
        <ul className="-mx-xs grid gap-xxs">
          {list.spots.map((spot) => (
            <SpotRow key={spot.id} spot={spot} onSelect={() => onSelectSpot(spot.id)} />
          ))}
          {list.breakIds.map((breakId) => {
            const found = breaks.get(breakId);
            return found ? (
              <BreakRow key={breakId} found={found} onSelect={() => onSelectBreak(breakId)} />
            ) : (
              <StationRowSkeleton key={breakId} />
            );
          })}
          {list.stationIds.map((stationId) => {
            const station = stations.get(stationId);
            return station ? (
              <StationRow
                key={stationId}
                station={station}
                now={now}
                onSelect={() => onSelect(stationId)}
              />
            ) : (
              <StationRowSkeleton key={stationId} />
            );
          })}
        </ul>
      )}

      {list.access === "owner" && onShare && (
        <div>
          <Button variant="secondary" onClick={onShare}>
            {m.share_action()}
          </Button>
        </div>
      )}
      {list.access === "member" && onLeave && (
        <div className="grid justify-items-start gap-xs">
          <p className="text-s text-neutral-7">{m.list_kept()}</p>
          <Button variant="ghost" size="sm" onClick={onLeave}>
            {m.list_leave()}
          </Button>
        </div>
      )}
      {list.access === "link" &&
        (signedIn ? (
          onKeep && (
            <div className="grid justify-items-start gap-xs">
              <p className="text-s text-neutral-7">{m.list_keep_text()}</p>
              <Button variant="secondary" isPending={isKeeping} onClick={onKeep}>
                {m.list_keep()}
              </Button>
            </div>
          )
        ) : (
          <AccountPrompt
            text={m.list_account_prompt()}
            onSignIn={onSignIn}
            onCreateAccount={onCreateAccount}
          />
        ))}
    </div>
  );
}
