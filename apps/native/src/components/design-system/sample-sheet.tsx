import { View } from "react-native";

import { FormScroll, useSelector } from "@/components/ui/form";
import { PanelHeader, SheetFooter, SheetRoot, useSheetGuard } from "@/components/ui/sheet";
import { useTell } from "@/components/ui/toast";
import { useTheme } from "@/lib/theme";

import { SampleFields, useSampleForm } from "./form-samples";

// A form sheet of the design system, as the web's drawer holds a form: its head with the title
// and the cross, the form in the keyboard's scroll view, and what sends it pinned at its foot.
// The guard asks before a swipe, the cross or Android's back loses what was written.

export function SampleSheet() {
  const { colors, space } = useTheme();
  const tell = useTell();
  const form = useSampleForm((name) => {
    tell({ title: `Saved ${name}`, tone: "success" });
    close();
  });
  const dirty = useSelector(form.store, (state) => state.isDirty && !state.isSubmitted);
  const { close, cancel } = useSheetGuard(dirty);

  // The head stands over the scroll view, which SheetRoot keeps where the sheet lays it out.
  return (
    <SheetRoot style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <form.AppForm>
        <PanelHeader
          title="A sample form"
          description="Send it empty: each field says what is wrong."
          onClose={cancel}
        />
        <FormScroll
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: space.m, paddingBottom: space.xl }}
        >
          <View style={{ gap: space.m }}>
            <SampleFields form={form} />
          </View>
        </FormScroll>
        <SheetFooter pinned>
          <form.SubmitButton fill>Save the spot</form.SubmitButton>
        </SheetFooter>
      </form.AppForm>
    </SheetRoot>
  );
}
