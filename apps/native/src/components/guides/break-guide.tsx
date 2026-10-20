import type { GuideLineName, GuideQuestion } from "@repo/client/guides/types";
import type { Guide, GuideLine, GuideOwn, SurfBreak } from "@repo/client/viewer/types";
import { ChevronRightIcon, PenIcon, PlusIcon } from "@repo/ui/icon";
import { Children, isValidElement, type ReactNode, useEffect, useRef } from "react";
import { Pressable, View } from "react-native";

import { Bearing } from "@/components/forecast/bearing";
import { useBlock } from "@/components/friends/blocking";
import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ErrorState } from "@/components/ui/error-state";
import { Section } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import {
  CHARACTERISTIC_FIELDS,
  type CharacteristicField,
  fieldOf,
  wordsText,
} from "./characteristic-words";
import {
  BreakDescription,
  CharacteristicIcon,
  CharacteristicRow,
  GLYPH_SIZE,
  OffshoreIcon,
  SizeIcon,
  useSizeReading,
  WordsReading,
} from "./characteristics";
import {
  answerAfter,
  isTextLine,
  mayBlockAuthor,
  QUESTIONS,
  readAnswer,
  spreadText,
  TEXT_LINES,
  type TextLineName,
  writtenIn,
} from "./guide-words";
import { ContestSheet, TextSheet, WordsSheet } from "./line-sheets";
import { usePresented } from "./page-sheet";
import { Author } from "./author";
import { Tag } from "./tag";
import type { GuideActions } from "./use-guiding";

// The guide of a surf break, the second tab of its sheet, as the web's `BreakGuide` reads it:
// decision 041. A line says its value and who gave it; a press opens, in a sheet of its own, what
// completes or corrects it, one line at a time; what waits to be confirmed shows under it, with
// what an account that keeps the break may say of it. Three questions are answered by each
// account for itself. A visitor who presses a line is asked for an account and goes on to that
// line; an account with no username chooses one first.

type Proposed = GuideLine["proposed"][number];

// What a sheet over the guide holds: the editor of a line, or the reason of a contest on one.
type Shown = { line: GuideLineName; contest?: string };

/** Rows of the guide in the kit's grouped list, which draws nothing while it has no row. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return rows.length === 0 ? null : <Section title={title}>{rows}</Section>;
}

/** A row of the guide that says something and opens nothing. */
function StillRow({ children }: { children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ paddingHorizontal: space.m, paddingVertical: space.xs, minHeight: TARGET }}>
      {children}
    </View>
  );
}

/** What a line says it lacks: a plus, and "Add". */
function AddLabel() {
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
      <Glyph icon={PlusIcon} size={12} color={colors["neutral-10"]} />
      <Text size="s" weight="medium">
        {m.guide_add()}
      </Text>
    </View>
  );
}

type LineProps = {
  line: GuideLine;
  own: GuideOwn | undefined;
  actions: GuideActions;
  onOpen: () => void;
  onContest: (contributionId: string) => void;
  // Blocks the author of a line, for a reader that is not its author: decision 071.
  blockerOf: (by: Proposed["by"]) => ((username: string) => void) | undefined;
};

/** How a value of a line reads: its words, with their arrows, or its text. */
function Value({ line, value }: { line: GuideLineName; value: string[] | string }) {
  if (typeof value === "string") return <Text size="s">{value}</Text>;
  const field = fieldOf(line);
  return field ? <WordsReading field={field.key} given={value} /> : null;
}

/**
 * What stands under a line beside what it says: what was written of it and waits to be
 * confirmed, with what its reader may say of it, and what the reader wrote that waits to be
 * read.
 */
