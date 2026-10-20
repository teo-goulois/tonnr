import type { Spot } from "@repo/client/viewer/types";
import { useState } from "react";
import { View } from "react-native";

import { usePlaceRecord } from "@/components/place/use-place";
import { useSpotActions } from "@/components/place/use-spot";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Section } from "@/components/ui/list";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { GuideSkeleton } from "./break-guide";
import { CHARACTERISTIC_FIELDS } from "./characteristic-words";
import { listedRows, measuredRows, useSizeReading } from "./characteristics";
import { PageSheet, usePresented } from "./page-sheet";

// What its owner says a spot is like, the tab of a spot's sheet beside its forecast, as the web's
// `SpotGuide` reads and writes it: read as a break's is, and written by pressing the words that
// apply, in a sheet of its own. Nothing is required, and nothing of it is the catalogue's. A spot
// read in a shared list is read and never written. Decisions 006 and 041.

type Said = Spot["characteristics"];

/** What a spot is like, and what lets its owner describe it. */
export function SpotGuide({ id }: { id: string }) {
  const { space } = useTheme();
  const record = usePlaceRecord("spot", id);
  const sheet = usePresented<Spot>();
  const spot = record.spot;
  const size = useSizeReading(spot?.characteristics.waveSizeMeters ?? null);

  // A spot that is gone, or someone else's, is said so by the sheet's head.
  if (!spot) return record.isError ? null : <GuideSkeleton />;
  const rows = [...listedRows(spot.characteristics), ...measuredRows(spot.characteristics, size)];

  return (
    <View style={{ gap: space.l }}>
      {rows.length > 0 ? (
        <Section title={m.spot_guide_title()}>{rows}</Section>
      ) : (
        <Text size="s" tone="muted" style={{ paddingHorizontal: space.m }}>
          {spot.isOwner ? m.spot_guide_invite() : m.details_guide_empty()}
        </Text>
      )}
      {spot.isOwner ? (
        <Button
          variant="secondary"
          onPress={() => sheet.present(spot)}
          style={{ alignSelf: "flex-start", marginStart: space.m }}
        >
          {rows.length > 0 ? m.spot_guide_edit() : m.spot_guide_describe()}
        </Button>
      ) : null}
      {sheet.shown ? (
        <DescribeSheet
          spot={spot}
          visible={sheet.visible}
          onClose={() => sheet.dismiss()}
          onDismissed={sheet.dismissed}
        />
      ) : null}
    </View>
  );
}

/** The words that apply to a spot, pressed one list at a time, and saved together. */
function DescribeSheet({
  spot,
  visible,
  onClose,
  onDismissed,
}: {
  spot: Spot;
  visible: boolean;
  onClose: () => void;
  onDismissed: () => void;
}) {
  const { space } = useTheme();
  const spots = useSpotActions();
  // What was pressed here, list by list. The rest is what the spot holds now, which follows it
  // if it changes elsewhere meanwhile, and so does what this sheet does not ask for.
  const [changed, setChanged] = useState<Partial<Said>>({});
  const said: Said = { ...spot.characteristics, ...changed };
  const isDirty = Object.keys(changed).length > 0;

  return (
    <PageSheet
      visible={visible}
      title={m.spot_guide_describe()}
      onClose={onClose}
      onDismissed={onDismissed}
      dirty={isDirty}
      onSave={() => spots.describe(spot, said, onClose)}
      saveLabel={m.native_save()}
      canSave={isDirty}
      saving={spots.isChanging}
    >
      <Text size="s" tone="muted">
        {m.spot_guide_hint()}
      </Text>
      {CHARACTERISTIC_FIELDS.map((field) => {
        const pressed: readonly string[] = said[field.key] ?? [];
        return (
          <View key={field.key} style={{ gap: space.xs }}>
            <Text size="s" weight="medium" accessibilityRole="header">
              {field.label()}
            </Text>
            <View
              role="group"
              accessibilityLabel={field.label()}
              style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}
            >
              {field.words.map(({ word, reading }) => (
                <Chip
                  key={word}
                  label={reading()}
                  selected={pressed.includes(word)}
                  disabled={spots.isChanging}
                  onPress={() =>
                    // A list with nothing pressed is one that is not said. Each press adds to
                    // what the others left, however close together they come.
                    setChanged((current) => {
                      const before: readonly string[] =
                        (field.key in current
                          ? current[field.key]
                          : spot.characteristics[field.key]) ?? [];
                      const after = before.includes(word)
                        ? before.filter((one) => one !== word)
                        : [...before, word];
                      return { ...current, [field.key]: after.length > 0 ? after : null };
                    })
                  }
                />
              ))}
            </View>
          </View>
        );
      })}
    </PageSheet>
  );
}
