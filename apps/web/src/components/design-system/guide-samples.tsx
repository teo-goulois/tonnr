import { toast } from "sonner";

import { BreakGuide } from "@/components/guides/break-guide";
import { ContributionsPanel } from "@/components/guides/contributions-panel";
import { Author, RankBadge } from "@/components/guides/rank";
import type { Guiding } from "@/components/guides/types";
import type { Guide, GuideLine, GuideOwn, Standing, SurfBreak } from "@/components/viewer/types";

// An invented break, and an invented guide of it: a few lines from the list it came from, a few
// that accounts wrote, one that waits to be confirmed, and questions half answered.
const BREAK: SurfBreak = {
  id: "6e0d6c0a-0000-4000-8000-000000000001",
  name: "Anse du Phare",
  latitude: 47.8,
  longitude: -4.38,
  characteristics: {
    breakTypes: ["beach"],
    waveDirections: ["left", "right"],
    bottomTypes: ["sand"],
    abilityLevels: ["beginner", "intermediate"],
    boardTypes: null,
    bestSeasons: null,
    bestTides: ["mid", "mid_high"],
    bestSwellDirections: ["W", "WNW"],
    bestWindDirections: null,
    offshoreDirectionDegrees: 90,
  },
  location: ["France", "Bretagne", "Plomeur"],
  timezone: "Europe/Paris",
  source: { provider: null, url: null, attribution: null, license: null },
};

const WRITTEN = new Date("2026-10-10T08:00:00Z");
// What a line holds beside its name and its value: nothing, for one that nobody wrote.
type Rest = Omit<GuideLine, "line" | "value">;
const none: Rest = {
  origin: null,
  contributionId: null,
  by: null,
  at: null,
  language: null,
  license: null,
  proposed: [],
};
const listed: Rest = { ...none, origin: "list" };

const GUIDE: Guide = {
  breakId: BREAK.id,
  lines: [
    { line: "breakTypes", value: ["beach"], ...listed },
    { line: "waveDirections", value: ["left", "right"], ...listed },
    {
      line: "bottomTypes",
      value: ["sand"],
      ...listed,
      proposed: [
        {
          id: "shown-1",
          value: ["sand", "rock"],
          language: null,
          by: { username: "maelle_lg", rank: "cs" },
          at: WRITTEN,
          confirmations: 1,
        },
      ],
    },
    {
      line: "boardTypes",
      value: ["fish", "longboard"],
      ...none,
      origin: "contribution",
      contributionId: "confirmed-1",
      by: { username: "yann_29", rank: "qs" },
      at: WRITTEN,
      license: "ODbL-1.0",
    },
    { line: "bestSeasons", value: null, ...none },
    { line: "bestTides", value: ["mid", "mid_high"], ...listed },
    { line: "bestSwellDirections", value: ["W", "WNW"], ...listed },
    { line: "bestWindDirections", value: null, ...none },
    {
      line: "access",
      value: "Park at the end of the lighthouse road, then five minutes down the path.",
      ...none,
      origin: "contribution",
      contributionId: "confirmed-2",
      by: { username: "maelle_lg", rank: "cs" },
      at: WRITTEN,
      language: "en",
      license: "DbCL-1.0",
    },
    { line: "entry", value: null, ...none },
    {
      line: "hazards",
      value: "Rochers à découvert à marée basse, côté nord.",
      ...none,
      origin: "contribution",
      contributionId: "confirmed-3",
      by: null,
      at: WRITTEN,
      language: "fr",
      license: "DbCL-1.0",
    },
    { line: "rules", value: null, ...none },
  ],
  answers: [
    { question: "crowd", total: 6, counts: { quiet: 0, shared: 1, busy: 4, packed: 1 } },
    { question: "locals", total: 2, counts: null },
    { question: "level", total: 0, counts: null },
  ],
};

// An account that keeps the break, had a contribution of its own confirmed, and has a text that
// waits to be read.
const OWN: GuideOwn = {
  username: "nolwenn",
  trusted: false,
  keeps: true,
  mayConfirm: true,
  waiting: [
    {
      id: "pending-1",
      line: "entry",
      value: "Paddle out by the channel on the left of the rocks.",
      language: "en",
      status: "pending",
      createdAt: WRITTEN,
    },
  ],
  verdicts: [],
  answers: { crowd: "busy" },
};

