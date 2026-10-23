import { REPORT_MOST_MEDIA, REPORT_NOTE_MOST } from "@repo/config/media";
import type { ImagePickerAsset } from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOpenPage } from "@/components/account/open-page";
import { MediaStrip } from "@/components/media/media-strip";
import { SizesPill, SizesStep } from "@/components/sessions/surf-size";
import { useMediaStatus } from "@/components/sessions/use-sessions";
import { FormScroll, useAppForm, useSelector } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { PanelHeader, useSheetGuard } from "@/components/ui/sheet";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useTheme } from "@/lib/theme";
import { currentUploads, dropUpload, retryUpload, startUploads, useUploads } from "@/lib/uploads";
import { m } from "@/paraglide/messages";

import { EMPTY_REPORT, holdsSomething, isGoingOf, reportSchema, type Sizes } from "./report-values";
import { useBreakReports, useReportWrites } from "./use-reports";

// The form a report is sent from, at a break, as the web's `ReportSheet` draws it on a phone
// (decisions 067 and 076, and 078 for the phone): the web drawer's head, with the break's name,
// then the rules, its photos and videos and how big the waves look in one outlined box, a few
// words, what sending means and the button that sends, which waits while a file goes up. Sent
// with no file that went up whole, the strip says so under itself and takes a screen reader.

type ReportFormProps = {
  breakId: string;
  // The break's name, under the title: null while it is read, which a line pulses in place of.
  name: string | null | undefined;
};

