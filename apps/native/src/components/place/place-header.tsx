import type { Spot } from "@repo/client/viewer/types";
import {
  BookmarkFillIcon,
  BookmarkIcon,
  LockIcon,
  MoreHorizontalIcon,
  PinPlusIcon,
  XIcon,
} from "@repo/ui/icon";
import type { ReactNode } from "react";
import { View } from "react-native";

import { useOpenPage } from "@/components/account/open-page";
import { Glyph } from "@/components/shared/glyph";
import { IconButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { type Freshness, formatAgo, freshnessOf } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatDistance, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import type { PlaceRecord } from "./use-place";

// The head of a place's sheet, as the web's drawer heads a panel: the name, what the place is
// and, for a spot, whether it is private or public (decision 034), how far it stands from the
// reader, then its buttons, drawn as the web's ghost buttons: the bookmark that keeps it in
// lists, the menu of what is seldom done with it, what copies a spot read in a shared list, and
// last what closes the sheet.

/** How recent a station's reading is: a dot, which the words beside it say too. */
function FreshnessDot({ freshness }: { freshness: Freshness }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor:
          freshness === "fresh"
            ? colors.success
            : freshness === "aging"
              ? colors.warning
              : colors["neutral-6"],
      }}
    />
  );
}

/** What a spot says under its name: whose it is, and what became of a request to publish it. */
function spotLine(spot: Spot): { text: string; locked: boolean } {
  if (!spot.isOwner) return { text: m.spot_shared(), locked: false };
  const status = spot.publication?.status;
  if (status === "pending") return { text: m.spot_pending(), locked: false };
  if (status === "accepted") return { text: m.spot_accepted(), locked: false };
  if (status === "refused") {
    return { text: m.spot_refused({ reason: spot.publication?.reason ?? "" }), locked: true };
  }
  return { text: m.spot_own(), locked: true };
}

export function PlaceHeader({
  record,
  now,
  distanceKm,
  isSaved,
  onSave,
  onMenu,
  onCopy,
  isCopying = false,
  onClose,
}: {
  record: PlaceRecord;
  now: number;
  distanceKm: number | undefined;
  isSaved: boolean;
  // Undefined where nothing can be saved: a spot of someone else's, which is copied instead.
  onSave?: () => void;
  onMenu?: () => void;
  onCopy?: () => void;
  isCopying?: boolean;
  onClose: () => void;
}) {
  useUnits();
  const { colors, space } = useTheme();
  const { openAddress } = useOpenPage();
  const { kind, name, found, station, spot, isPending, isError } = record;

  const away =
    distanceKm === undefined ? undefined : m.page_away({ distance: formatDistance(distanceKm) });
  let line: ReactNode = null;
  if (kind === "break" && found) {
    const source = found.source.url;
    line = source ? (
      <Text
        size="s"
        tone="muted"
        accessibilityRole="link"
        onPress={() => void openAddress(source)}
        style={{ textDecorationLine: "underline" }}
      >
        {m.break_from_catalogue()}
      </Text>
    ) : (
      <Text size="s" tone="muted">
        {m.break_title()}
      </Text>
    );
  } else if (kind === "station" && station) {
    const reading = record.history.data?.readings[0];
    const observedAt = reading?.observedAt;
    line = (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" }}>
        <Text size="s" tone="muted">
          {station.measures.includes("waves") ? m.native_kind_buoy() : m.native_kind_wind_station()}
        </Text>
        <FreshnessDot freshness={freshnessOf(observedAt, now)} />
        <Text size="s" tone="muted">
          {observedAt ? formatAgo(observedAt, now) : m.station_no_recent_reading()}
        </Text>
      </View>
    );
  } else if (kind === "spot" && spot) {
    const said = spotLine(spot);
    line = (
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xxs }}>
        {said.locked && (
          <View style={{ paddingTop: 3 }}>
            <Glyph icon={LockIcon} size={13} color={colors["neutral-7"]} />
          </View>
        )}
        <Text size="s" tone="muted" style={{ flexShrink: 1 }}>
          {said.text}
        </Text>
      </View>
    );
  }

  const title =
    name ??
    (isError
      ? kind === "break"
        ? m.break_title()
        : kind === "spot"
          ? m.spot_title()
          : m.native_kind_buoy()
      : undefined);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space.xs,
        // Room over it for the grabber that the platform draws at the top of the sheet.
        paddingTop: space.m,
        paddingHorizontal: space.m,
        paddingBottom: space.xs,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: space.xxs }}>
        {title === undefined ? (
          <Skeleton height={24} width="60%" />
        ) : (
          <Text size="l" weight="medium" accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
        )}
        {isPending && !line ? <Skeleton height={14} width="40%" /> : line}
        {away && (
          <Text size="s" tone="muted" numeric>
            {away}
          </Text>
        )}
      </View>
      {onSave && (
        <IconButton
          variant="ghost"
          icon={isSaved ? BookmarkFillIcon : BookmarkIcon}
          label={m.saved_add_to_list()}
          selected={isSaved}
          onPress={onSave}
        />
      )}
      {onMenu && (
        <IconButton
          variant="ghost"
          icon={MoreHorizontalIcon}
          label={m.spot_menu({ name: name ?? m.spot_title() })}
          onPress={onMenu}
        />
      )}
      {onCopy && (
        <IconButton
          variant="ghost"
          icon={PinPlusIcon}
          label={m.spot_copy({ name: name ?? m.spot_title() })}
          loading={isCopying}
          onPress={onCopy}
        />
      )}
      <IconButton variant="ghost" icon={XIcon} label={m.action_close()} onPress={onClose} />
    </View>
  );
}
