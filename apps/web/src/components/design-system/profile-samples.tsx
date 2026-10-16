import { Button } from "@repo/ui/components/ui/button";
import { useState } from "react";

import { Onboarding, ProfileForm } from "@/components/profile/profile-questions";
import type { Profiling, SurferProfile } from "@/components/viewer/types";

// What an account says of itself as a surfer, with invented answers: decision 063.

const SAID: SurferProfile = {
  level: "intermediate",
  smallestWave: "knee",
  biggestWave: "head",
  reading: "basics",
  boards: ["funboard", "longboard"],
  waveFaceMeters: { least: 0.3, most: 2 },
  answeredAt: new Date("2026-10-16T20:00:00Z"),
  putOffAt: null,
};

export const SAMPLE_PROFILE = SAID;

function sampleProfiling(profile: SurferProfile | null, isAsking: boolean, onLeave: () => void) {
  return {
    profile,
    isAsking,
    isSaving: false,
    onSave: async () => {
      onLeave();
      return true;
    },
    onPutOff: onLeave,
  } satisfies Profiling;
}

export function ProfileSamples() {
  const [isAsking, setAsking] = useState(false);
  const [asksName, setAsksName] = useState(false);

  return (
    <div className="grid gap-m lg:grid-cols-2">
      <div className="grid content-start justify-items-start gap-xs">
        {/* The questions an account is asked once, with or without a username to choose. */}
        <div className="flex flex-wrap gap-xs">
          <Button
            variant="secondary"
            onClick={() => {
              setAsksName(false);
              setAsking(true);
            }}
          >
            Open the questions
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setAsksName(true);
              setAsking(true);
            }}
          >
            With a username to choose
          </Button>
        </div>
        {isAsking && (
          <Onboarding
            profiling={sampleProfiling(null, isAsking, () => setAsking(false))}
            username={asksName ? null : "maelle_lg"}
            onUsernameSave={async () => undefined}
          />
        )}
      </div>
      {/* The answers, one step into the account's panel. */}
      <div className="edge rounded-(--radius-xs) p-m">
        <ProfileForm profiling={sampleProfiling(SAID, false, () => {})} onSaved={() => {}} />
      </div>
    </div>
  );
}
