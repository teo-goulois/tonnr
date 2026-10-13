import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { LogbookPanel } from "@/components/sessions/logbook-panel";
import { PlaceSessions } from "@/components/sessions/place-sessions";
import { RatingInput, RatingStars } from "@/components/sessions/rating";
import { SessionForm } from "@/components/sessions/session-form";
import { SessionConditions, SessionCredits } from "@/components/sessions/session-sea";
import type { Session, SessionDetail, SessionRecap } from "@/components/viewer/types";

const NOW = new Date("2026-10-13T09:00:00Z").getTime();

// The figures of a session that nothing was read of.
const NOTHING: Session["figures"] = {
  waveHeightMeters: null,
  wavePeakPeriodSeconds: null,
  wavePeriodSeconds: null,
  waveDirectionDegrees: null,
  primarySwellHeightMeters: null,
  primarySwellDirectionDegrees: null,
  windSpeedMetersPerSecond: null,
  windGustMetersPerSecond: null,
  windDirectionDegrees: null,
  shoreWind: null,
  airTemperatureCelsius: null,
  cloudCoverPercent: null,
  precipitationMillimeters: null,
  tideHeightMeters: null,
  tideTrend: null,
  tideLevel: null,
  buoy: null,
  measuredWind: null,
};

// Invented sessions at an invented break: three that were liked, one that was not, and one
// written too long after for the models.
function session(
  id: string,
  day: string,
  rating: number | null,
  figures: Partial<Session["figures"]>,
  more: Partial<Session> = {},
): Session {
  const startedAt = new Date(`${day}T07:30:00Z`);
  return {
    id,
    place: {
      name: "Anse du Phare",
      latitude: 47.84,
      longitude: -4.35,
      breakId: "b-1",
      spotId: null,
    },
    startedAt,
    durationMinutes: 90,
    rating,
    note: null,
    figures: { ...NOTHING, ...figures },
    modelMissing: null,
    conditionsTakenAt: startedAt,
    createdAt: startedAt,
    updatedAt: startedAt,
    ...more,
  };
}

const SESSIONS: Session[] = [
  session("s-1", "2026-10-11", 5, {
    waveHeightMeters: 1.5,
    wavePeakPeriodSeconds: 13,
    waveDirectionDegrees: 285,
    windSpeedMetersPerSecond: 3.5,
    windDirectionDegrees: 90,
    shoreWind: "offshore",
    tideHeightMeters: 2.6,
    tideTrend: "rising",
  }),
  session("s-2", "2026-10-04", 4, {
    waveHeightMeters: 1.2,
    wavePeakPeriodSeconds: 11,
    waveDirectionDegrees: 290,
    windSpeedMetersPerSecond: 5,
    windDirectionDegrees: 70,
    shoreWind: "offshore",
    tideHeightMeters: 3.1,
    tideTrend: "rising",
  }),
  session("s-3", "2026-09-27", 4, {
    waveHeightMeters: 1.8,
    wavePeakPeriodSeconds: 14,
    waveDirectionDegrees: 300,
    windSpeedMetersPerSecond: 4,
    windDirectionDegrees: 100,
    shoreWind: "offshore",
    tideHeightMeters: 2.9,
    tideTrend: "rising",
  }),
  session("s-4", "2026-09-20", 2, {
    waveHeightMeters: 0.6,
    wavePeakPeriodSeconds: 7,
    waveDirectionDegrees: 250,
    windSpeedMetersPerSecond: 9,
    windDirectionDegrees: 270,
    shoreWind: "onshore",
    tideHeightMeters: 4.8,
    tideTrend: "falling",
  }),
  session("s-5", "2026-05-02", null, {}, { modelMissing: "too_old" }),
];

const RECAP: SessionRecap = {
  total: { count: 5, minutes: 450 },
  year: { count: 5, minutes: 450 },
  month: { count: 2, minutes: 180 },
  placeCount: 2,
  places: [
    {
      name: "Anse du Phare",
      breakId: "b-1",
      spotId: null,
      count: 4,
      minutes: 360,
      averageRating: 3.8,
      lastAt: new Date("2026-10-11T07:30:00Z"),
    },
    {
      name: "A spot that was deleted",
      breakId: null,
      spotId: null,
      count: 1,
      minutes: 90,
      averageRating: null,
      lastAt: new Date("2026-05-02T07:30:00Z"),
    },
  ],
};