function Waiting({ line, own, actions, onContest, blockerOf }: LineProps) {
  const { colors, space } = useTheme();
  const mine = own?.waiting.find((one) => one.line === line.line);
  const verdictOf = (id: string) => own?.verdicts.find((one) => one.contributionId === id)?.verdict;
  // What the guide says may be contested too, by whoever keeps the break and did not write it.
  const said = line.contributionId;
  const mayContestSaid =
    said !== null && own?.keeps === true && verdictOf(said) !== "contest" && own.username !== null
      ? line.by?.username !== own.username
      : false;

  const sayOf = (one: Proposed): ReactNode => {
    if (mine?.id === one.id) {
      return (
        <Button
          variant="ghost"
          disabled={actions.isSending}
          onPress={() => actions.onWithdraw(one.id)}
          style={{ alignSelf: "flex-start", marginStart: -space.m }}
        >
          {m.guide_withdraw()}
        </Button>
      );
    }
    const verdict = verdictOf(one.id);
    if (verdict === "contest") {
      return (
        <Text size="s" tone="muted">
          {m.guide_you_contested()}
        </Text>
      );
    }
    if (verdict === "confirm") {
      return (
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}
        >
          <Text size="s" tone="muted">
            {m.guide_you_confirmed()}
          </Text>
          {own?.keeps ? (
            <Button variant="ghost" onPress={() => onContest(one.id)}>
              {m.guide_contest()}
            </Button>
          ) : null}
        </View>
      );
    }
    if (!own) return null;
    if (!own.keeps) {
      return (
        <Text size="s" tone="muted">
          {m.guide_keep_first()}
        </Text>
      );
    }
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {own.mayConfirm ? (
          <Button
            variant="secondary"
            disabled={actions.isSending}
            onPress={() => actions.onConfirm(one.id)}
          >
            {m.guide_confirm()}
          </Button>
        ) : null}
        <Button variant="ghost" disabled={actions.isSending} onPress={() => onContest(one.id)}>
          {m.guide_contest()}
        </Button>
      </View>
    );
  };

  const isEmpty = line.proposed.length === 0 && mine?.status !== "pending" && !mayContestSaid;
  if (isEmpty) return null;

  const card = {
    gap: space.xxs,
    padding: space.s,
    borderRadius: space.xs,
    borderCurve: "continuous" as const,
    backgroundColor: colors["neutral-2"],
  };

  return (
    <View style={{ gap: space.xs }}>
      {line.proposed.map((one) => (
        <View key={one.id} style={card}>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}
          >
            <Tag tone="warning">
              {mine?.id === one.id ? m.guide_mine_shown() : m.guide_proposed()}
            </Tag>
            <Author by={one.by} onBlock={blockerOf(one.by)} />
          </View>
          <Value line={line.line} value={one.value} />
          {one.confirmations > 0 ? (
            <Text size="s" tone="muted">
              {one.confirmations === 1
                ? m.guide_confirmed_by_one()
                : m.guide_confirmed_by_some({ count: one.confirmations })}
            </Text>
          ) : null}
          {sayOf(one)}
        </View>
      ))}
      {/* What the reader wrote and nobody has read yet shows to them alone. */}
      {mine?.status === "pending" ? (
        <View style={card}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: space.xs,
            }}
          >
            <Tag>{m.guide_mine_pending()}</Tag>
            <Button
              variant="ghost"
              disabled={actions.isSending}
              onPress={() => actions.onWithdraw(mine.id)}
            >
              {m.guide_withdraw()}
            </Button>
          </View>
          <Value line={line.line} value={mine.value} />
        </View>
      ) : null}
      {mayContestSaid && said !== null ? (
        <Button
          variant="ghost"
          onPress={() => onContest(said)}
          style={{ alignSelf: "flex-start", marginStart: -space.m }}
        >
          {m.guide_contest()}
        </Button>
      ) : null}
    </View>
  );
}

