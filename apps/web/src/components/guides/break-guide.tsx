import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { PenIcon, PlusIcon } from "@repo/ui/icon";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { UsernameForm } from "@/components/account/username-form";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import { Bearing } from "../viewer/bearing";
import {
  BreakCharacteristics,
  BreakDescription,
  CHARACTERISTIC_FIELDS,
  type CharacteristicField,
  CharacteristicIcon,
  CharacteristicRow,
  OffshoreIcon,
  readCharacteristic,
} from "../viewer/break-characteristics";
import { Section } from "../viewer/point-conditions";
import type { Guide, GuideLine, GuideOwn, Loadable, SurfBreak } from "../viewer/types";
import {
  isTextLine,
  QUESTIONS,
  readAnswer,
  REASON_MOST,
  TEXT_LEAST,
  TEXT_LINES,
  TEXT_MOST,
  type TextLineName,
  writtenIn,
} from "./guide-words";
import { Author } from "./rank";
import type { GuideLineName, Guiding } from "./types";

type Proposed = GuideLine["proposed"][number];

// What a line shows of itself beyond its value: what waits on it, and what its reader may do.
type LineProps = {
  line: GuideLine;
  own: GuideOwn | undefined;
  guiding: Guiding;
  isOpen: boolean;
  // The contribution whose contest is being written on this line, if one is.
  contesting: string | undefined;
  onOpen: () => void;
  onClose: () => void;
  onContest: (contributionId: string | undefined) => void;
};

const quiet =
  "focus-ring cursor-pointer rounded-(--radius-xs) text-s font-medium text-neutral-10 underline underline-offset-4 outline-none";

/** How a value of a line reads: its words, or its text. */
function read(line: GuideLineName, value: string[] | string): ReactNode {
  if (isTextLine(line) || !Array.isArray(value)) return typeof value === "string" ? value : null;
  return readCharacteristic(line, value);
}

