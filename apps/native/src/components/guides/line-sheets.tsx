import { localePrefix } from "@repo/config/locales";
import type { GuideLineName } from "@repo/client/guides/types";
import type { GuideOwn } from "@repo/client/viewer/types";
import { openBrowserAsync } from "expo-web-browser";
import { type ReactNode, useState } from "react";
import { TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { feel } from "@/components/ui/haptics";
import { Loading, SkeletonText } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { ENV } from "@/env";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import type { CharacteristicField } from "./characteristic-words";
import { wordsText } from "./characteristic-words";
import { CharacteristicIcon } from "./characteristics";
import {
  isSendableText,
  isSendableWords,
  REASON_MOST,
  saidOf,
  TEXT_LEAST,
  TEXT_LINES,
  textMostOf,
  type TextLineName,
} from "./guide-words";
import { PageSheet } from "./page-sheet";
import type { GuideActions } from "./use-guiding";

// What completes or corrects a line of a guide, one line at a time, in a sheet of its own over the
// place: the catalogue's words to choose from, or a short text; and the reason of a contest, which
// a moderator alone reads. Decision 041.

/** A field of text in the theme: what is typed stays in view over the keyboard. */
export function GuideField({
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
  const { colors, space, radius, type, fonts } = useTheme();
  return (
    <TextInput
      accessibilityLabel={label}
      accessibilityHint={hint}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors["neutral-6"]}
      selectionColor={colors["color-1"]}
      cursorColor={colors["color-1"]}
      maxLength={maxLength}
      editable={!disabled}
      multiline
      autoFocus
      textAlignVertical="top"
      style={{
        minHeight: type.m.line * 5 + 2 * space.s,
        paddingHorizontal: space.m,
        paddingTop: space.s,
        paddingBottom: space.s,
        borderRadius: radius.xs,
        borderCurve: "continuous",
        backgroundColor: colors["neutral-3"],
        color: colors["neutral-10"],
        fontFamily: fonts.regular,
        fontSize: type.m.size,
        lineHeight: type.m.line,
      }}
    />
  );
}

/** What sending means, and where it is said in full. */
function License() {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.xxs }}>
      <Text size="s" tone="muted">
        {m.guide_license()}
      </Text>
      <Button
        variant="ghost"
        style={{ alignSelf: "flex-start", marginStart: -space.m }}
        onPress={() =>
          void openBrowserAsync(`${ENV.EXPO_PUBLIC_SITE_URL}${localePrefix(getLocale())}/terms`)
        }
      >
        {m.guide_license_terms()}
      </Button>
    </View>
  );
}

/** Why what was sent was refused, said where it was written: a toast may stand behind the sheet. */
function Refusal({ why }: { why: string | undefined }) {
  if (!why) return null;
  return (
    <Text tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
      {why}
    </Text>
  );
}

/**
 * What an account goes through before it writes: one with no username chooses it first, since
 * what it writes is read under it, in the step of the account's tab that chooses one.
 */
function Writer({
  own,
  onChooseUsername,
  children,
}: {
  own: GuideOwn | undefined;
  onChooseUsername: () => void;
  children: ReactNode;
}) {
  const { space } = useTheme();
  if (!own) {
    return (
      <Loading>
        <SkeletonText lines={4} />
      </Loading>
    );
  }
  if (own.username === null) {
    return (
      <View style={{ gap: space.s }}>
        <Text>{m.guide_username_first()}</Text>
        <Button onPress={onChooseUsername} fill>
          {m.username_choose()}
        </Button>
      </View>
    );
  }
  return children;
}

// How a sheet is shown, as `usePresented` keeps it: it stays drawn while it leaves.
type Presenting = { visible: boolean; onClose: () => void; onDismissed: () => void };

type SheetProps = Presenting & {
  own: GuideOwn | undefined;
  actions: GuideActions;
  onChooseUsername: () => void;
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
  onChooseUsername,
}: SheetProps & { line: GuideLineName; field: CharacteristicField; saved: readonly string[] }) {
  const { space } = useTheme();
  const [pressed, setPressed] = useState<string[]>([...saved]);
  const [refused, setRefused] = useState<string>();
  const canWrite = own?.username != null;
  const sendable = canWrite && isSendableWords(pressed, saved);

  const send = () => {
    if (!sendable || actions.isSending) return;
    setRefused(undefined);
    actions.onPropose(line, pressed, {
      done: onClose,
      failed: (why) => {
        feel("failed");
        setRefused(why);
      },
    });
  };

  return (
    <PageSheet
      visible={visible}
      title={field.label()}
      onClose={onClose}
      onDismissed={onDismissed}
      dirty={sendable}
      onSave={canWrite ? send : undefined}
      saveLabel={m.guide_send()}
      canSave={sendable}
      saving={actions.isSending}
    >
      <Writer own={own} onChooseUsername={onChooseUsername}>
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
              disabled={actions.isSending}
              onPress={() =>
                setPressed((before) =>
                  before.includes(word) ? before.filter((one) => one !== word) : [...before, word],
                )
              }
            />
          ))}
        </View>
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
  onChooseUsername,
}: SheetProps & { line: TextLineName; saved: string }) {
  const { space } = useTheme();
  const most = textMostOf(line);
  // What was typed here before the sheet last closed is here again.
  const [text, setText] = useState(actions.draftOf(line) ?? saved);
  const [refused, setRefused] = useState<string>();
  const canWrite = own?.username != null;
  const sendable = canWrite && isSendableText(text, saved);

  const write = (next: string) => {
    setText(next);
    actions.onDraft(line, next === saved ? undefined : next);
  };
  // What was sent, or let go, is no draft any more.
  const leave = () => {
    actions.onDraft(line, undefined);
    onClose();
  };
  const send = () => {
    if (!sendable || actions.isSending) return;
    setRefused(undefined);
    actions.onPropose(line, saidOf(text), {
      done: leave,
      failed: (why) => {
        feel("failed");
        setRefused(why);
      },
    });
  };

  return (
    <PageSheet
      visible={visible}
      title={TEXT_LINES[line].label()}
      // The draft is kept while the app is open: closing loses nothing, and asks nothing.
      onClose={onClose}
      onDismissed={onDismissed}
      onSave={canWrite ? send : undefined}
      saveLabel={m.guide_send()}
      canSave={sendable}
      saving={actions.isSending}
    >
      <Writer own={own} onChooseUsername={onChooseUsername}>
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
  const sendable = said.length >= TEXT_LEAST;

  const send = () => {
    if (!sendable || actions.isSending) return;
    setRefused(undefined);
    actions.onContest(contributionId, said, {
      done: onClose,
      failed: (why) => {
        feel("failed");
        setRefused(why);
      },
    });
  };

  return (
    <PageSheet
      visible={visible}
      title={m.guide_contest()}
      onClose={onClose}
      onDismissed={onDismissed}
      dirty={said.length > 0}
      onSave={send}
      saveLabel={m.guide_send()}
      canSave={sendable}
      saving={actions.isSending}
    >
      <Text weight="medium">{m.guide_contest_title()}</Text>
      <GuideField
        label={m.guide_contest_title()}
        hint={m.guide_contest_hint()}
        value={reason}
        onChangeText={setReason}
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