/** A line that is said in the catalogue's words: its glyph, its name, what it says, who said so. */
function WordsLine(props: LineProps & { field: CharacteristicField }) {
  const { line, field, onOpen, blockerOf } = props;
  const { colors, space } = useTheme();
  const value = Array.isArray(line.value) ? line.value : null;
  const under = space.m + GLYPH_SIZE + space.s;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${field.label()}, ${value ? wordsText(field.key, value) : m.guide_add()}`}
        accessibilityHint={m.native_guide_line_hint()}
        onPress={onOpen}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space.s,
          minHeight: TARGET,
          paddingHorizontal: space.m,
          paddingVertical: space.xs,
          backgroundColor: pressed ? colors["neutral-3"] : undefined,
        })}
      >
        <View style={{ flex: 1 }}>
          <CharacteristicRow
            icon={<CharacteristicIcon field={field.key} given={value ?? []} faint={!value} />}
            label={field.label()}
          >
            {value ? <WordsReading field={field.key} given={value} /> : <AddLabel />}
          </CharacteristicRow>
        </View>
        <Glyph icon={ChevronRightIcon} size={16} color={colors["neutral-6"]} />
      </Pressable>
      {/* Who said it stands under the value, out of the row's press: its name asks of its own. */}
      {value && line.origin === "contribution" ? (
        <View style={{ paddingStart: under, paddingEnd: space.m, paddingBottom: space.xs }}>
          <Author by={line.by} onBlock={blockerOf(line.by)} />
        </View>
      ) : null}
      <View style={{ paddingStart: under, paddingEnd: space.m }}>
        <Waiting {...props} />
      </View>
    </View>
  );
}

/** A line that is a short text: what it says in full, who wrote it, and what corrects it. */
function TextLine(props: LineProps & { name: TextLineName }) {
  const { line, name, own, onOpen, blockerOf } = props;
  const { space } = useTheme();
  const value = typeof line.value === "string" ? line.value : null;
  const hasMine = own?.waiting.some((one) => one.line === name) ?? false;
  const written = writtenIn(line.language);
  return (
    <View style={{ gap: space.xs, paddingHorizontal: space.m, paddingVertical: space.s }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.s,
        }}
      >
        <Text size="s" weight="medium" accessibilityRole="header" style={{ flex: 1 }}>
          {TEXT_LINES[name].label()}
        </Text>
        <Button
          variant="ghost"
          icon={value ? PenIcon : PlusIcon}
          accessibilityHint={m.native_guide_line_hint()}
          onPress={onOpen}
          style={{ marginEnd: -space.s }}
        >
          {value ? m.guide_correct() : m.guide_add()}
        </Button>
      </View>
      {value ? (
        <View style={{ gap: space.xxs }}>
          {/* A text may be copied: an address, a car park. */}
          <Text size="s" selectable>
            {value}
          </Text>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}
          >
            <Author by={line.by} onBlock={blockerOf(line.by)} />
            {written ? (
              <Text size="s" tone="muted">
                {written}
              </Text>
            ) : null}
          </View>
        </View>
      ) : hasMine ? null : (
        <Text size="s" tone="muted">
          {m.guide_nothing_yet()}
        </Text>
      )}
      <Waiting {...props} />
    </View>
  );
}

/** One of the questions that every account answers for itself, and how the answers spread. */
function Question({
  spread,
  listed,
  mine,
  onAnswer,
}: {
  spread: Guide["answers"][number];
  // What the list the break came from says of it, where it says anything.
  listed: string | undefined;
  mine: string | undefined;
  onAnswer: (question: GuideQuestion, answer: string) => void;
}) {
  const { space } = useTheme();
  const { question } = spread;
  const answers = Object.keys(QUESTIONS[question].answers);
  return (
    <View style={{ gap: space.xs, paddingHorizontal: space.m, paddingVertical: space.s }}>
      <Text size="s" weight="medium" accessibilityRole="header">
        {QUESTIONS[question].label()}
      </Text>
      <View
        role="group"
        accessibilityLabel={QUESTIONS[question].label()}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}
      >
        {answers.map((answer) => (
          <Chip
            key={answer}
            label={readAnswer(question, answer)}
            selected={mine === answer}
            onPress={() => onAnswer(question, answer)}
          />
        ))}
      </View>
      <Text size="s" tone="muted">
        {spreadText(spread, listed)}
      </Text>
    </View>
  );
}

/** What the catalogue knows of a break, read and never opened: while its guide cannot be had. */
function About({
  found,
  lines,
}: {
  found: SurfBreak;
  // The guide's lines of words, each a row that opens; without them, the catalogue's words.
  lines?: ReactNode[];
}) {
  const known = found.characteristics;
  const offshore = known.offshoreDirectionDegrees;
  const size = useSizeReading(known.waveSizeMeters);
  return (
    <Group title={m.break_about()}>
      {found.description ? (
        <StillRow key="description">
          <BreakDescription description={found.description} />
        </StillRow>
      ) : null}
      {found.location ? (
        <StillRow key="location">
          <CharacteristicRow label={m.break_location()}>
            {/* The nearest place first, as an address reads. */}
            {[...found.location].reverse().join(", ")}
          </CharacteristicRow>
        </StillRow>
      ) : null}
      {lines ??
        CHARACTERISTIC_FIELDS.flatMap(({ key, label }) => {
          const given = known[key];
          return given && given.length > 0
            ? [
                <StillRow key={key}>
                  <CharacteristicRow
                    icon={<CharacteristicIcon field={key} given={given} />}
                    label={label()}
                  >
                    <WordsReading field={key} given={given} />
                  </CharacteristicRow>
                </StillRow>,
              ]
            : [];
        })}
      {offshore != null ? (
        <StillRow key="offshore">
          <CharacteristicRow
            icon={<OffshoreIcon degrees={offshore} />}
            label={m.break_offshore_wind()}
          >
            <Bearing degrees={offshore} />
          </CharacteristicRow>
        </StillRow>
      ) : null}
      {known.waveSizeMeters && size ? (
        <StillRow key="size">
          <CharacteristicRow
            icon={<SizeIcon size={known.waveSizeMeters} />}
            label={m.break_wave_size()}
          >
            {size}
          </CharacteristicRow>
        </StillRow>
      ) : null}
    </Group>
  );
}

type BreakGuideProps = {
  found: SurfBreak;
  guide: {
    data: Guide | undefined;
    isError: boolean;
    isRefetching: boolean;
    refetch: () => unknown;
  };
  // What the signed-in account wrote here and may do. Undefined for a visitor, and until the API
  // has said.
  own: GuideOwn | undefined;
  actions: GuideActions;
};

/**
 * What is written of a surf break, line by line, and what lets whoever knows the place add to it:
 * decision 041.
 */
export function BreakGuide({ found, guide, own, actions }: BreakGuideProps) {
  const { space } = useTheme();
  const requireAccount = useRequireAccount();
  const { block } = useBlock();
  const sheet = usePresented<Shown>();
  // A visitor who signs in from a line it pressed goes on to that line.
  const asked = useRef<GuideLineName | null>(null);
  const { signedIn } = actions;
  const { present } = sheet;
  useEffect(() => {
    if (!signedIn || asked.current === null) return;
    present({ line: asked.current });
    asked.current = null;
  }, [signedIn, present]);

  if (!guide.data) {
    if (!guide.isError) return <GuideSkeleton />;
    // The catalogue still says what it knows when the guide did not come.
    return (
      <View style={{ gap: space.l }}>
        <ErrorState
          title={m.native_guide_failed()}
          onRetry={() => void guide.refetch()}
          retrying={guide.isRefetching}
        />
        <About found={found} />
      </View>
    );
  }

  const lineOf = (name: GuideLineName) => guide.data?.lines.find((line) => line.line === name);
  const blockerOf = (by: Proposed["by"]) => (mayBlockAuthor(by, own?.username) ? block : undefined);
  const propsOf = (line: GuideLine): LineProps => ({
    line,
    own,
    actions,
    blockerOf,
    onOpen: () => {
      if (signedIn) {
        sheet.present({ line: line.line });
        return;
      }
      asked.current = line.line;
      requireAccount(m.guide_sign_in(), () => sheet.present({ line: line.line }));
    },
    onContest: (contest) => sheet.present({ line: line.line, contest }),
  });

  const levels = found.characteristics.abilityLevels;
  const listedLevel =
    levels && levels.length > 0
      ? m.guide_level_listed({
          levels: levels.map((level) => readAnswer("level", level)).join(", "),
        })
      : undefined;

  const shown = sheet.shown;
  const shownLine = shown ? lineOf(shown.line) : undefined;
  const shownField = shown ? fieldOf(shown.line) : undefined;
  const presenting = {
    visible: sheet.visible,
    onClose: () => sheet.dismiss(),
    onDismissed: sheet.dismissed,
  };

  return (
    <View style={{ gap: space.l }}>
      <Text size="s" tone="muted" style={{ paddingHorizontal: space.m }}>
        {m.guide_hint()}
      </Text>

      <About
        found={found}
        lines={CHARACTERISTIC_FIELDS.flatMap((field) => {
          const line = lineOf(field.key as GuideLineName);
          return line ? [<WordsLine key={field.key} field={field} {...propsOf(line)} />] : [];
        })}
      />

      <Group title={m.guide_on_site()}>
        {(Object.keys(TEXT_LINES) as TextLineName[]).flatMap((name) => {
          const line = lineOf(name);
          return line ? [<TextLine key={name} name={name} {...propsOf(line)} />] : [];
        })}
      </Group>

      <Group title={m.guide_lineup()}>
        {guide.data.answers.map((spread) => (
          <Question
            key={spread.question}
            spread={spread}
            listed={spread.question === "level" ? listedLevel : undefined}
            mine={own?.answers[spread.question]}
            onAnswer={(question, pressed) => {
              if (!signedIn) {
                requireAccount(m.guide_sign_in_answer(), () => {});
                return;
              }
              actions.onAnswer(question, answerAfter(own?.answers[question], pressed));
            }}
          />
        ))}
      </Group>

      {shown && shownLine ? (
        shown.contest !== undefined ? (
          <ContestSheet
            key={`contest:${shown.contest}`}
            contributionId={shown.contest}
            actions={actions}
            {...presenting}
          />
        ) : isTextLine(shown.line) ? (
          <TextSheet
            key={`text:${shown.line}`}
            line={shown.line}
            // A text shown from another language is not the one being written: the reader writes
            // the line in their own, from nothing.
            saved={
              typeof shownLine.value === "string" && shownLine.language === getLocale()
                ? shownLine.value
                : ""
            }
            own={own}
            actions={actions}
            {...presenting}
          />
        ) : shownField ? (
          <WordsSheet
            key={`words:${shown.line}`}
            line={shown.line}
            field={shownField}
            saved={Array.isArray(shownLine.value) ? shownLine.value : []}
            own={own}
            actions={actions}
            {...presenting}
          />
        ) : null
      ) : null}
    </View>
  );
}

/** The guide's place while it loads: its rows, as a glyph and two lines each. */
export function GuideSkeleton() {
  const { space } = useTheme();
  return (
    <Loading>
      <View style={{ gap: space.s, paddingHorizontal: space.m }}>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <View key={row} style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
            <Skeleton width={GLYPH_SIZE} height={GLYPH_SIZE} round />
            <View style={{ flex: 1, gap: space.xxs }}>
              <Skeleton height={12} width="40%" />
              <Skeleton height={14} width="80%" />
            </View>
          </View>
        ))}
      </View>
    </Loading>
  );
}
