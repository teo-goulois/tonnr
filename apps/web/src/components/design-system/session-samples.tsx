import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { LogbookPanel } from "@/components/sessions/logbook-panel";
import { ReportsPanel } from "@/components/reports/reports-panel";
import type { Report } from "@/components/reports/types";
import { MediaViewer } from "@/components/sessions/media-viewer";
import { PlaceSessions } from "@/components/sessions/place-sessions";
import { RatingInput, RatingStars } from "@/components/sessions/rating";
import { SessionForm } from "@/components/sessions/session-form";
import { SessionMediaField } from "@/components/sessions/session-media";
import { SessionConditions, SessionCredits } from "@/components/sessions/session-sea";
import { SurfSizeInput, SurfSizePicture } from "@/components/sessions/surf-size";
import type { SessionMedia, SurfSize, Upload } from "@/components/sessions/types";
import type { MediaItem, Session, SessionDetail, SessionRecap } from "@/components/viewer/types";
import { SIZES } from "@repo/conditions/sessions/sizes";

const NOW = new Date("2026-10-13T09:00:00Z").getTime();

// Invented photos and videos of a session, in each state a form shows: the picture of the
// landing's map stands for what the bucket would give.
const PICTURE = "/landing/hero-map-light-en.webp";
function medium(id: string, change: Partial<MediaItem>): MediaItem {
  return {
    id,
    kind: "photo",
    state: "ready",
    failure: null,
    width: 2560,
    height: 1440,
    durationMs: null,
    thumb: PICTURE,
    display: PICTURE,
    poster: null,
    video: null,
    ...change,
  };
}
const KEPT: MediaItem[] = [
  medium("photo", {}),
  medium("video", { kind: "video", durationMs: 42_000, poster: PICTURE, display: null }),
  medium("making", { state: "processing", thumb: null, display: null }),
  medium("refused", { state: "failed", failure: "too_long", thumb: null, display: null }),
];
const SENDING: Upload[] = [
  {
    key: "going",
    name: "IMG_2041.HEIC",
    purpose: "session",
    kind: "photo",
    type: "image/jpeg",
    preview: PICTURE,
    progress: 0.4,
    state: "sending",
    error: null,
    id: "going",
  },
  {
    key: "lost",
    name: "IMG_2042.MOV",
    purpose: "session",
    kind: "photo",
    type: "image/jpeg",
    preview: PICTURE,
    progress: 0.7,
    state: "failed",
    error: "IMG_2042.MOV couldn't be uploaded.",
    id: "lost",
  },
];
const MEDIA: SessionMedia = {
  status: { offered: true, paused: false, keptBytes: 0, mostBytes: 2048 * 1024 * 1024 },
  open: { data: KEPT, isPending: false, isError: false },
  bySession: {},
  uploads: new Map(SENDING.map((upload) => [upload.key, upload])),
  onStart: () => [],
  onRetry: () => toast("Sent again"),
  onDrop: () => {},
  onForget: () => {},
};

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
    waveSize: null,
    setSize: null,
    figures: { ...NOTHING, ...figures },
    modelMissing: null,
    conditionsTakenAt: startedAt,
    createdAt: startedAt,
    updatedAt: startedAt,
    ...more,
  };
}

