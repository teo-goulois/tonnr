import type { ListView } from "@repo/client/viewer/types";
import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";

import { AccountPrompt } from "@/components/auth/account-prompt";
import type { PlaceActions } from "@/components/saved/place-actions";
import { PlaceRows } from "@/components/saved/place-section";
import { useSavedPlaces } from "@/components/saved/use-saved-places";
import { Button } from "@/components/ui/button";
import { Row, Section } from "@/components/ui/list";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { heldBy, refsOf } from "./items";

// One list alone, as the web's `ListPanel` shows it in the saved tab while the map shows nothing
// else: the chips that go to another list or back to all of them, then what it holds, its spots
// first, its breaks, then its stations, with no X, since a list is changed from the whole tab.
// Under the rows, whether the reports at its breaks are told to the reader (decision 068), then
// what its reader does with it: its owner shares it, an account that kept it lets go of it, and
// whoever opened it by its link keeps it, or is asked for an account first (decision 035).

type ListPanelProps = {
  list: ListView;
  /** The time a station's reading is read against. */
  now: number;
  actions: PlaceActions;
  /** The row of the account's lists, drawn first: none for a list opened by its link. */
  chips?: ReactNode;
  /** Whether the reports at its breaks are told to the reader, and what changes it. */
  reports?: { on: boolean; onChange: (on: boolean) => void } | undefined;
  /** Its owner opens what shares it. */
  onShare?: () => void;
  /** An account that kept it lets go of it. */
  onLeave?: () => void;
  leaving?: boolean;
  /** A list opened by its link: an account keeps it, a visitor is asked for one first. */
  keep?: { signedIn: boolean; onKeep: () => void; keeping: boolean; next: Href } | undefined;
  /** Holds the link for each place's call, for a visitor who reads the list by it. */
  hold?: (() => () => void) | undefined;
};

export function ListPanel({
  list,
  now,
  actions,
  chips,
  reports,
  onShare,
  onLeave,
  leaving = false,
  keep,
  hold,
}: ListPanelProps) {
  const { space } = useTheme();
  const rows = useSavedPlaces(refsOf(heldBy(list)), {
    spots: new Map(list.spots.map((spot) => [spot.id, spot.name])),
    spotsKnown: true,
    hold,
  });
  const size = list.stationIds.length + list.breakIds.length + list.spots.length;
  const owner = list.access === "owner";

  return (
    <View style={{ gap: space.l }}>
      {chips}
      {size === 0 ? (
        <Text tone="muted">{m.saved_list_empty()}</Text>
      ) : (
        <PlaceRows
          rows={rows}
          now={now}
          // A spot of the owner's list is the owner's own, to set an alert on: decision 064.
          contextOf={(item) => ({ ownSpot: owner && item.ref.kind === "spot" })}
          actions={actions}
        />
      )}

      {reports && list.access !== "link" ? (
        <Section plain>
          <Row
            title={m.list_reports()}
            description={m.list_reports_hint()}
            toggle={{ value: reports.on, onChange: reports.onChange }}
          />
        </Section>
      ) : null}
      {owner && onShare ? (
        <View style={{ alignItems: "flex-start" }}>
          <Button variant="secondary" onPress={onShare}>
            {m.share_action()}
          </Button>
        </View>
      ) : null}
      {list.access === "member" && onLeave ? (
        <View style={{ alignItems: "flex-start", gap: space.xs }}>
          <Text size="s" tone="muted">
            {m.list_kept()}
          </Text>
          <Button variant="ghost" onPress={onLeave} loading={leaving}>
            {m.list_leave()}
          </Button>
        </View>
      ) : null}
      {list.access === "link" && keep ? (
        keep.signedIn ? (
          <View style={{ alignItems: "flex-start", gap: space.xs }}>
            <Text size="s" tone="muted">
              {m.list_keep_text()}
            </Text>
            <Button variant="secondary" onPress={keep.onKeep} loading={keep.keeping}>
              {m.list_keep()}
            </Button>
          </View>
        ) : (
          <AccountPrompt text={m.list_account_prompt()} next={keep.next} />
        )
      ) : null}
    </View>
  );
}