/** Why a contest is given, in a few words that only a moderator reads. */
function ContestForm({
  isSending,
  onSend,
  onCancel,
}: {
  isSending: boolean;
  onSend: (reason: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const said = reason.trim();
  return (
    <form
      className="grid gap-xs"
      onSubmit={(event) => {
        event.preventDefault();
        if (said.length >= TEXT_LEAST && !isSending) onSend(said);
      }}
    >
      <label htmlFor={id} className="text-s font-medium">
        {m.guide_contest_title()}
      </label>
      <Textarea
        id={id}
        rows={2}
        autoFocus
        maxLength={REASON_MOST}
        disabled={isSending}
        value={reason}
        aria-describedby={`${id}-hint`}
        onChange={(event) => setReason(event.target.value)}
      />
      <p id={`${id}-hint`} className="text-s text-neutral-7">
        {m.guide_contest_hint()}
      </p>
      <div className="flex flex-wrap gap-xs">
        <Button type="submit" size="sm" isPending={isSending} disabled={said.length < TEXT_LEAST}>
          {m.guide_send()}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={isSending} onClick={onCancel}>
          {m.action_cancel()}
        </Button>
      </div>
    </form>
  );
}

/**
 * What stands under a line beside what it says: what was written of it and waits to be
 * confirmed, with what its reader may say of it, and what the reader wrote that waits to be
 * read.
 */
function Waiting({ line, own, guiding, contesting, onContest }: LineProps) {
  const mine = own?.waiting.find((one) => one.line === line.line);
  const verdictOf = (id: string) => own?.verdicts.find((one) => one.contributionId === id)?.verdict;
  // What the guide says may be contested too, by whoever keeps the break and did not write it.
  const said = line.contributionId;
  // An account contests a contribution once: one that said it is right may still say that it
  // is not, once it knows better.
  const mayContestSaid =
    said !== null && own?.keeps === true && verdictOf(said) !== "contest" && own.username !== null
      ? line.by?.username !== own.username
      : false;

  const sayOf = (one: Proposed) => {
    if (mine?.id === one.id) {
      return (
        <button
          type="button"
          className={quiet}
          disabled={guiding.isSending}
          onClick={() => guiding.onWithdraw(one.id)}
        >
          {m.guide_withdraw()}
        </button>
      );
    }
    const verdict = verdictOf(one.id);
    if (verdict === "contest") {
      return <span className="text-neutral-7">{m.guide_you_contested()}</span>;
    }
    if (verdict === "confirm") {
      return (
        <span className="flex flex-wrap items-center gap-x-s gap-y-xxs">
          <span className="text-neutral-7">{m.guide_you_confirmed()}</span>
          {own?.keeps && (
            <button type="button" className={quiet} onClick={() => onContest(one.id)}>
              {m.guide_contest()}
            </button>
          )}
        </span>
      );
    }
    if (!own) return null;
    if (!own.keeps) return <span className="text-neutral-7">{m.guide_keep_first()}</span>;
    return (
      <span className="flex flex-wrap gap-xs">
        {own.mayConfirm && (
          <Button
            variant="secondary"
            size="sm"
            disabled={guiding.isSending}
            onClick={() => guiding.onConfirm(one.id)}
          >
            {m.guide_confirm()}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={guiding.isSending}
          onClick={() => onContest(one.id)}
        >
          {m.guide_contest()}
        </Button>
      </span>
    );
  };

  const isEmpty =
    line.proposed.length === 0 && mine?.status !== "pending" && !mayContestSaid && !contesting;
  if (isEmpty) return null;

  return (
    <div className="grid gap-xs">
      {line.proposed.map((one) => (
        <div key={one.id} className="grid gap-xxs rounded-(--radius-xs) bg-neutral-2 p-xs text-s">
          <div className="flex flex-wrap items-center gap-x-xs gap-y-xxs">
            <Badge variant="warning">
              {mine?.id === one.id ? m.guide_mine_shown() : m.guide_proposed()}
            </Badge>
            <span className="text-neutral-7">
              <Author by={one.by} />
            </span>
          </div>
          <div className="break-words">{read(line.line, one.value)}</div>
          {one.confirmations > 0 && (
            <p className="text-neutral-7">
              {one.confirmations === 1
                ? m.guide_confirmed_by_one()
                : m.guide_confirmed_by_some({ count: one.confirmations })}
            </p>
          )}
          {contesting === one.id ? (
            <ContestForm
              isSending={guiding.isSending}
              onSend={(reason) => guiding.onContest(one.id, reason, () => onContest(undefined))}
              onCancel={() => onContest(undefined)}
            />
          ) : (
            sayOf(one)
          )}
        </div>
      ))}
      {/* What the reader wrote and nobody has read yet shows to them alone. */}
      {mine?.status === "pending" && (
        <div className="grid gap-xxs rounded-(--radius-xs) bg-neutral-2 p-xs text-s">
          <div className="flex flex-wrap items-center justify-between gap-xs">
            <Badge>{m.guide_mine_pending()}</Badge>
            <button
              type="button"
              className={quiet}
              disabled={guiding.isSending}
              onClick={() => guiding.onWithdraw(mine.id)}
            >
              {m.guide_withdraw()}
            </button>
          </div>
          <div className="break-words">{read(line.line, mine.value)}</div>
        </div>
      )}
      {said !== null && contesting === said && (
        <ContestForm
          isSending={guiding.isSending}
          onSend={(reason) => guiding.onContest(said, reason, () => onContest(undefined))}
          onCancel={() => onContest(undefined)}
        />
      )}
      {mayContestSaid &&
        contesting !== said && (
          // Under what it contests: a list of words stands in the second column of its row.
          <div
            className={
              isTextLine(line.line)
                ? undefined
                : "grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-s [&>*]:col-start-2"
            }
          >
            <button
              type="button"
              className="focus-ring cursor-pointer justify-self-start rounded-(--radius-xs) text-s text-neutral-7 underline underline-offset-4 outline-none hover:text-neutral-10"
              onClick={() => onContest(said ?? undefined)}
            >
              {m.guide_contest()}
            </button>
          </div>
        )}
    </div>
  );
}

/** What stands under an editor: what sending means, and where it is said in full. */
function License() {
  return (
    <p className="text-s text-neutral-7">
      {m.guide_license()}{" "}
      <Link
        to="/terms"
        target="_blank"
        className="focus-ring rounded-xs underline underline-offset-2"
      >
        {m.guide_license_terms()}
      </Link>
    </p>
  );
}

/**
 * What an account goes through before it writes: one with no username chooses it here, since
 * what it writes is read under it. The editor comes once it has one.
 */
function Writer({
  own,
  guiding,
  children,
}: {
  own: GuideOwn | undefined;
  guiding: Guiding;
  children: ReactNode;
}) {
  if (!own) return <Skeleton className="h-9 w-full" />;
  if (own.username === null) {
    return (
      <div className="grid gap-xs">
        <p className="text-s">{m.guide_username_first()}</p>
        <UsernameForm current={null} onSave={guiding.onUsernameSave} onSaved={() => {}} />
      </div>
    );
  }
  return children;
}

function WordsEditor({
  line,
  field,
  saved,
  guiding,
  onDone,
}: {
  line: GuideLineName;
  // The words the line is said in, and how they read.
  field: CharacteristicField;
  saved: readonly string[];
  guiding: Guiding;
  onDone: () => void;
}) {
  const id = useId();
  const [pressed, setPressed] = useState<string[]>([...saved]);
  const isSame = pressed.length === saved.length && pressed.every((word) => saved.includes(word));
  return (
    <form
      className="grid gap-s"
      onSubmit={(event) => {
        event.preventDefault();
        if (pressed.length > 0 && !isSame && !guiding.isSending) {
          guiding.onPropose(line, pressed, onDone);
        }
      }}
    >
      <span id={id} className="sr-only">
        {field.label()}
      </span>
      <ToggleGroup
        multiple
        variant="outline"
        size="sm"
        aria-labelledby={id}
        disabled={guiding.isSending}
        value={pressed}
        onValueChange={(next) => setPressed(next as string[])}
      >
        {field.words.map(({ word, reading }) => (
          <ToggleGroupItem key={word} value={word}>
            {reading()}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap gap-xs">
        <Button
          type="submit"
          size="sm"
          isPending={guiding.isSending}
          disabled={pressed.length === 0 || isSame}
        >
          {m.guide_send()}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={guiding.isSending}
          onClick={onDone}
        >
          {m.action_cancel()}
        </Button>
      </div>
      <License />
    </form>
  );
}

function TextEditor({
  line,
  saved,
  guiding,
  onDone,
}: {
  line: TextLineName;
  saved: string;
  guiding: Guiding;
  onDone: () => void;
}) {
  const id = useId();
  // What was typed here before the panel last closed is here again.
  const [text, setText] = useState(guiding.draftOf(line) ?? saved);
  const said = text.replace(/\s+/g, " ").trim();
  const isSendable = said.length >= TEXT_LEAST && said !== saved;
  const write = (next: string) => {
    setText(next);
    guiding.onDraft(line, next === saved ? undefined : next);
  };
  const leave = () => {
    guiding.onDraft(line, undefined);
    onDone();
  };
  return (
    <form
      className="grid gap-s"
      onSubmit={(event) => {
        event.preventDefault();
        if (isSendable && !guiding.isSending) guiding.onPropose(line, said, leave);
      }}
    >
      <Textarea
        rows={4}
        autoFocus
        maxLength={TEXT_MOST}
        disabled={guiding.isSending}
        placeholder={TEXT_LINES[line].placeholder()}
        aria-label={TEXT_LINES[line].label()}
        aria-describedby={`${id}-count`}
        value={text}
        onChange={(event) => write(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-xs">
        <div className="flex flex-wrap gap-xs">
          <Button type="submit" size="sm" isPending={guiding.isSending} disabled={!isSendable}>
            {m.guide_send()}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={guiding.isSending}
            onClick={leave}
          >
            {m.action_cancel()}
          </Button>
        </div>
        <span id={`${id}-count`} className="text-s text-neutral-7 tabular-nums">
          {text.length} / {TEXT_MOST}
        </span>
      </div>
      <License />
    </form>
  );
}

/** A line that is said in the catalogue's words: its name, what it says, and who said so. */
function WordsLine(props: LineProps & { field: CharacteristicField }) {
  const { line, field, own, guiding, isOpen, onOpen, onClose } = props;
  const value = Array.isArray(line.value) ? line.value : null;
  return (
    <li className="grid gap-xs">
      <button
        type="button"
        aria-expanded={isOpen}
        className="focus-ring -mx-xs block cursor-pointer rounded-(--radius-xs) px-xs py-xxs outline-none hover:bg-neutral-3-transparent"
        onClick={isOpen ? onClose : onOpen}
      >
        <CharacteristicRow
          icon={
            <span className={value ? undefined : "text-neutral-6"}>
              <CharacteristicIcon field={field.key} given={value ?? []} />
            </span>
          }
          label={field.label()}
        >
          {value ? (
            <span className="grid gap-xxs">
              <span>{readCharacteristic(field.key, value)}</span>
              {line.origin === "contribution" && (
                <span className="text-neutral-7">
                  <Author by={line.by} />
                </span>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-xxs font-medium text-neutral-10">
              <PlusIcon data-slot="icon" aria-hidden className="size-3" />
              {m.guide_add()}
            </span>
          )}
        </CharacteristicRow>
      </button>
      <Waiting {...props} />
      {isOpen && (
        <Writer own={own} guiding={guiding}>
          <WordsEditor
            line={line.line}
            field={field}
            saved={value ?? []}
            guiding={guiding}
            onDone={onClose}
          />
        </Writer>
      )}
    </li>
  );
}

/** A line that is a short text: what it says in full, who wrote it, and what corrects it. */
function TextLine(props: LineProps & { name: TextLineName }) {
  const { line, name, own, guiding, isOpen, onOpen, onClose } = props;
  const value = typeof line.value === "string" ? line.value : null;
  const hasMine = own?.waiting.some((one) => one.line === name) ?? false;
  return (
    <li className="grid gap-xs">
      <div className="flex items-baseline justify-between gap-s">
        <h4 className="text-s font-medium">{TEXT_LINES[name].label()}</h4>
        {!isOpen && (
          <button type="button" className={quiet} onClick={onOpen}>
            <span className="inline-flex items-center gap-xxs">
              {value ? (
                <PenIcon data-slot="icon" aria-hidden className="size-3" />
              ) : (
                <PlusIcon data-slot="icon" aria-hidden className="size-3" />
              )}
              {value ? m.guide_correct() : m.guide_add()}
            </span>
          </button>
        )}
      </div>
      {value ? (
        <div className="grid gap-xxs text-s">
          <p className="break-words">{value}</p>
          <p className="flex flex-wrap items-center gap-x-xs text-neutral-7">
            <Author by={line.by} />
            {/* The language is said to a reader of another. */}
            {line.language && line.language !== getLocale() && (
              <span>{writtenIn(line.language)}</span>
            )}
          </p>
        </div>
      ) : (
        // What the reader wrote of it and waits is said just below.
        !isOpen && !hasMine && <p className="text-s text-neutral-7">{m.guide_nothing_yet()}</p>
      )}
      <Waiting {...props} />
      {isOpen && (
        <Writer own={own} guiding={guiding}>
          <TextEditor
            line={name}
            // A text that is shown from another language is not the one being written: the
            // reader writes the line in their own, from nothing.
            saved={value !== null && line.language === getLocale() ? value : ""}
            guiding={guiding}
            onDone={onClose}
          />
        </Writer>
      )}
    </li>
  );
}

/** One of the questions that every account answers for itself, and how the answers spread. */
function Question({
  spread,
  listed,
  mine,
  guiding,
}: {
  spread: Guide["answers"][number];
  // What the list the break came from says of it, where it says anything.
  listed: string | undefined;
  mine: string | undefined;
  guiding: Guiding;
}) {
  const id = useId();
  const { question, total, counts } = spread;
  const answers = Object.keys(QUESTIONS[question].answers);
  const shares = counts
    ? answers.flatMap((answer) => {
        const count = counts[answer] ?? 0;
        return count > 0
          ? [m.guide_answer_share({ answer: readAnswer(question, answer), count })]
          : [];
      })
    : [];
  return (
    <li className="grid gap-xs">
      <h4 id={id} className="text-s font-medium">
        {QUESTIONS[question].label()}
      </h4>
      <ToggleGroup
        variant="outline"
        size="sm"
        aria-labelledby={id}
        value={mine ? [mine] : []}
        onValueChange={(pressed) => {
          if (!guiding.signedIn) guiding.onSignIn(m.guide_sign_in_answer());
          else guiding.onAnswer(question, (pressed as string[]).at(-1) ?? null);
        }}
      >
        {answers.map((answer) => (
          <ToggleGroupItem key={answer} value={answer}>
            {readAnswer(question, answer)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-s text-neutral-7">
        {counts
          ? `${m.guide_answers_some({ count: total })} · ${shares.join(" · ")}`
          : total === 0
            ? (listed ?? m.guide_answers_none())
            : total === 1
              ? m.guide_answers_one()
              : m.guide_answers_few({ count: total })}
      </p>
    </li>
  );
}

type BreakGuideProps = {
  found: SurfBreak;
  guide: Loadable<Guide>;
  // What the signed-in account wrote here and may do. Undefined for a visitor, and until the
  // API has said.
  own: GuideOwn | undefined;
  guiding: Guiding;
};

/**
 * What is written of a surf break, line by line, and what lets whoever knows the place add to
 * it: decision 041. A line says its value and who gave it, opens on what completes or corrects
 * it, and shows what waits to be confirmed. Three questions are answered by each account for
 * itself.
 */
export function BreakGuide({ found, guide, own, guiding }: BreakGuideProps) {
  // One thing is open at a time: the editor of a line, or the reason of a contest on one.
  const [open, setOpen] = useState<{
    line: GuideLineName;
    contest?: string | undefined;
  } | null>(null);
  // An account that signs in from a line it pressed goes on to that line.
  const asked = useRef<GuideLineName | null>(null);
  useEffect(() => {
    if (!guiding.signedIn || asked.current === null) return;
    setOpen({ line: asked.current });
    asked.current = null;
  }, [guiding.signedIn]);

  // The catalogue still says what it knows while the guide is on its way, or did not come.
  if (!guide.data) {
    return guide.isError ? <BreakCharacteristics found={found} /> : <GuideSkeleton />;
  }

  const lineOf = (name: GuideLineName) => guide.data?.lines.find((line) => line.line === name);
  const propsOf = (line: GuideLine): LineProps => ({
    line,
    own,
    guiding,
    isOpen: open?.line === line.line && open.contest === undefined,
    contesting: open?.line === line.line ? open.contest : undefined,
    onOpen: () => {
      if (guiding.signedIn) {
        setOpen({ line: line.line });
        return;
      }
      asked.current = line.line;
      guiding.onSignIn(m.guide_sign_in());
    },
    onClose: () => setOpen(null),
    onContest: (contest) => setOpen(contest ? { line: line.line, contest } : null),
  });

  const offshore = found.characteristics.offshoreDirectionDegrees;
  const levels = found.characteristics.abilityLevels;
  const listedLevel =
    levels && levels.length > 0
      ? m.guide_level_listed({
          levels: levels.map((level) => readAnswer("level", level)).join(", "),
        })
      : undefined;

  return (
    <div className="grid gap-l">
      <p className="text-s text-neutral-7">{m.guide_hint()}</p>

      <Section title={m.break_about()}>
        <BreakDescription description={found.description} />
        <ul className="grid gap-xxs">
          {found.location && (
            <li className="py-xxs">
              <CharacteristicRow label={m.break_location()}>
                {/* The nearest place first, as an address reads. */}
                {[...found.location].reverse().join(", ")}
              </CharacteristicRow>
            </li>
          )}
          {CHARACTERISTIC_FIELDS.map((field) => {
            const line = lineOf(field.key as GuideLineName);
            return line ? <WordsLine key={field.key} field={field} {...propsOf(line)} /> : null;
          })}
          {offshore != null && (
            <li className="py-xxs">
              <CharacteristicRow
                icon={<OffshoreIcon degrees={offshore} />}
                label={m.break_offshore_wind()}
              >
                <Bearing degrees={offshore} />
              </CharacteristicRow>
            </li>
          )}
        </ul>
      </Section>

      <Section title={m.guide_on_site()}>
        <ul className="grid gap-m">
          {(Object.keys(TEXT_LINES) as TextLineName[]).map((name) => {
            const line = lineOf(name);
            return line ? <TextLine key={name} name={name} {...propsOf(line)} /> : null;
          })}
        </ul>
      </Section>

      <Section title={m.guide_lineup()}>
        <ul className="grid gap-m">
          {guide.data.answers.map((spread) => (
            <Question
              key={spread.question}
              spread={spread}
              listed={spread.question === "level" ? listedLevel : undefined}
              mine={own?.answers[spread.question]}
              guiding={guiding}
            />
          ))}
        </ul>
      </Section>
    </div>
  );
}

/** The guide's place while it loads: its lines, as bars. */
export function GuideSkeleton() {
  return (
    <div className="grid gap-s" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <Skeleton key={row} className="h-5 w-full" />
      ))}
    </div>
  );
}
