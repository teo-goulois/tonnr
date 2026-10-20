import { useState } from "react";
import { ScrollView, View } from "react-native";

import { Row, Section } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { SheetHeader, SheetRoot, useSheetGuard } from "@/components/ui/sheet";
import { useTell } from "@/components/ui/toast";
import { useTheme } from "@/lib/theme";

// A form sheet of the design system: two settings that make it hold what changed, the header
// that cancels and saves, over a scroll view in a SheetRoot, and the guard that asks before a
// swipe, Cancel or Android's back loses it.

type Settings = { unit: "m" | "ft"; push: boolean };
const SAVED: Settings = { unit: "m", push: true };

export function SampleSheet() {
  const { colors, space } = useTheme();
  const tell = useTell();
  const [settings, setSettings] = useState(SAVED);
  const [saving, setSaving] = useState(false);
  const dirty = settings.unit !== SAVED.unit || settings.push !== SAVED.push;
  const { close, cancel } = useSheetGuard(dirty);

  // The header stands over the scroll view, which SheetRoot keeps where the sheet lays it out.
  return (
    <SheetRoot style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}>
      <SheetHeader
        title="Sample settings"
        onCancel={cancel}
        canSave={dirty}
        saving={saving}
        onSave={() => {
          setSaving(true);
          setTimeout(() => {
            setSaving(false);
            tell({ title: "Saved", tone: "success" });
            close();
          }, 800);
        }}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: space.l, paddingBottom: space.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: space.l, paddingHorizontal: space.m }}>
          <Section title="Height">
            <Row title="Unit" value={settings.unit === "m" ? "Meters" : "Feet"} />
          </Section>
          <Segmented
            label="Height"
            fill
            options={[
              { value: "m", label: "Meters" },
              { value: "ft", label: "Feet" },
            ]}
            value={settings.unit}
            onChange={(unit) => setSettings((now) => ({ ...now, unit }))}
          />
          <Section footer="Change something, then leave without saving: the sheet asks first.">
            <Row
              title="Push on this phone"
              toggle={{
                value: settings.push,
                onChange: (push) => setSettings((now) => ({ ...now, push })),
              }}
            />
          </Section>
        </View>
      </ScrollView>
    </SheetRoot>
  );
}