const DETAIL: SessionDetail = {
  ...SESSIONS[0]!,
  figures: {
    ...SESSIONS[0]!.figures,
    primarySwellHeightMeters: 1.3,
    primarySwellDirectionDegrees: 280,
    windGustMetersPerSecond: 6,
    airTemperatureCelsius: 15,
    cloudCoverPercent: 40,
    buoy: {
      name: "Pierres Noires",
      distanceKm: 31,
      significantHeightMeters: 1.8,
      periodSeconds: 13,
      directionDegrees: 280,
      waterTemperatureCelsius: 15.4,
    },
    measuredWind: {
      name: "Pointe du Phare",
      distanceKm: 6,
      speedMetersPerSecond: 4.2,
      gustMetersPerSecond: 7,
      directionDegrees: 80,
    },
  },
  conditions: {
    model: {
      point: { latitude: 47.84, longitude: -4.35 },
      waveModels: ["ecmwf_wam"],
      swellModels: ["mfwam"],
      hours: [],
    },
    modelMissing: null,
    tide: {
      station: { id: "t-1", name: "Port du Phare", distanceKm: 8 },
      datum: "LAT",
      heights: [],
      extremes: [],
    },
    buoy: {
      stationId: "st-1",
      name: "Pierres Noires",
      distanceKm: 31,
      attribution: "An invented network",
      readings: [],
    },
    wind: null,
    offshoreDirectionDegrees: 90,
  },
};

const some = <Data,>(data: Data) => ({ data, isPending: false, isError: false });

function Sample({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid max-w-sm gap-s">
      <h3 className="text-s font-medium text-neutral-7">{title}</h3>
      {children}
    </div>
  );
}

/** The screens of an account's log of its sessions, with invented sessions. Decision 043. */
export function SessionSamples() {
  const [rating, setRating] = useState<number | null>(4);
  const place = {
    now: NOW,
    signedIn: true,
    onAdd: () => toast("Add a session"),
    onOpen: (one: Session) => toast(one.id),
    onSignIn: () => {},
    onCreateAccount: () => {},
  };

  return (
    <div className="grid gap-l">
      <Sample title="A rating, as it is given and as it is read">
        <RatingInput label="How was it?" value={rating} onChange={setRating} />
        <div className="flex flex-wrap items-center gap-s">
          {[1, 3, 5].map((given) => (
            <RatingStars key={given} rating={given} />
          ))}
        </div>
      </Sample>

      <Sample title="A new session">
        <SessionForm now={NOW} isSaving={false} onSave={(draft) => toast(draft.note || "Saved")} />
      </Sample>

      <Sample title="What was kept of the sea with a session">
        <SessionConditions session={DETAIL} />
        <SessionCredits session={DETAIL} />
      </Sample>

      <Sample title="The sessions at a spot of the account's own, with what it likes there">
        <PlaceSessions
          {...place}
          sessions={some(SESSIONS)}
          onAlert={() => toast("An alert with these conditions")}
        />
      </Sample>

      <Sample title="At a place with too few liked sessions, with none, and for a visitor">
        <PlaceSessions {...place} sessions={some(SESSIONS.slice(0, 2))} />
        <PlaceSessions {...place} sessions={some([])} />
        <PlaceSessions {...place} signedIn={false} sessions={some(undefined)} />
      </Sample>

      <Sample title="The log">
        <LogbookPanel
          now={NOW}
          log={some(SESSIONS)}
          recap={some(RECAP)}
          onAdd={() => toast("Add a session")}
          onOpen={(one) => toast(one.id)}
          onOpenPlace={() => toast("Open the place")}
        />
      </Sample>

      <Sample title="An empty log">
        <LogbookPanel
          now={NOW}
          log={some([])}
          recap={some(undefined)}
          onAdd={() => toast("Add a session")}
          onOpen={() => {}}
          onOpenPlace={() => {}}
        />
      </Sample>
    </div>
  );
}
