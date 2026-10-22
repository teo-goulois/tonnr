import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import type { Board, Level, Reading, SurfSize } from "./profiling";
import { BoardChoice, LevelChoice, Question, ReadingChoice, WaveRange } from "./questions";

// What an account says of itself as a surfer, with invented answers, as the web's design system
// shows it (`profile-samples.tsx`): the questions as one step into the account's tab draws them,
// and the dialog they are asked in once, which keeps nothing here. Decision 063.

export function ProfileSamples() {
  const { space } = useTheme();
  const [level, setLevel] = useState<Level | null>("intermediate");
  const [waves, setWaves] = useState<{ smallest: SurfSize | null; biggest: SurfSize | null }>({
    smallest: "knee",
    biggest: "head",
  });
  const [reading, setReading] = useState<Reading | null>("basics");
  const [boards, setBoards] = useState<Board[] | null>(["funboard", "longboard"]);

  return (
    <View style={{ gap: space.l }}>
      <View style={{ alignItems: "flex-start", gap: space.xxs }}>
        <Button
          variant="secondary"
          onPress={() => router.push({ pathname: "/onboarding", params: { sample: "1" } })}
        >
          Open the questions
        </Button>
        <Text size="xs" tone="muted">
          The dialog an account is asked in once, over the map: it keeps nothing from here.
        </Text>
      </View>
      <Question title={m.profile_level_title()}>
        <LevelChoice value={level} onPick={setLevel} />
      </Question>
      <Question title={m.profile_waves_title()}>
        <WaveRange
          smallest={waves.smallest}
          biggest={waves.biggest}
          onChange={(smallest, biggest) => setWaves({ smallest, biggest })}
        />
      </Question>
      <Question title={m.profile_reading_title()} hint={m.profile_reading_hint()}>
        <ReadingChoice value={reading} onPick={setReading} />
      </Question>
      <Question title={m.profile_boards_title()} hint={m.profile_boards_hint()} close>
        <BoardChoice value={boards} onChange={setBoards} />
      </Question>
    </View>
  );
}
