import type { GuideLineName } from "@repo/client/guides/types";
import type { GuideOwn } from "@repo/client/viewer/types";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { View } from "react-native";

import { useOpenPage } from "@/components/account/open-page";
import { UsernameForm } from "@/components/account/username-form";
import { TextField } from "@/components/lists/text-field";
import { feel } from "@/components/ui/haptics";
import { Loading, SkeletonText } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { Toggle, ToggleGroup } from "@/components/ui/toggle";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import type { CharacteristicField } from "./characteristic-words";
import { wordsText } from "./characteristic-words";
import { CharacteristicIcon } from "./characteristics";
import {
  isSendableWords,
  REASON_MOST,
  reasonRefusal,
  saidOf,
  TEXT_LINES,
  textMostOf,
  type TextLineName,
  textRefusal,
  wordsRefusal,
} from "./guide-words";
import { PageSheet } from "./page-sheet";
import type { GuideActions } from "./use-guiding";

// What completes or corrects a line of a guide, one line at a time, in a sheet of its own over the
// place: the catalogue's words to choose from, or a short text; and the reason of a contest, which
// a moderator alone reads. Decision 041.

/**
 * A few lines of text, on the lists' `TextField` as a session's note is written: what is typed
 * stays in view over the keyboard, which the sheet's scroll keeps clear of it.
 */
