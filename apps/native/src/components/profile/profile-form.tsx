import type { ProfileAnswers } from "@repo/client/viewer/types";
import { useState } from "react";
import { RefreshControl, View } from "react-native";

import { Step } from "@/components/account/settings-steps";
import { ErrorState } from "@/components/ui/error-state";
import { useAppForm, useSelector } from "@/components/ui/form";
import { useSheetGuard } from "@/components/ui/sheet";
import { Loading, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { BOARD_WORDS } from "./profile-words";
import {
  ASKED_BOARDS,
  answersOf,
  type Board,
  type Level,
  LEVELS,
  type Reading,
  sameAnswers,
  type SurfSize,
} from "./profiling";
import { LevelChoice, ReadingChoice, WaveRange } from "./questions";
import { useProfile } from "./use-profile";

/** The waves surfed, from the smallest to the biggest, as the form holds them. */
type Waves = { smallest: SurfSize | null; biggest: SurfSize | null };

/** Every answer, as the form holds it, as the web's: the boards as the toggles hold them. */
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

/** The answers the form holds, as the API keeps them: no board pressed is no answer. */
function answersFrom(values: ProfileValues): ProfileAnswers {
  return {
    level: values.level,
    smallestWave: values.waves.smallest,
    biggestWave: values.waves.biggest,
    reading: values.reading,
    boards: values.boards.length > 0 ? (values.boards as Board[]) : null,
  };
}

/** A toggle for each board a surfer is asked about, in the reader's language. */
const boardOptions = () =>
  ASKED_BOARDS.map((board) => ({ value: board, label: BOARD_WORDS[board]?.() ?? board }));

/**
 * Every question on one step of the account's tab, to change what the account said of itself,
 * as the web's form lays them out (decision 076): what the step is for, each question with what
 * it means under it, and Save at the end, which replaces every answer at once, whatever changed,
 * and is never held still. Nothing here can be wrong, so the form only binds each control to its
 * answer. Leaving with answers not saved asks first, since a swipe back would lose them; a save
 * that failed is told, which the web leaves unsaid. Decision 063.
 */
function ProfileForm({
  initial,
  isSaving,
  onSave,
}: {
  initial: ProfileAnswers;
  isSaving: boolean;
  onSave: (answers: ProfileAnswers) => Promise<boolean>;
}) {
  const { space } = useTheme();
  const tell = useTell();
  // What the form opens with: the answers as they were when it opened.
  const [opening] = useState(() => valuesOf(initial));
  const form = useAppForm({
    defaultValues: opening,
    onSubmit: async ({ value }) => {
      if (!(await onSave(answersFrom(value)))) {
        tell({ title: m.profile_error(), tone: "danger" });
        return;
      }
      tell({ title: m.profile_saved(), tone: "success" });
      guard.close();
    },
  });
  const dirty = useSelector(
    form.store,
    (state) => !sameAnswers(answersFrom(state.values), initial),
  );
  const guard = useSheetGuard(dirty && !isSaving);

  return (
    <Step title={m.profile_title()}>
      <form.AppForm>
        <Text size="s" tone="muted">
          {m.profile_hint()}
        </Text>
        <form.AppField name="level">
          {(field) => (
            <field.Control<Level | null> label={m.profile_level_title()} gap={space.s}>
              {(control) => <LevelChoice value={control.value} onPick={control.onChange} />}
            </field.Control>
          )}
        </form.AppField>
        <form.AppField name="waves">
          {(field) => (
            <field.Control<Waves> label={m.profile_waves_title()} gap={space.s}>
              {(control) => (
                <WaveRange
                  smallest={control.value.smallest}
                  biggest={control.value.biggest}
                  onChange={(smallest, biggest) => control.onChange({ smallest, biggest })}
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
              gap={space.s}
            >
              {(control) => <ReadingChoice value={control.value} onPick={control.onChange} />}
            </field.Control>
          )}
        </form.AppField>
        <form.AppField name="boards">
          {(field) => (
            <field.Choice
              label={m.profile_boards_title()}
              description={m.profile_boards_hint()}
              multiple
              size="m"
              options={boardOptions()}
            />
          )}
        </form.AppField>
        <form.SubmitButton pending={isSaving} style={{ alignSelf: "flex-start" }}>
          {m.profile_save()}
        </form.SubmitButton>
      </form.AppForm>
    </Step>
  );
}

/** The place of the form while its answers come: what it is for, and its first question. */
function ProfileSkeleton() {
  const { space, type } = useTheme();
  return (
    <Loading>
      <View style={{ gap: space.l }}>
        <SkeletonText size="s" lines={2} />
        <View style={{ gap: space.s }}>
          <Skeleton height={type.m.size} width="40%" />
          <View style={{ gap: space.xs }}>
            {LEVELS.map((level) => (
              // A card's height: its name over what it means.
              <Skeleton key={level} height={2 * space.xs + space.xxs + type.m.line + type.s.line} />
            ))}
          </View>
        </View>
      </View>
    </Loading>
  );
}

/** The step that changes the account's answers, once the API has said what they are. */
export function ProfileStep() {
  const { colors } = useTheme();
  const profiling = useProfile();

  if (profiling.isPending) {
    return (
      <Step title={m.profile_title()}>
        <ProfileSkeleton />
      </Step>
    );
  }
  if (profiling.isError) {
    return (
      <Step
        title={m.profile_title()}
        refreshControl={
          <RefreshControl
            refreshing={profiling.isRefetching}
            onRefresh={profiling.retry}
            tintColor={colors["neutral-7"]}
          />
        }
      >
        <ErrorState
          plain
          title={m.native_profile_load_failed()}
          onRetry={profiling.retry}
          retrying={profiling.isRefetching}
        />
      </Step>
    );
  }
  return (
    <ProfileForm
      initial={answersOf(profiling.profile)}
      isSaving={profiling.isSaving}
      onSave={profiling.onSave}
    />
  );
}
