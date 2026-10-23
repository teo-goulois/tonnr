import type { GuideLineName } from "@repo/client/guides/types";
import type { GuideOwn } from "@repo/client/viewer/types";
import type { AnyFormApi } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { z } from "zod";

import { useOpenPage } from "@/components/account/open-page";
import { UsernameForm } from "@/components/account/username-form";
import { Button } from "@/components/ui/button";
import { refuseField, useAppForm, useStore } from "@/components/ui/form";
import { feel } from "@/components/ui/haptics";
import { useSheetGuard } from "@/components/ui/sheet";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import type { CharacteristicField } from "./characteristic-words";
import {
  REASON_MOST,
  reasonRefusal,
  sameWords,
  saidOf,
  TEXT_LINES,
  textMostOf,
  type TextLineName,
  textRefusal,
  wordsRefusal,
} from "./guide-words";
import type { GuideActions } from "./use-guiding";

// What completes or corrects a line of a guide, unfolded under the line one line at a time, as
// the web's `WordsEditor` and `TextEditor` are: the catalogue's words to press, or a short text,
// then Send and Cancel, then what sending means. The reason of a contest unfolds the same way
// under what it contests, and a moderator alone reads it. Each is a form of the kit (decision
// 078): what is wrong is said under its field once Send is pressed, which is never greyed, and
// so is a line the API says the guide holds already. While words that could be sent, or a
// reason, are held, the place's sheet asks before it is left, as a form sheet does: a text is
// kept as a draft instead. Decision 041.

/** A schema of one field that says under it what `faultOf` finds wrong, or nothing. */
function faulted<Value>(
  base: z.ZodType<Value, Value>,
  faultOf: (value: Value) => string | undefined,
) {
  return base.superRefine((value, issues) => {
    const fault = faultOf(value);
    if (fault) issues.addIssue({ code: "custom", message: fault });
  });
}

/**
 * Says under a field that the guide holds what it says already, as the API answered once it was
 * sent, and buzzes as a refused send does (decision 078).
 */
function refuse(form: AnyFormApi, name: string) {
  feel("failed");
  refuseField(form, name, m.guide_same());
}

/** What sending means, and where it is said in full: one line, which ends on its link. */
function License() {
  const { openPage } = useOpenPage();
  return (
    <Text size="s" tone="muted">
      {m.guide_license()}{" "}
      <Text
        size="s"
        tone="muted"
        accessibilityRole="link"
        onPress={() => void openPage("terms")}
        style={{ textDecorationLine: "underline" }}
      >
        {m.guide_license_terms()}
      </Text>
    </Text>
  );
}

/** What sends an editor and what folds it away, side by side at their own width. */
function SendRow({
  send,
  isSending,
  onCancel,
}: {
  // The form's own button, `form.SubmitButton`.
  send: ReactNode;
  isSending: boolean;
  onCancel: () => void;
}) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      {send}
      <Button variant="ghost" disabled={isSending} onPress={onCancel}>
        {m.action_cancel()}
      </Button>
    </View>
  );
}

/** Whether the signed-in account may write, and what it does once it chose a username. */
export type WriterState = { canWrite: boolean; onNamed: () => void };

/**
 * Whether the signed-in account may write here: it needs a username, since what it writes is read
 * under it. A username it just chose lets it write at once, before what it wrote of the break is
 * read again.
 */
export function useWriter(own: GuideOwn | undefined): WriterState {
  const queryClient = useQueryClient();
  const [isNamed, setIsNamed] = useState(false);
  return {
    canWrite: own?.username != null || isNamed,
    onNamed: () => {
      setIsNamed(true);
      void queryClient.invalidateQueries({ queryKey: orpc.v1.guides.mine.key() });
    },
  };
}

// The height of the bar that stands for an editor while what the account wrote is read: the
// web's `h-9`.
const WAITING_BAR = 36;

/**
 * What an account goes through before it writes, as the web's `Writer`: one with no username
 * chooses it here, in place, and the editor comes once it has one.
 */
export function Writer({
  own,
  writer,
  children,
}: {
  own: GuideOwn | undefined;
  writer: WriterState;
  children: ReactNode;
}) {
  const { space } = useTheme();
  if (writer.canWrite) return children;
  if (!own) {
    return (
      <Loading>
        <Skeleton height={WAITING_BAR} />
      </Loading>
    );
  }
  return (
    <View style={{ gap: space.xs }}>
      <Text size="s">{m.guide_username_first()}</Text>
      <UsernameForm current={null} onSaved={writer.onNamed} />
    </View>
  );
}