export function ReportForm({ breakId, name }: ReportFormProps) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const tell = useTell();
  const uploads = useUploads();
  const status = useMediaStatus();
  const reports = useBreakReports(breakId);
  const writes = useReportWrites();
  const { openPage } = useOpenPage();
  // How big the waves look is said in a step of the sheet, over the form.
  const [isSizing, setIsSizing] = useState(false);
  // Once the report took its files, they are no longer this form's to let go.
  const isSent = useRef(false);
  // The report on its way, which answers whether it was taken.
  const sending = useRef<Promise<boolean> | null>(null);
  // Leaves the sheet without asking, once the report was taken: the guard is made below, from
  // what the form holds.
  const leave = useRef(() => {});

  const form = useAppForm({
    defaultValues: EMPTY_REPORT,
    validators: { onSubmit: reportSchema(currentUploads) },
    onSubmit: async ({ value }) => {
      const now = currentUploads();
      if (isGoingOf(value.entries, now)) return;
      const send = writes.send(
        breakId,
        {
          uploads: value.entries,
          waveSize: value.sizes.waves,
          setSize: value.sizes.sets,
          note: value.note,
        },
        now,
      );
      sending.current = send;
      const done = await send;
      sending.current = null;
      if (!done) return;
      isSent.current = true;
      leave.current();
    },
  });

  const values = useSelector(form.store, (state) => state.values);
  // The strip's fault stands inside the box, with room under it, as the web's does.
  const isMediaWrong = useSelector(form.store, (state) => {
    const meta = state.fieldMeta.entries;
    return meta !== undefined && meta.isTouched && !meta.isValid;
  });
  const { close, cancel } = useSheetGuard(holdsSomething(values));
  leave.current = close;

  // What was sent from this form and not sent with a report is let go as it closes. Left while
  // the report is on its way, its files wait for the answer: the report keeps them once taken.
  const owned = useRef<string[]>([]);
  owned.current = values.entries;
  useEffect(
    () => () => {
      if (isSent.current) return;
      const keys = owned.current;
      const letGo = () => {
        for (const key of keys) dropUpload(key, true);
      };
      if (sending.current) {
        void sending.current.then((taken) => {
          if (!taken) letGo();
        });
      } else letGo();
    },
    [],
  );

  const isGoing = isGoingOf(values.entries, uploads);
  // An operator stopped the uploads, or the instance keeps no photo: nothing is added.
  const paused = status.data?.paused === true || reports.data?.offered === false;

  /** Starts sending what was chosen, as many as the report still takes: the keys of those that go. */
  function start(assets: ImagePickerAsset[], held: number) {
    const room = Math.max(0, REPORT_MOST_MEDIA - held);
    const { started, refused } = startUploads(assets.slice(0, room), "report");
    for (const file of refused) {
      tell({
        title:
          file.why === "type"
            ? m.media_refused_type({ name: file.name })
            : m.media_refused_size({ name: file.name }),
        tone: "danger",
      });
    }
    return started;
  }

  if (isSizing) {
    return (
      <SizesStep
        waves={values.sizes.waves}
        sets={values.sizes.sets}
        onClose={() => setIsSizing(false)}
        onDone={(waves, sets) => {
          form.setFieldValue("sizes", { waves, sets });
          setIsSizing(false);
        }}
      />
    );
  }

  return (
    <form.AppForm>
      <PanelHeader title={m.report_new()} description={name} onClose={cancel} />
      <FormScroll
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: space.m,
          padding: space.m,
          paddingBottom: insets.bottom + space.xl,
        }}
      >
        <Text size="s" tone="muted">
          {m.report_rules()}
        </Text>

        <Surface variant="outline" insetEdge style={{ overflow: "hidden" }}>
          <form.AppField name="entries">
            {(field) => (
              // What is wrong with the strip is said under it, inside the box, where the web says
              // it: the field's own room is the fault's, and the strip takes the box's.
              <field.Control<string[]>
                gap={0}
                style={{
                  paddingHorizontal: space.s,
                  paddingBottom: isMediaWrong ? space.s : 0,
                }}
              >
                {(control) => {
                  // Sent with no file, the strip's "+" takes a screen reader, with the fault as
                  // its hint, as the web's input takes the focus; where the strip draws none,
                  // paused or full, the line's name does.
                  const adds = !paused && control.value.length < REPORT_MOST_MEDIA;
                  return (
                    <View
                      style={{
                        gap: space.xs,
                        marginHorizontal: -space.s,
                        paddingHorizontal: space.xs,
                        paddingVertical: space.s,
                      }}
                    >
                      <View
                        ref={adds ? undefined : control.focusRef}
                        accessible={!adds}
                        accessibilityLabel={adds ? undefined : m.media_title()}
                        accessibilityHint={adds ? undefined : control.hint}
                        style={{ paddingHorizontal: space.xxs }}
                      >
                        <Text>{m.media_title()}</Text>
                      </View>
                      <MediaStrip
                        purpose="report"
                        entries={control.value.map((key) => ({ upload: key }))}
                        kept={[]}
                        uploads={uploads}
                        disabled={writes.isSending}
                        paused={paused}
                        most={REPORT_MOST_MEDIA}
                        bleed={space.xs}
                        focusRef={adds ? control.focusRef : undefined}
                        accessibilityHint={control.hint}
                        onAdd={(assets) => {
                          const started = start(assets, control.value.length);
                          if (started.length > 0) control.onChange([...control.value, ...started]);
                        }}
                        onRemove={(index) => {
                          const key = control.value[index];
                          if (key) dropUpload(key, true);
                          control.onChange(control.value.filter((_, at) => at !== index));
                        }}
                        onRetry={retryUpload}
                      />
                    </View>
                  );
                }}
              </field.Control>
            )}
          </form.AppField>
          <Separator />
          <form.AppField name="sizes">
            {(field) => (
              <field.Control<Sizes>
                label={m.surf_size_title()}
                layout="inline"
                gap={space.xxs}
                style={{
                  minHeight: 56,
                  justifyContent: "center",
                  paddingHorizontal: space.s,
                  paddingVertical: space.xs,
                }}
              >
                {(control) => (
                  <SizesPill
                    ref={control.focusRef}
                    waves={control.value.waves}
                    sets={control.value.sets}
                    onPress={() => setIsSizing(true)}
                    disabled={writes.isSending}
                    accessibilityHint={control.hint}
                  />
                )}
              </field.Control>
            )}
          </form.AppField>
        </Surface>

        <form.AppField name="note">
          {(field) => (
            <field.Textarea
              accessibilityLabel={m.report_note()}
              placeholder={m.report_note_placeholder()}
              maxLength={REPORT_NOTE_MOST}
              editable={!writes.isSending}
            />
          )}
        </form.AppField>

        <Text size="xs" tone="muted">
          {m.report_rights()}{" "}
          <Text
            size="xs"
            tone="muted"
            accessibilityRole="link"
            onPress={() => void openPage("terms")}
            style={{ textDecorationLine: "underline" }}
          >
            {m.report_rights_link()}
          </Text>
        </Text>

        {/* The report waits for its files to be up, and says so. */}
        <form.SubmitButton fill disabled={isGoing} pending={writes.isSending}>
          {isGoing ? m.report_waiting_uploads() : m.report_send_now()}
        </form.SubmitButton>
      </FormScroll>
    </form.AppForm>
  );
}
