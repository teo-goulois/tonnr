import type { ProfileAnswers } from "@repo/client/viewer/types";
import { useState } from "react";
import { RefreshControl, View } from "react-native";

import { Step } from "@/components/account/settings-steps";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useSheetGuard } from "@/components/ui/sheet";
import { Loading, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { answersOf, LEVELS, sameAnswers } from "./profiling";
import { BoardChoice, LevelChoice, Question, ReadingChoice, WaveRange } from "./questions";
import { useProfile } from "./use-profile";

/**
 * Every question on one step of the account's tab, to change what the account said of itself,
 * as the web's form lays them out: what the step is for, each question with what it means under
 * it, and Save at the end, which replaces every answer at once, whatever changed. Leaving with
 * answers not saved asks first, since a swipe back would lose them. Decision 063.
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
  const tell = useTell();
  const [answers, setAnswers] = useState(initial);
  const dirty = !sameAnswers(answers, initial);
  const guard = useSheetGuard(dirty && !isSaving);
  const change = (part: Partial<ProfileAnswers>) =>
    setAnswers((current) => ({ ...current, ...part }));

  async function save() {
    if (await onSave(answers)) {
      tell({ title: m.profile_saved(), tone: "success" });
      guard.close();
    } else {
      tell({ title: m.profile_error(), tone: "danger" });
    }
  }

  return (
    <Step title={m.profile_title()}>
      <Text size="s" tone="muted">
        {m.profile_hint()}
      </Text>
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
      <Question title={m.profile_boards_title()} hint={m.profile_boards_hint()} close>
        <BoardChoice value={answers.boards} onChange={(boards) => change({ boards })} />
      </Question>
      <Button loading={isSaving} onPress={() => void save()} style={{ alignSelf: "flex-start" }}>
        {m.profile_save()}
      </Button>
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