/** A line said in the catalogue's words: the words to press, named by the line over them. */
export function WordsEditor({
  line,
  field,
  saved,
  actions,
  onDone,
}: {
  line: GuideLineName;
  // The words the line is said in, and how they read.
  field: CharacteristicField;
  saved: readonly string[];
  actions: GuideActions;
  onDone: () => void;
}) {
  const { space } = useTheme();
  const form = useAppForm({
    defaultValues: { words: [...saved] as string[] },
    validators: {
      onSubmit: z.object({
        words: faulted(z.array(z.string()), (pressed) => wordsRefusal(pressed, saved)),
      }),
    },
    onSubmit: ({ value, formApi }) => {
      if (actions.isSending) return;
      actions.onPropose(line, value.words, {
        done: onDone,
        same: () => refuse(formApi, "words"),
      });
    },
  });
  const isHeld = useStore(
    form.store,
    (state) => state.values.words.length > 0 && !sameWords(state.values.words, saved),
  );
  useSheetGuard(isHeld);
  return (
    <form.AppForm>
      <View style={{ gap: space.s }}>
        <form.AppField name="words">
          {(choice) => (
            // The line's name stands over the editor already: the group is named by it alone.
            <choice.Choice
              multiple
              accessibilityLabel={field.label()}
              disabled={actions.isSending}
              options={field.words.map(({ word, reading }) => ({ value: word, label: reading() }))}
            />
          )}
        </form.AppField>
        <SendRow
          send={<form.SubmitButton pending={actions.isSending}>{m.guide_send()}</form.SubmitButton>}
          isSending={actions.isSending}
          onCancel={onDone}
        />
        <License />
      </View>
    </form.AppForm>
  );
}

/** A line that is a short text, with what was typed before and not sent, and its count. */
export function TextEditor({
  line,
  saved,
  actions,
  onDone,
}: {
  line: TextLineName;
  saved: string;
  actions: GuideActions;
  onDone: () => void;
}) {
  const { space } = useTheme();
  const most = textMostOf(line);
  // What was sent, or let go, is no draft any more. An editor that folds away for another line,
  // or with its place's sheet, keeps it.
  const leave = () => {
    actions.onDraft(line, undefined);
    onDone();
  };
  const form = useAppForm({
    // What was typed here before it last folded away is here again.
    defaultValues: { text: actions.draftOf(line) ?? saved },
    validators: {
      onSubmit: z.object({ text: faulted(z.string(), (text) => textRefusal(text, saved)) }),
    },
    onSubmit: ({ value, formApi }) => {
      if (actions.isSending) return;
      actions.onPropose(line, saidOf(value.text), {
        done: leave,
        same: () => refuse(formApi, "text"),
      });
    },
  });
  return (
    <form.AppForm>
      <View style={{ gap: space.s }}>
        <form.AppField
          name="text"
          listeners={{
            onChange: ({ value }) => actions.onDraft(line, value === saved ? undefined : value),
          }}
        >
          {(field) => (
            <field.Textarea
              autoFocus
              maxLength={most}
              editable={!actions.isSending}
              placeholder={TEXT_LINES[line].placeholder()}
              accessibilityLabel={TEXT_LINES[line].label()}
            />
          )}
        </form.AppField>
        {/* Send and Cancel at the start, and how much is written at the end, as the web lays them. */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space.xs,
          }}
        >
          <SendRow
            send={
              <form.SubmitButton pending={actions.isSending}>{m.guide_send()}</form.SubmitButton>
            }
            isSending={actions.isSending}
            onCancel={leave}
          />
          <form.Subscribe selector={(state) => state.values.text.length}>
            {(length) => (
              <Text
                size="s"
                tone="muted"
                numeric
                accessibilityLabel={m.native_guide_characters({ count: length, most })}
              >
                {`${length} / ${most}`}
              </Text>
            )}
          </form.Subscribe>
        </View>
        <License />
      </View>
    </form.AppForm>
  );
}

/** Why a contribution is contested, in a few words that only a moderator reads. */
export function ContestForm({
  contributionId,
  actions,
  onDone,
}: {
  contributionId: string;
  actions: GuideActions;
  onDone: () => void;
}) {
  const { space } = useTheme();
  const form = useAppForm({
    defaultValues: { reason: "" },
    validators: { onSubmit: z.object({ reason: faulted(z.string(), reasonRefusal) }) },
    onSubmit: ({ value }) => {
      if (!actions.isSending) actions.onContest(contributionId, value.reason.trim(), onDone);
    },
  });
  const isHeld = useStore(form.store, (state) => state.values.reason.trim().length > 0);
  useSheetGuard(isHeld);
  return (
    <form.AppForm>
      <View style={{ gap: space.xs }}>
        <form.AppField name="reason">
          {(field) => (
            <field.Textarea
              label={m.guide_contest_title()}
              description={m.guide_contest_hint()}
              autoFocus
              maxLength={REASON_MOST}
              editable={!actions.isSending}
            />
          )}
        </form.AppField>
        <SendRow
          send={<form.SubmitButton pending={actions.isSending}>{m.guide_send()}</form.SubmitButton>}
          isSending={actions.isSending}
          onCancel={onDone}
        />
      </View>
    </form.AppForm>
  );
}