const SESSIONS: Session[] = [
  session(
    "s-1",
    "2026-10-11",
    5,
    {
      waveHeightMeters: 1.5,
      wavePeakPeriodSeconds: 13,
      waveDirectionDegrees: 285,
      windSpeedMetersPerSecond: 3.5,
      windDirectionDegrees: 90,
      shoreWind: "offshore",
      tideHeightMeters: 2.6,
      tideTrend: "rising",
    },
    { waveSize: "chest", setSize: "overhead" },
  ),
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
  const [rating, setRating] = useState<number | null>(3.5);
  const [sizes, setSizes] = useState<[SurfSize | null, SurfSize | null]>(["waist", "head"]);
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
          {[1, 2.5, 3.8, 5].map((given) => (
            <RatingStars key={given} rating={given} />
          ))}
        </div>
      </Sample>

      <Sample title="How big the waves looked: each size, a set behind waves, and the pill">
        <div className="grid grid-cols-3 gap-xs">
          {SIZES.map((size) => (
            <SurfSizePicture key={size} size={size} />
          ))}
        </div>
        <SurfSizePicture size="chest" behind="overhead" className="max-w-40" />
        <div>
          <SurfSizeInput
            waves={sizes[0]}
            sets={sizes[1]}
            onChange={(waves, sets) => setSizes([waves, sets])}
            // The sheet of a phone: the form below opens the drawer of a wide screen.
            wide={false}
          />
        </div>
      </Sample>

      <Sample title="A new session">
        <SessionForm
          now={NOW}
          wide
          isSaving={false}
          onSave={(draft) => toast(draft.note || "Saved")}
          media={MEDIA}
          onOpenMedia={() => {}}
        />
      </Sample>

      <MediaSamples />
      <ReportSamples />

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

/**
 * The photos and the videos of a session: the strip of its form, with one of each state, and the
 * viewer that opens over the whole screen. Decision 066.
 */
function MediaSamples() {
  const [shown, setShown] = useState<string | null>(null);
  return (
    <Sample title="The photos and the videos of a session">
      <div className="edge rounded-(--radius-xs) [--edge-color:var(--neutral-4)]">
        <SessionMediaField
          entries={[
            ...KEPT.map((item) => ({ kept: item.id })),
            ...SENDING.map((upload) => ({ upload: upload.key })),
          ]}
          kept={KEPT}
          uploads={MEDIA.uploads}
          disabled={false}
          paused={false}
          onAdd={() => {}}
          onRemove={() => toast("Taken out")}
          onRetry={MEDIA.onRetry}
          onOpen={(item) => setShown(item.id)}
        />
      </div>
      <div className="edge rounded-(--radius-xs) [--edge-color:var(--neutral-4)]">
        <SessionMediaField
          entries={[{ kept: "photo" }]}
          kept={KEPT}
          uploads={MEDIA.uploads}
          disabled={false}
          paused
          onAdd={() => {}}
          onRemove={() => {}}
          onRetry={() => {}}
          onOpen={(item) => setShown(item.id)}
        />
      </div>
      <MediaViewer items={KEPT} shown={shown} onShow={setShown} />
    </Sample>
  );
}

// Invented reports at an invented break: one shown, and two of the reader's, one being checked
// and one refused. Decision 067.
function report(id: string, minutesAgo: number, change: Partial<Report>): Report {
  return {
    id,
    breakId: "break",
    createdAt: new Date(NOW - minutesAgo * 60 * 1000),
    author: "maelle",
    waveSize: null,
    setSize: null,
    note: null,
    distanceKm: 0.4,
    media: [medium(`${id}-photo`, {})],
    mine: false,
    state: "published",
    reasons: [],
    flagged: false,
    ...change,
  };
}
const REPORTS: Report[] = [
  report("shown", 40, {
    waveSize: "chest",
    setSize: "head",
    note: "Clean sets on the outside, a bit of wind from noon.",
    media: [
      medium("shown-photo", {}),
      medium("shown-video", { kind: "video", durationMs: 18_000 }),
    ],
  }),
  report("checking", 2, {
    author: "you",
    mine: true,
    state: "checking",
    distanceKm: null,
    media: [medium("checking-photo", { state: "processing", thumb: null, display: null })],
  }),
  report("refused", 9 * 60, {
    author: "you",
    mine: true,
    state: "refused",
    distanceKm: 7,
    reasons: ["too_far", "too_old"],
  }),
];

/** What accounts showed of the waves at a break, as its tab draws it. */
function ReportSamples() {
  return (
    <Sample title="The reports of a break">
      <ReportsPanel
        now={NOW}
        signedIn
        reports={{ data: REPORTS, isPending: false, isError: false }}
        offered
        onSend={() => toast("Send a report")}
        onSignIn={() => {}}
        onCreateAccount={() => {}}
        onDelete={async () => true}
        onFlag={async () => true}
      />
    </Sample>
  );
}
