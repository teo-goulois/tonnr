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
import { BellIcon, LogbookIcon, SparkleIcon, XIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { UsernameForm } from "@/components/account/username-form";
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

/** One choice among a few, each a line that says its name and, under it, what it means. */
function Choices<Value extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { value: Value; name: string; hint?: string }[];
  value: Value | null;
  onPick: (value: Value) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-xs">
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
              "transition-colors duration-(--motion-duration) ease-theme hover:bg-neutral-3-transparent",
              isChosen
                ? "bg-neutral-3 [--edge-color:var(--neutral-12)] [--edge-width:var(--border-m)]"
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

function LevelChoice({ value, onPick }: { value: Level | null; onPick: (level: Level) => void }) {
  return (
    <Choices
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
}: {
  value: Reading | null;
  onPick: (reading: Reading) => void;
}) {
  return (
    <Choices
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
      {(Object.keys(BOARDS) as AskedBoard[]).map((board) => (
        <ToggleGroupItem key={board} value={board}>
          {BOARDS[board]()}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
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
}: {
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
      <div role="group" aria-label={m.profile_waves_title()} className="grid grid-cols-3 gap-xs">
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
              className={cn(
                "focus-ring edge grid cursor-pointer gap-xxs rounded-(--radius-xs) p-xs text-center outline-none",
                "transition-colors duration-(--motion-duration) ease-theme hover:bg-neutral-3-transparent",
                isEnd
                  ? "bg-neutral-3 [--edge-color:var(--neutral-12)] [--edge-width:var(--border-m)]"
                  : isBetween
                    ? "bg-neutral-3-transparent [--edge-color:var(--neutral-6)]"
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

function Question({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-s">
      <div className="grid gap-xxs">
        <h3 className="font-medium">{title}</h3>
        {hint && <p className="text-s text-neutral-7">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Every question on one page, one step into the account's panel: what the account said, to
 * change. Saving replaces every answer at once.
 */
export function ProfileForm({ profiling, onSaved }: { profiling: Profiling; onSaved: () => void }) {
  const [answers, setAnswers] = useState<ProfileAnswers>(() => answersOf(profiling.profile));
  const change = (part: Partial<ProfileAnswers>) =>
    setAnswers((current) => ({ ...current, ...part }));

  return (
    <form
      className="grid gap-l"
      onSubmit={(event) => {
        event.preventDefault();
        void profiling.onSave(answers).then((kept) => {
          if (!kept) return;
          toast.success(m.profile_saved());
          onSaved();
        });
      }}
    >
      <p className="text-s text-neutral-7">{m.profile_hint()}</p>
      <Question title={m.profile_level_title()}>
        <LevelChoice value={answers.level} onPick={(level) => change({ level })} />
      </Question>
      <Question title={m.profile_waves_title()}>
        <WaveRange
          smallest={answers.smallestWave}
          biggest={answers.biggestWave}
          onChange={(smallestWave, biggestWave) => change({ smallestWave, biggestWave })}
        />
      </Question>
      <Question title={m.profile_reading_title()} hint={m.profile_reading_hint()}>
        <ReadingChoice value={answers.reading} onPick={(reading) => change({ reading })} />
      </Question>
      <Question title={m.profile_boards_title()} hint={m.profile_boards_hint()}>
        <BoardChoice value={answers.boards} onChange={(boards) => change({ boards })} />
      </Question>
      <div>
        <Button type="submit" isPending={profiling.isSaving}>
          {m.profile_save()}
        </Button>
      </div>
    </form>
  );
}

type Step = "welcome" | "username" | "level" | "waves" | "reading" | "boards";

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
    if (following) setStep(following);
  };
  const back = () => setStep(at > 0 ? steps[at - 1]! : "welcome");

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
      <DialogPopup className="w-[min(28rem,calc(100vw-2rem))] gap-m p-l">
        <div className="flex items-start justify-between gap-s">
          <div className="grid gap-xxs">
            {step !== "welcome" && (
              <p className="text-s text-neutral-7 tabular-nums">
                {m.onboarding_step({ step: at + 1, count: steps.length })}
              </p>
            )}
            <DialogTitle>
              {step === "welcome"
                ? m.onboarding_title({ name: APP_NAME })
                : step === "username"
                  ? m.profile_username_title()
                  : step === "level"
                    ? m.profile_level_title()
                    : step === "waves"
                      ? m.profile_waves_title()
                      : step === "reading"
                        ? m.profile_reading_title()
                        : m.profile_boards_title()}
            </DialogTitle>
            {step === "welcome" && <DialogDescription>{m.onboarding_text()}</DialogDescription>}
            {step === "reading" && (
              <DialogDescription>{m.profile_reading_hint()}</DialogDescription>
            )}
            {step === "boards" && <DialogDescription>{m.profile_boards_hint()}</DialogDescription>}
          </div>
          <DialogClose
            aria-label={m.action_close()}
            render={<Button variant="ghost" size="icon" className="-mt-xs -mr-xs" />}
          >
            <XIcon data-slot="icon" aria-hidden />
          </DialogClose>
        </div>

        {step === "welcome" && (
          <>
            <ul className="grid gap-s">
              {[
                { icon: BellIcon, text: m.onboarding_alerts() },
                { icon: LogbookIcon, text: m.onboarding_logbook() },
                { icon: SparkleIcon, text: m.onboarding_agents() },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-s">
                  <Icon data-slot="icon" aria-hidden className="mt-xxs shrink-0 text-neutral-7" />
                  <span className="text-pretty">{text}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-xs">
              <Button onClick={() => setStep(steps[0]!)}>{m.onboarding_start()}</Button>
              <Button variant="ghost" onClick={profiling.onPutOff}>
                {m.onboarding_later()}
              </Button>
            </div>
          </>
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
              next();
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
              next();
            }}
          />
        )}
        {step === "boards" && (
          <BoardChoice value={answers.boards} onChange={(boards) => change({ boards })} />
        )}

        {step !== "welcome" && (
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