const STANDING: Standing = {
  username: "nolwenn",
  score: 95,
  rank: "qs",
  next: { rank: "cs", from: 150 },
  confirmed: 9,
  sponsorships: 2,
  trusted: true,
  contributions: [
    {
      id: "c-1",
      break: { id: BREAK.id, name: BREAK.name },
      line: "entry",
      value: "Paddle out by the channel on the left of the rocks.",
      language: "en",
      status: "pending",
      reason: null,
      createdAt: WRITTEN,
      confirmedAt: null,
    },
    {
      id: "c-2",
      break: { id: BREAK.id, name: BREAK.name },
      line: "bestWindDirections",
      value: ["E", "ENE"],
      language: null,
      status: "shown",
      reason: null,
      createdAt: WRITTEN,
      confirmedAt: null,
    },
    {
      id: "c-3",
      break: { id: "other", name: "Roche Noire" },
      line: "bottomTypes",
      value: ["rock"],
      language: null,
      status: "confirmed",
      reason: null,
      createdAt: WRITTEN,
      confirmedAt: WRITTEN,
    },
    {
      id: "c-4",
      break: { id: "other", name: "Roche Noire" },
      line: "hazards",
      value: "Sharks.",
      language: "en",
      status: "refused",
      reason: "Nobody has seen one there.",
      createdAt: WRITTEN,
      confirmedAt: null,
    },
    {
      id: "c-5",
      break: { id: "made", name: "Pointe des Goémons" },
      line: "place",
      value: "Pointe des Goémons",
      language: null,
      status: "confirmed",
      reason: null,
      createdAt: WRITTEN,
      confirmedAt: WRITTEN,
    },
    {
      id: "c-6",
      break: null,
      line: "bestTides",
      value: ["low"],
      language: null,
      status: "confirmed",
      reason: null,
      createdAt: WRITTEN,
      confirmedAt: WRITTEN,
    },
  ],
};

// The page sends nothing: it says what would have been sent.
const said = (what: string) => toast(what);
const guidingOf = (signedIn: boolean): Guiding => ({
  signedIn,
  isSending: false,
  draftOf: () => undefined,
  onDraft: () => {},
  onSignIn: (reason) => said(reason),
  onUsernameSave: async () => "This username is taken.",
  onPropose: (line, _value, done) => {
    said(`Sent: ${line}`);
    done();
  },
  onWithdraw: () => said("Taken back"),
  onConfirm: () => said("Confirmed"),
  onContest: (_id, reason, done) => {
    said(`Contested: ${reason}`);
    done();
  },
  onAnswer: (question, answer) => said(`${question}: ${answer ?? "taken back"}`),
});

const framed = "edge rounded-(--radius-xs) p-m";

/** The guide of a break as each reader meets it, and where an account stands in the guides. */
export function GuideSamples() {
  return (
    <div className="grid gap-m">
      <div className="flex flex-wrap items-center gap-m">
        <RankBadge rank="qs" />
        <RankBadge rank="cs" />
        <RankBadge rank="ct" />
        <Author by={{ username: "maelle_lg", rank: "cs" }} />
        <Author by={{ username: "newcomer", rank: null }} />
        <Author by={null} />
      </div>
      <div className="grid gap-m lg:grid-cols-2">
        {/* An account that keeps the break: it confirms and contests, and its own text waits. */}
        <div className={framed}>
          <BreakGuide
            found={BREAK}
            guide={{ data: GUIDE, isPending: false, isError: false }}
            own={OWN}
            guiding={guidingOf(true)}
          />
        </div>
        {/* A visitor: every line asks for an account before it opens. */}
        <div className={framed}>
          <BreakGuide
            found={BREAK}
            guide={{ data: GUIDE, isPending: false, isError: false }}
            own={undefined}
            guiding={guidingOf(false)}
          />
        </div>
        {/* An account with no username chooses one where it first writes. */}
        <div className={framed}>
          <BreakGuide
            found={BREAK}
            guide={{ data: GUIDE, isPending: false, isError: false }}
            own={{ ...OWN, username: null, keeps: false, mayConfirm: false, waiting: [] }}
            guiding={guidingOf(true)}
          />
        </div>
        {/* While the guide loads. */}
        <div className={framed}>
          <BreakGuide
            found={BREAK}
            guide={{ data: undefined, isPending: true, isError: false }}
            own={undefined}
            guiding={guidingOf(false)}
          />
        </div>
        <div className={framed}>
          <ContributionsPanel
            standing={{ data: STANDING, isPending: false, isError: false }}
            onOpenBreak={(id) => said(`Open ${id}`)}
          />
        </div>
        {/* An account that has written nothing yet. */}
        <div className={framed}>
          <ContributionsPanel
            standing={{
              data: {
                ...STANDING,
                score: 0,
                rank: null,
                next: { rank: "qs", from: 20 },
                confirmed: 0,
                sponsorships: 0,
                trusted: false,
                contributions: [],
              },
              isPending: false,
              isError: false,
            }}
            onOpenBreak={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
