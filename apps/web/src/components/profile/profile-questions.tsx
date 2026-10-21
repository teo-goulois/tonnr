import { APP_NAME } from "@repo/config/app";
import { SIZES, sizeRank } from "@repo/conditions/sessions/sizes";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { useAppForm } from "@repo/ui/hooks/form/form";
import {
  BellOnFillDuoIcon,
  BookBookmarkFillDuoIcon,
  SparklesFillDuoIcon,
  XIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";

import { UsernameForm } from "@/components/account/username-form";
import { Tile } from "@/components/landing/landing-parts";
import { scaleColor, WAVE_HEIGHT_SCALE } from "@/lib/sea-scales";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { sizeFace, sizeName, SurfSizePicture } from "../sessions/surf-size";
import type { SurfSize } from "../sessions/types";
import type { ProfileAnswers, Profiling, SurferProfile } from "../viewer/types";

// What an account says of itself as a surfer, asked once as it comes and changed in its panel:
// decision 063.

type Level = NonNullable<ProfileAnswers["level"]>;
type Reading = NonNullable<ProfileAnswers["reading"]>;
type Board = NonNullable<ProfileAnswers["boards"]>[number];

const LEVELS: Record<Level, { name: () => string; hint: () => string }> = {
  beginner: { name: m.break_level_beginner, hint: m.profile_level_beginner_hint },
  intermediate: { name: m.break_level_intermediate, hint: m.profile_level_intermediate_hint },
  advanced: { name: m.break_level_advanced, hint: m.profile_level_advanced_hint },
  pro: { name: m.break_level_pro, hint: m.profile_level_pro_hint },
};
const READINGS: Record<Reading, () => string> = {
  glance: m.profile_reading_glance,
  basics: m.profile_reading_basics,
  everything: m.profile_reading_everything,
};
// The boards a surfer is asked about: those of the catalogue that one rides in the waves of a
// break. A kite, a tow or a skimboard is for another question.
const BOARDS = {
  shortboard: m.break_board_shortboard,
  fish: m.break_board_fish,
  funboard: m.break_board_funboard,
  longboard: m.break_board_longboard,
  gun: m.break_board_gun,
  bodyboard: m.break_board_bodyboard,
  bodysurf: m.break_board_bodysurf,
  foil: m.break_board_foil,
  sup: m.break_board_sup,
} satisfies Partial<Record<Board, () => string>>;
type AskedBoard = keyof typeof BOARDS;

export const levelName = (level: Level) => LEVELS[level].name();

/** What the account said, in a few words: "Intermediate · Knee to Head". Null when nothing. */
export function profileWords(profile: SurferProfile | null | undefined) {
  if (!profile) return null;
  const waves =
    profile.smallestWave && profile.biggestWave
      ? m.profile_waves_range({
          from: sizeName(profile.smallestWave),
          to: sizeName(profile.biggestWave),
        })
      : null;
  const said = [profile.level && levelName(profile.level), waves].filter(Boolean);
  return said.length > 0 ? said.join(" · ") : null;
}

const NO_ANSWERS: ProfileAnswers = {
  level: null,
  smallestWave: null,
  biggestWave: null,
  reading: null,
  boards: null,
};

function answersOf(profile: SurferProfile | null | undefined): ProfileAnswers {
  if (!profile) return NO_ANSWERS;
  const { level, smallestWave, biggestWave, reading, boards } = profile;
  return { level, smallestWave, biggestWave, reading, boards };
}

// A choice gives way under a press as a button does, and takes its color on the theme's motion.
const pressable =
  "transition-[background-color,translate] duration-(--motion-duration) ease-theme hover:bg-neutral-3-transparent active:translate-y-(--motion-press-distance)";

/**
 * What names a control of the questions and says more of it, by the ids of what does, where they
 * stand beside it: in a form, its field. Left out, the control names itself.
 */
type Named = { labelledBy?: string | undefined; describedBy?: string | undefined };

/** One choice among a few, each a line that says its name and, under it, what it means. */
function Choices<Value extends string>({
  label,
  options,
  value,
  onPick,
  labelledBy,
  describedBy,
}: Named & {
  label: string;
  options: { value: Value; name: string; hint?: string }[];
  value: Value | null;
  onPick: (value: Value) => void;
}) {
  return (
    <div
      role="group"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="grid gap-xs"
    >
      {options.map((option) => {
        const isChosen = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isChosen}
            onClick={() => onPick(option.value)}
            className={cn(
              "focus-ring edge grid min-h-11 cursor-pointer gap-xxs rounded-(--radius-xs) px-s py-xs text-left outline-none",
              pressable,
              isChosen
                ? "bg-neutral-3 [--edge-color:var(--neutral-10)] [--edge-width:var(--border-m)]"
                : "[--edge-color:var(--neutral-4)]",
            )}
          >
            <span className="font-medium">{option.name}</span>
            {option.hint && <span className="text-s text-neutral-7">{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

function LevelChoice({
  value,
  onPick,
  ...named
}: Named & { value: Level | null; onPick: (level: Level) => void }) {
  return (
    <Choices
      {...named}
      label={m.profile_level_title()}
      options={(Object.keys(LEVELS) as Level[]).map((level) => ({
        value: level,
        name: LEVELS[level].name(),
        hint: LEVELS[level].hint(),
      }))}
      value={value}
      onPick={onPick}
    />
  );
}

function ReadingChoice({
  value,
  onPick,
  ...named
}: Named & {
  value: Reading | null;
  onPick: (reading: Reading) => void;
}) {
  return (
    <Choices
      {...named}
      label={m.profile_reading_title()}
      options={(Object.keys(READINGS) as Reading[]).map((reading) => ({
        value: reading,
        name: READINGS[reading](),
      }))}
      value={value}
      onPick={onPick}
    />
  );
}

function BoardChoice({
  value,
  onChange,
}: {
  value: Board[] | null;
  onChange: (boards: Board[] | null) => void;
}) {
  return (
    <ToggleGroup
      multiple
      variant="outline"
      aria-label={m.profile_boards_title()}
      value={value ?? []}
      onValueChange={(pressed) => onChange(pressed.length > 0 ? (pressed as Board[]) : null)}
    >
      {boardToggles()}
    </ToggleGroup>
  );
}

/** A toggle for each board a surfer is asked about. */
function boardToggles() {
  return (Object.keys(BOARDS) as AskedBoard[]).map((board) => (
    <ToggleGroupItem key={board} value={board}>
      {BOARDS[board]()}
    </ToggleGroupItem>
  ));
}

/**
 * The waves a surfer surfs, from the smallest to the biggest, among the nine pictures a session
 * says sizes with: a first press says the smallest, a second the biggest, and the sizes between
 * are marked. A press after that begins again.
 */
export function WaveRange({
  smallest,
  biggest,
  onChange,
  labelledBy,
  describedBy,
}: Named & {
  smallest: SurfSize | null;
  biggest: SurfSize | null;
  onChange: (smallest: SurfSize | null, biggest: SurfSize | null) => void;
}) {
  useUnits();
  const isHalf = smallest !== null && biggest === null;

  function pick(size: SurfSize) {
    if (smallest !== null && biggest === null && sizeRank(size) >= sizeRank(smallest)) {
      onChange(smallest, size);
    } else {
      onChange(size, null);
    }
  }

  return (
    <div className="grid gap-s">
      <p aria-live="polite" className="text-s text-neutral-7">
        {isHalf ? m.profile_waves_second() : m.profile_waves_first()}
      </p>
      <div
        role="group"
        aria-label={labelledBy ? undefined : m.profile_waves_title()}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className="grid grid-cols-3 gap-xs"
      >
        {SIZES.map((size) => {
          const rank = sizeRank(size);
          const isEnd = size === smallest || size === biggest;
          const isBetween =
            smallest !== null &&
            biggest !== null &&
            rank > sizeRank(smallest) &&
            rank < sizeRank(biggest);
          // Once the smallest is said, a smaller one would begin again: it reads paler.
          const isBelow = isHalf && rank < sizeRank(smallest);
          return (
            <button
              key={size}
              type="button"
              aria-pressed={isEnd || isBetween}
              onClick={() => pick(size)}
              // Once the biggest is said, the sizes up to it fill one after the other, from the
              // smallest: the range is drawn as it is read.
              style={
                smallest !== null && biggest !== null && (isBetween || size === biggest)
                  ? { transitionDelay: `${(rank - sizeRank(smallest)) * 40}ms` }
                  : undefined
              }
              className={cn(
                "focus-ring edge grid cursor-pointer gap-xxs rounded-(--radius-xs) p-xs text-center outline-none",
                pressable,
                isEnd
                  ? "bg-neutral-3 [--edge-color:var(--neutral-10)] [--edge-width:var(--border-m)]"
                  : isBetween
                    ? "bg-neutral-3 [--edge-color:var(--neutral-4)]"
                    : "[--edge-color:var(--neutral-4)]",
                isBelow && "opacity-35",
              )}
            >
              <SurfSizePicture size={size} />
              <span className="text-s leading-tight font-medium text-balance">
                {sizeName(size)}
              </span>
              <span className="truncate text-xs leading-tight text-neutral-7 tabular-nums">
                {sizeFace(size)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The waves a surfer surfs, from the smallest to the biggest, as the form holds them. */
type Waves = { smallest: SurfSize | null; biggest: SurfSize | null };

/** Every answer, as the form holds it: the boards as the toggles hold them, none for no answer. */
type ProfileValues = {
  level: Level | null;
  waves: Waves;
  reading: Reading | null;
  boards: string[];
};

function valuesOf(answers: ProfileAnswers): ProfileValues {
  return {
    level: answers.level,
    waves: { smallest: answers.smallestWave, biggest: answers.biggestWave },
    reading: answers.reading,
    boards: answers.boards ?? [],
  };
}

// A question's title, its control and what it says more, as each field's adapter lays them out.
const QUESTION = "grid min-w-0 gap-s";

/**
 * Every question on one page, one step into the account's panel: what the account said, to
 * change. Saving replaces every answer at once. Decision 076 says how the form is made: nothing
 * here can be wrong, so the form only binds each control to its answer.
 */
export function ProfileForm({ profiling, onSaved }: { profiling: Profiling; onSaved: () => void }) {
  // What the form opens with: the answers as they were when it opened.
  const [opening] = useState(() => valuesOf(answersOf(profiling.profile)));
  const form = useAppForm({
    defaultValues: opening,
    onSubmit: async ({ value }) => {
      const kept = await profiling.onSave({
        level: value.level,
        smallestWave: value.waves.smallest,
        biggestWave: value.waves.biggest,
        reading: value.reading,
        boards: value.boards.length > 0 ? (value.boards as Board[]) : null,
      });
      if (!kept) return;
      toast.success(m.profile_saved());
      onSaved();
    },
  });

  return (
    <form.AppForm>
      <form.Form className="grid gap-l">
        <p className="text-s text-neutral-7">{m.profile_hint()}</p>
        <form.AppField name="level">
          {(field) => (
            <field.Control<Level | null> label={m.profile_level_title()} className={QUESTION}>
              {(control) => (
                <LevelChoice
                  value={control.value}
                  onPick={control.onChange}
                  labelledBy={control["aria-labelledby"]}
                  describedBy={control["aria-describedby"]}
                />
              )}
            </field.Control>
          )}
        </form.AppField>
        <form.AppField name="waves">
          {(field) => (
            <field.Control<Waves> label={m.profile_waves_title()} className={QUESTION}>
              {(control) => (
                <WaveRange
                  smallest={control.value.smallest}
                  biggest={control.value.biggest}
                  onChange={(smallest, biggest) => control.onChange({ smallest, biggest })}
                  labelledBy={control["aria-labelledby"]}
                  describedBy={control["aria-describedby"]}
                />
              )}
            </field.Control>
          )}
        </form.AppField>
        <form.AppField name="reading">
          {(field) => (
            <field.Control<Reading | null>
              label={m.profile_reading_title()}
              description={m.profile_reading_hint()}
              className={QUESTION}
            >
              {(control) => (
                <ReadingChoice
                  value={control.value}
                  onPick={control.onChange}
                  labelledBy={control["aria-labelledby"]}
                  describedBy={control["aria-describedby"]}
                />
              )}
            </field.Control>
          )}
        </form.AppField>
        <form.AppField name="boards">
          {(field) => (
            <field.Choice
              label={m.profile_boards_title()}
              description={m.profile_boards_hint()}
              multiple
              size="default"
            >
              {boardToggles()}
            </field.Choice>
          )}
        </form.AppField>
        <div>
          <form.SubmitButton isPending={profiling.isSaving}>{m.profile_save()}</form.SubmitButton>
        </div>
      </form.Form>
    </form.AppForm>
  );
}

type Step = "welcome" | "username" | "level" | "waves" | "reading" | "boards";

// How long a choice that leads on stays in view, chosen, before the next question comes.
const SEEN_CHOSEN = 220;

/**
 * A part of a step as it comes: a fade, with a blur that clears and a slide from the side the
 * step comes from, on the theme's large easing, a tenth of a second after the part before it. A
 * reader who asked for no motion gets the fade alone.
 */
function Arrive({
  place,
  from,
  className,
  children,
}: {
  place: number;
  from: "start" | "end";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{ animationDelay: `${place * 100}ms` } as CSSProperties}
      className={cn(
        "animate-in fade-in fill-mode-backwards duration-(--motion-large-duration) ease-theme-large motion-safe:blur-in-[4px]",
        from === "end" ? "motion-safe:slide-in-from-right-3" : "motion-safe:slide-in-from-left-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Where the questions are: one mark for each, filled up to the one in view. */
function Progress({ at, count }: { at: number; count: number }) {
  return (
    <div className="flex flex-1 items-center">
      <div aria-hidden className="flex flex-1 gap-xxs">
        {Array.from({ length: count }, (_, place) => (
          <span
            key={place}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-(--motion-large-duration) ease-theme-large",
              place <= at ? "bg-neutral-10" : "bg-neutral-4",
            )}
          />
        ))}
      </div>
      {/* The marks say it to the eye: the count is said to a screen reader alone. */}
      <p className="sr-only">{m.onboarding_step({ step: at + 1, count })}</p>
    </div>
  );
}

/**
 * The picture the questions open on, a surfer on a wave in black and white, with the title over
 * it: a shade at its foot keeps the words read on the white of the foam.
 */
function WelcomePicture({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-(--radius-s) outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10">
      <img
        src="/onboarding/welcome.webp"
        alt=""
        width={750}
        height={460}
        className="aspect-[3/1] w-full object-cover object-[50%_35%]"
      />
      <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute inset-x-m bottom-s text-white">{children}</div>
    </div>
  );
}

// When each line's tile says it is there: once the lines have come, one after the other.
const POP_AFTER = ["[animation-delay:500ms]", "[animation-delay:600ms]", "[animation-delay:700ms]"];

const WELCOME = [
  { icon: BellOnFillDuoIcon, text: m.onboarding_alerts, color: scaleColor(WAVE_HEIGHT_SCALE, 4) },
  {
    icon: BookBookmarkFillDuoIcon,
    text: m.onboarding_logbook,
    color: scaleColor(WAVE_HEIGHT_SCALE, 1.5),
  },
  { icon: SparklesFillDuoIcon, text: m.onboarding_agents, color: scaleColor(WAVE_HEIGHT_SCALE, 8) },
];

/**
 * What an account is asked once, as it comes, existing accounts as new ones: what the app does
 * best, in three lines, then a few questions, one at a time, each of which may be skipped. The
 * last leads to the map. Leaving puts the questions off: the account answers them later in its
 * panel. An account with no username chooses it here. Decision 063.
 */
export function Onboarding({
  profiling,
  username,
  onUsernameSave,
}: {
  profiling: Profiling;
  // Null for an account that has chosen none, which is asked for one among the questions.
  username: string | null | undefined;
  onUsernameSave: (username: string) => Promise<string | undefined>;
}) {
  const [step, setStep] = useState<Step>("welcome");
  // The side a step comes from: the next from the end, the one before from the start.
  const [from, setFrom] = useState<"start" | "end">("end");
  // The dialog opens on what begins, not on what leaves.
  const start = useRef<HTMLButtonElement>(null);
  const [answers, setAnswers] = useState<ProfileAnswers>(NO_ANSWERS);
  // Asked for a username from the start, and still once it is chosen, so that the steps hold.
  const [asksName] = useState(() => username === null);
  const steps: Step[] = [
    ...(asksName ? (["username"] as const) : []),
    "level",
    "waves",
    "reading",
    "boards",
  ];
  const at = steps.indexOf(step);
  const change = (part: Partial<ProfileAnswers>) =>
    setAnswers((current) => ({ ...current, ...part }));
  const next = () => {
    const following = steps[at + 1];
    setFrom("end");
    if (following) setStep(following);
  };
  const back = () => {
    setFrom("start");
    setStep(at > 0 ? steps[at - 1]! : "welcome");
  };
  // A choice that leads on is seen chosen first.
  const nextSoon = () => setTimeout(next, SEEN_CHOSEN);

  function finish() {
    void profiling.onSave(answers).then((kept) => {
      if (!kept) toast.error(m.profile_error());
    });
  }

  return (
    <Dialog
      open={profiling.isAsking}
      onOpenChange={(open) => {
        if (!open) profiling.onPutOff();
      }}
      // A press beside it would lose the answers: only its button and Escape leave.
      disablePointerDismissal
    >
      <DialogPopup className="w-[min(28rem,calc(100vw-2rem))] gap-m p-l" initialFocus={start}>
        {step === "welcome" && (
          <Arrive place={0} from={from}>
            <WelcomePicture>
              <DialogTitle>{m.onboarding_title({ name: APP_NAME })}</DialogTitle>
            </WelcomePicture>
          </Arrive>
        )}
        <div className="grid gap-xs">
          {/* Where the questions are, on the line of the button that leaves them. The welcome is
              left by its own "Later", and by Escape. */}
          {step !== "welcome" && (
            <div className="flex items-center gap-s">
              <Progress at={at} count={steps.length} />
              <DialogClose
                aria-label={m.action_close()}
                render={<Button variant="ghost" size="icon" className="-my-xs -mr-xs" />}
              >
                <XIcon data-slot="icon" aria-hidden />
              </DialogClose>
            </div>
          )}
          <Arrive
            key={step}
            place={step === "welcome" ? 1 : 0}
            from={from}
            className="grid gap-xxs"
          >
            {step !== "welcome" && (
              <DialogTitle>
                {step === "username"
                  ? m.profile_username_title()
                  : step === "level"
                    ? m.profile_level_title()
                    : step === "waves"
                      ? m.profile_waves_title()
                      : step === "reading"
                        ? m.profile_reading_title()
                        : m.profile_boards_title()}
              </DialogTitle>
            )}
            {step === "welcome" && <DialogDescription>{m.onboarding_text()}</DialogDescription>}
            {step === "reading" && (
              <DialogDescription>{m.profile_reading_hint()}</DialogDescription>
            )}
            {step === "boards" && <DialogDescription>{m.profile_boards_hint()}</DialogDescription>}
          </Arrive>
        </div>

        <Arrive key={step} place={step === "welcome" ? 2 : 1} from={from}>
          {step === "welcome" && (
            <ul className="grid gap-s">
              {WELCOME.map(({ icon: Icon, text, color }, place) => (
                <li key={place} className="flex items-start gap-s">
                  {/* Each tile says it is there once, after its line has come. */}
                  <Tile
                    color={color}
                    className={cn(
                      "mt-0.5 mr-0 shrink-0 text-xl motion-safe:animate-landing-pop",
                      POP_AFTER[place],
                    )}
                  >
                    <Icon />
                  </Tile>
                  <span className="text-pretty">{text()}</span>
                </li>
              ))}
            </ul>
          )}
          {step === "username" && (
            <div className="grid gap-s">
              <p className="text-s text-neutral-7">{m.username_none()}</p>
              <UsernameForm current={username ?? null} onSave={onUsernameSave} onSaved={next} />
            </div>
          )}
          {step === "level" && (
            <LevelChoice
              value={answers.level}
              onPick={(level) => {
                change({ level });
                nextSoon();
              }}
            />
          )}
          {step === "waves" && (
            <WaveRange
              smallest={answers.smallestWave}
              biggest={answers.biggestWave}
              onChange={(smallestWave, biggestWave) => change({ smallestWave, biggestWave })}
            />
          )}
          {step === "reading" && (
            <ReadingChoice
              value={answers.reading}
              onPick={(reading) => {
                change({ reading });
                nextSoon();
              }}
            />
          )}
          {step === "boards" && (
            <BoardChoice value={answers.boards} onChange={(boards) => change({ boards })} />
          )}
        </Arrive>

        {step === "welcome" ? (
          // Leaving at the start, going on at the end, as the steps' own buttons stand.
          <Arrive
            place={3}
            from={from}
            className="flex flex-wrap items-center justify-between gap-xs"
          >
            <Button variant="ghost" onClick={profiling.onPutOff}>
              {m.onboarding_later()}
            </Button>
            <Button ref={start} onClick={() => setStep(steps[0]!)}>
              {m.onboarding_start()}
            </Button>
          </Arrive>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-xs">
            <Button variant="ghost" onClick={back}>
              {m.action_back()}
            </Button>
            {step === "boards" ? (
              <Button isPending={profiling.isSaving} onClick={finish}>
                {m.onboarding_explore()}
              </Button>
            ) : (
              <Button
                variant={hasAnswer(step, answers, username) ? "default" : "ghost"}
                onClick={next}
              >
                {hasAnswer(step, answers, username) ? m.onboarding_next() : m.onboarding_skip()}
              </Button>
            )}
          </div>
        )}
      </DialogPopup>
    </Dialog>
  );
}

/** Whether a step was answered, which its button then says by going on rather than skipping. */
function hasAnswer(step: Step, answers: ProfileAnswers, username: string | null | undefined) {
  switch (step) {
    case "username":
      return Boolean(username);
    case "level":
      return answers.level !== null;
    case "waves":
      return answers.biggestWave !== null;
    case "reading":
      return answers.reading !== null;
    default:
      return false;
  }
}