function GuideField({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
  disabled = false,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  maxLength: number;
  disabled?: boolean;
  hint?: string;
}) {
  const { space, type } = useTheme();
  return (
    <Surface insetEdge>
      <TextField
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        maxLength={maxLength}
        editable={!disabled}
        multiline
        autoFocus
        textAlignVertical="top"
        style={{
          flex: 0,
          minHeight: type.m.line * 5 + 2 * space.s,
          paddingHorizontal: space.m,
          paddingTop: space.s,
          paddingBottom: space.s,
          lineHeight: type.m.line,
        }}
      />
    </Surface>
  );
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

/**
 * Why what was sent was refused, or why it cannot be sent yet, said under what was written as
 * the web's field says it: a toast may stand behind the sheet.
 */
function Refusal({ why }: { why: string | undefined }) {
  if (!why) return null;
  return (
    <Text size="s" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
      {why}
    </Text>
  );
}

/**
 * Sends what a sheet holds once it can be, and otherwise says why under it: Send is never
 * greyed, as decision 076 keeps it on the web.
 */
function sendWith(
  isSending: boolean,
  wrong: string | undefined,
  setRefused: (why: string | undefined) => void,
  send: () => void,
) {
  if (isSending) return;
  if (wrong) {
    feel("failed");
    setRefused(wrong);
    return;
  }
  setRefused(undefined);
  send();
}

/**
 * Whether the signed-in account may write here: it needs a username, since what it writes is
 * read under it. One with none chooses it in the sheet, as the web's guide asks for it, and goes
 * on writing once it is kept.
 */
function useWriter(own: GuideOwn | undefined) {
  const queryClient = useQueryClient();
  // A username kept here, before what the account wrote of the break is read again.
  const [isNamed, setIsNamed] = useState(false);
  return {
    canWrite: own?.username != null || isNamed,
    onNamed: () => {
      setIsNamed(true);
      void queryClient.invalidateQueries({ queryKey: orpc.v1.guides.mine.key() });
    },
  };
}

/** What an account goes through before it writes: one with no username chooses it first. */
function Writer({
  own,
  canWrite,
  onNamed,
  children,
}: {
  own: GuideOwn | undefined;
  canWrite: boolean;
  onNamed: () => void;
  children: ReactNode;
}) {
  const { space } = useTheme();
  if (canWrite) return children;
  if (!own) {
    return (
      <Loading>
        <SkeletonText lines={4} />
      </Loading>
    );
  }
  return (
    <View style={{ gap: space.s }}>
      <Text>{m.guide_username_first()}</Text>
      <UsernameForm current={null} autoFocus onSaved={onNamed} />
    </View>
  );
}

// How a sheet is shown, as `usePresented` keeps it: it stays drawn while it leaves.
type Presenting = { visible: boolean; onClose: () => void; onDismissed: () => void };

type SheetProps = Presenting & {
  own: GuideOwn | undefined;
  actions: GuideActions;
};

/** A line said in the catalogue's words: its glyph drawn from what is pressed, and the words. */
export function WordsSheet({
  line,
  field,
  saved,
  own,
  actions,
  visible,
  onClose,
  onDismissed,
}: SheetProps & { line: GuideLineName; field: CharacteristicField; saved: readonly string[] }) {
  const { space } = useTheme();
  const [pressed, setPressed] = useState<string[]>([...saved]);
  const [refused, setRefused] = useState<string>();
  const { canWrite, onNamed } = useWriter(own);

  const send = () =>
    sendWith(actions.isSending, wordsRefusal(pressed, saved), setRefused, () =>
      actions.onPropose(line, pressed, {
        done: onClose,
        failed: (why) => {
          feel("failed");
          setRefused(why);
        },
      }),
    );

  return (
    <PageSheet
      visible={visible}
      title={field.label()}
      onClose={onClose}
      onDismissed={onDismissed}
      dirty={canWrite && isSendableWords(pressed, saved)}
      onSave={canWrite ? send : undefined}
      saveLabel={m.guide_send()}
      saving={actions.isSending}
    >
      <Writer own={own} canWrite={canWrite} onNamed={onNamed}>
        {/* What the line will say, drawn as it is chosen. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ alignItems: "center", gap: space.xs }}
        >
          <CharacteristicIcon
            field={field.key}
            given={pressed}
            size={72}
            faint={pressed.length === 0}
          />
          <Text size="s" tone="muted" style={{ textAlign: "center" }}>
            {pressed.length > 0 ? wordsText(field.key, pressed) : field.label()}
          </Text>
        </View>
        <ToggleGroup label={field.label()}>
          {field.words.map(({ word, reading }) => (
            <Toggle
              key={word}
              label={reading()}
              pressed={pressed.includes(word)}
              disabled={actions.isSending}
              onPress={() => {
                // What was wrong is said again only once Send is pressed again.
                setRefused(undefined);
                setPressed((before) =>
                  before.includes(word) ? before.filter((one) => one !== word) : [...before, word],
                );
              }}
            />
          ))}
        </ToggleGroup>
        <Refusal why={refused} />
        <License />
      </Writer>
    </PageSheet>
  );
}

/** A line that is a short text, with what was typed before and not sent. */
export function TextSheet({
  line,
  saved,
  own,
  actions,
  visible,
  onClose,
  onDismissed,
}: SheetProps & { line: TextLineName; saved: string }) {
  const { space } = useTheme();
  const most = textMostOf(line);
  // What was typed here before the sheet last closed is here again.
  const [text, setText] = useState(actions.draftOf(line) ?? saved);
  const [refused, setRefused] = useState<string>();
  const { canWrite, onNamed } = useWriter(own);

  const write = (next: string) => {
    setText(next);
    setRefused(undefined);
    actions.onDraft(line, next === saved ? undefined : next);
  };
  // What was sent, or let go, is no draft any more.
  const leave = () => {
    actions.onDraft(line, undefined);
    onClose();
  };
  const send = () =>
    sendWith(actions.isSending, textRefusal(text, saved), setRefused, () =>
      actions.onPropose(line, saidOf(text), {
        done: leave,
        failed: (why) => {
          feel("failed");
          setRefused(why);
        },
      }),
    );

  return (
    <PageSheet
      visible={visible}
      title={TEXT_LINES[line].label()}
      // The draft is kept while the app is open: closing loses nothing, and asks nothing.
      onClose={onClose}
      onDismissed={onDismissed}
      onSave={canWrite ? send : undefined}
      saveLabel={m.guide_send()}
      saving={actions.isSending}
    >
      <Writer own={own} canWrite={canWrite} onNamed={onNamed}>
        <View style={{ gap: space.xs }}>
          <GuideField
            label={TEXT_LINES[line].label()}
            value={text}
            onChangeText={write}
            placeholder={TEXT_LINES[line].placeholder()}
            maxLength={most}
            disabled={actions.isSending}
          />
          <Text
            size="s"
            tone="muted"
            numeric
            accessibilityLabel={m.native_guide_characters({ count: text.length, most })}
            style={{ alignSelf: "flex-end" }}
          >
            {`${text.length} / ${most}`}
          </Text>
        </View>
        <Refusal why={refused} />
        <License />
      </Writer>
    </PageSheet>
  );
}

/** Why a contribution is contested, in a few words that only a moderator reads. */
export function ContestSheet({
  contributionId,
  actions,
  visible,
  onClose,
  onDismissed,
}: Presenting & {
  contributionId: string;
  actions: GuideActions;
}) {
  const [reason, setReason] = useState("");
  const [refused, setRefused] = useState<string>();
  const said = saidOf(reason);

  const send = () =>
    sendWith(actions.isSending, reasonRefusal(reason), setRefused, () =>
      actions.onContest(contributionId, said, {
        done: onClose,
        failed: (why) => {
          feel("failed");
          setRefused(why);
        },
      }),
    );

  return (
    <PageSheet
      visible={visible}
      title={m.guide_contest()}
      onClose={onClose}
      onDismissed={onDismissed}
      dirty={said.length > 0}
      onSave={send}
      saveLabel={m.guide_send()}
      saving={actions.isSending}
    >
      <Text weight="medium">{m.guide_contest_title()}</Text>
      <GuideField
        label={m.guide_contest_title()}
        hint={m.guide_contest_hint()}
        value={reason}
        onChangeText={(next) => {
          setReason(next);
          setRefused(undefined);
        }}
        maxLength={REASON_MOST}
        disabled={actions.isSending}
      />
      <Text size="s" tone="muted">
        {m.guide_contest_hint()}
      </Text>
      <Refusal why={refused} />
    </PageSheet>
  );
}
