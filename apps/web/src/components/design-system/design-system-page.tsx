import { forecastSource } from "@repo/conditions/forecasts/wave-models";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerPanel,
  DrawerTitle,
  DrawerTrigger,
} from "@repo/ui/components/ui/drawer";
import { Input } from "@repo/ui/components/ui/input";
import { Kbd } from "@repo/ui/components/ui/kbd";
import { Label } from "@repo/ui/components/ui/label";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@repo/ui/components/ui/menu";
import {
  Meter,
  MeterIndicator,
  MeterLabel,
  MeterTrack,
  MeterValue,
} from "@repo/ui/components/ui/meter";
import {
  Popover,
  PopoverDescription,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { Slider } from "@repo/ui/components/ui/slider";
import { Switch } from "@repo/ui/components/ui/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@repo/ui/components/ui/tabs";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { Toggle } from "@repo/ui/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip-popup";
import { ArrowRightIcon, PlusIcon } from "@repo/ui/icon";
import { DENSITIES, densityName } from "@/lib/density";
import { PROVIDERS } from "@/lib/provider-auth";
import { m } from "@/paraglide/messages.js";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { AccountPanel } from "@/components/account/account-panel";
import { ConnectPage } from "@/components/auth/connect-page";
import { ProviderButton } from "@/components/auth/provider-sign-in";
import { FriendSamples } from "@/components/design-system/friend-samples";
import { GuideSamples } from "@/components/design-system/guide-samples";
import { LearnSamples } from "@/components/design-system/learn-samples";
import { ProfileSamples, SAMPLE_PROFILE } from "@/components/design-system/profile-samples";
import { SessionSamples } from "@/components/design-system/session-samples";
import { SpotPageSamples } from "@/components/design-system/spot-page-samples";
import { PushSetting } from "@/components/alerts/push-setting";
import { ListChips } from "@/components/lists/list-chips";
import { AnalyticsConsentDialog } from "@/components/shared/analytics";
import { BottomNav } from "@/components/shared/bottom-nav";
import { MorphText } from "@/components/shared/morph-text";
import { PageColumn } from "@/components/shared/page-column";
import { ShortcutKeys } from "@/components/shared/shortcut-keys";
import { openShortcutSettings } from "@/components/shared/shortcut-settings";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { MapLegend } from "@/components/viewer/map-legend";
import { type Found, PlaceSearch } from "@/components/viewer/place-search";
import { SeaTimeline } from "@/components/viewer/sea-timeline";
import {
  BreakDisc,
  BreakPill,
  BuoyPill,
  FreshnessDot,
  FreshnessGauge,
  HeightChip,
  SpotPin,
  UserDot,
  WindBadge,
} from "@/components/viewer/map-markers";
import { Details } from "@/components/viewer/details/details";
import { NearbyWindStation } from "@/components/viewer/details/parts";
import { SeaNow } from "@/components/viewer/details/sea-now";
import { SizeAgainstForecast } from "@/components/viewer/size-against-forecast";
import { SeaChart } from "@/components/viewer/sea-chart";
import { TideChart } from "@/components/viewer/tide-chart";
import { ViewerSkeleton } from "@/components/viewer/viewer-skeleton";
import type { MapLayers } from "@/components/viewer/station-map";
import { StationPanel } from "@/components/viewer/station-panel";
import type {
  Forecast,
  StationReadings,
  TideExtremes,
  TideTimeline,
} from "@/components/viewer/types";
import type { PushDevice } from "@/lib/push";
import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE } from "@/lib/sea-scales";
import { formatHeight, formatWind } from "@/lib/units";
import { useShortcuts } from "@/lib/shortcuts";
import type { PushState } from "@/lib/use-push";

const VARIANTS = [
  "default",
  "outline",
  "secondary",
  "tertiary",
  "ghost",
  "destructive",
  "link",
] as const;
const SIZES = ["xs", "sm", "default", "lg", "xl"] as const;
const ICON_SIZES = ["icon-xs", "icon-sm", "icon", "icon-lg", "icon-xl"] as const;
const TEXT_STEPS = [
  "text-xxl",
  "text-xl",
  "text-l",
  "text-m",
  "text-s",
  "text-xs",
  "text-xxs",
] as const;
const NEUTRALS = [
  "bg-neutral-1",
  "bg-neutral-2",
  "bg-neutral-3",
  "bg-neutral-4",
  "bg-neutral-5",
  "bg-neutral-6",
  "bg-neutral-7",
  "bg-neutral-8",
  "bg-neutral-9",
  "bg-neutral-10",
] as const;
const TRANSPARENT_NEUTRALS = [
  "bg-neutral-1-transparent",
  "bg-neutral-2-transparent",
  "bg-neutral-3-transparent",
  "bg-neutral-4-transparent",
  "bg-neutral-5-transparent",
  "bg-neutral-6-transparent",
  "bg-neutral-7-transparent",
  "bg-neutral-8-transparent",
  "bg-neutral-9-transparent",
  "bg-neutral-10-transparent",
] as const;
const ACCENTS = ["bg-color-1", "bg-success", "bg-warning", "bg-error"] as const;

const HOUR_MS = 60 * 60 * 1000;
// A fixed moment, so the samples below draw the same curves on every visit.
const SAMPLE_NOW = Date.UTC(2026, 9, 9, 6);
// The swell of the sample forecast, 290 degrees and 11 s, as the size factor's bins read it.
const SAMPLE_SWELL_SECTOR = "W";
const SAMPLE_PERIOD_BAND = "medium";
// What a search of the map finds, one of each kind: invented places.
const SAMPLE_FOUND: Found[] = [
  { kind: "spot", id: "s1", name: "My left at the point", latitude: 47.8, longitude: -4.3 },
  {
    kind: "break",
    id: "b1",
    name: "Pointe de la Torche",
    where: "Plomeur, Finistère",
    latitude: 47.84,
    longitude: -4.35,
  },
  { kind: "station", id: "st1", name: "Pierres Noires", latitude: 48.29, longitude: -4.97 },
  {
    kind: "place",
    name: "Pointe du Raz",
    where: "Plogoff, Finistère",
    latitude: 48.04,
    longitude: -4.74,
  },
];

const SAMPLE_SEA_TIMES = {
  present: SAMPLE_NOW,
  earliest: SAMPLE_NOW - 24 * HOUR_MS,
  latest: SAMPLE_NOW + 9 * 24 * HOUR_MS,
  stepMs: 3 * HOUR_MS,
};
// The midnight before it, where the reader is.
const SAMPLE_DAY = new Date(SAMPLE_NOW).setHours(0, 0, 0, 0);

// A swell that builds to three metres and eases, one value every half hour for two days.
const SAMPLE_HEIGHTS = Array.from({ length: 96 }, (_, index) => ({
  time: new Date(SAMPLE_NOW - (95 - index) * 0.5 * HOUR_MS),
  value: 1.1 + 1.9 * Math.exp(-(((index - 60) / 14) ** 2)) + 0.12 * Math.sin(index / 3),
}));
const SAMPLE_WIND = SAMPLE_HEIGHTS.map((point, index) => ({
  time: point.time,
  value: 14 + 10 * Math.sin(index / 15),
}));

const SAMPLE_LICENSE = {
  type: "etalab-2.0",
  url: "https://www.etalab.gouv.fr/",
  commercialUse: true,
};
const SAMPLE_READINGS: StationReadings = {
  station: {
    id: "sample",
    provider: "candhis",
    name: "Les Pierres Noires",
    latitude: 48.29,
    longitude: -4.97,
    attribution: "CANDHIS",
    measures: ["waves"],
    exposure: "open",
    license: SAMPLE_LICENSE,
  },
  readings: SAMPLE_HEIGHTS.map((point) => ({
    observedAt: point.time,
    significantHeightMeters: point.value,
    maxHeightMeters: point.value * 1.6,
    peakPeriodSeconds: 11,
    meanPeriodSeconds: null,
    significantPeriodSeconds: null,
    peakDirectionDegrees: 290,
    directionalSpreadDegrees: null,
    waterTemperatureCelsius: 15.5,
    windSpeedMetersPerSecond: null,
    windGustMetersPerSecond: null,
    windDirectionDegrees: null,
    validated: false,
  })).reverse(),
};
// A week of a station that measures the wind alone, a reading every six minutes: a breeze that
// rises each afternoon, a blow on the fifth day, and four hours without a word.
const SAMPLE_WIND_READINGS: StationReadings = {
  station: {
    id: "sample-wind",
    provider: "meteofrance",
    name: "Pointe des Sables",
    latitude: 48.29,
    longitude: -4.97,
    attribution: "Météo-France",
    measures: ["wind"],
    exposure: null,
    license: SAMPLE_LICENSE,
  },
  readings: Array.from({ length: 7 * 240 }, (_, index) => {
    const hoursAgo = index / 10;
    const day = Math.sin(((hoursAgo - 3) / 24) * 2 * Math.PI);
    const blow = 9 * Math.exp(-(((hoursAgo - 110) / 9) ** 2));
    const speed = 5 + 2.5 * day + blow + 0.8 * Math.sin(index * 1.7) + 0.5 * Math.sin(index / 3);
    return {
      observedAt: new Date(SAMPLE_NOW - index * 6 * 60 * 1000),
      significantHeightMeters: null,
      maxHeightMeters: null,
      peakPeriodSeconds: null,
      meanPeriodSeconds: null,
      significantPeriodSeconds: null,
      peakDirectionDegrees: null,
      directionalSpreadDegrees: null,
      waterTemperatureCelsius: null,
      windSpeedMetersPerSecond: Math.max(0, speed),
      windGustMetersPerSecond: Math.max(0, speed) * (1.3 + 0.15 * Math.sin(index * 0.9)),
      windDirectionDegrees: (300 + 60 * Math.sin(hoursAgo / 20) + 360) % 360,
      validated: false,
    };
  }).filter((_, index) => index < 300 || index > 340),
};
const SAMPLE_WIND_STATION = {
  ...SAMPLE_WIND_READINGS.station,
  latestReading: SAMPLE_WIND_READINGS.readings[0] ?? null,
};
const SAMPLE_FORECAST: Forecast = {
  point: { latitude: 48.3, longitude: -5 },
  source: forecastSource(["nws_ww3", "ecmwf_wam", "mfwam"]),
  // The fine model for the first two days, and the other after its last hour.
  waveModels: [
    {
      name: "WaveWatch III",
      producer: "Met Office",
      resolutionKilometers: 1.5,
      from: new Date(SAMPLE_NOW - 6 * HOUR_MS),
    },
    {
      name: "ECMWF WAM",
      producer: "ECMWF",
      resolutionKilometers: 9,
      from: new Date(SAMPLE_NOW + 42 * HOUR_MS),
    },
  ],
  swellModels: [
    {
      name: "WaveWatch III",
      producer: "Met Office",
      resolutionKilometers: 1.5,
      from: new Date(SAMPLE_NOW - 6 * HOUR_MS),
    },
    {
      name: "MFWAM",
      producer: "Météo-France",
      resolutionKilometers: 9,
      from: new Date(SAMPLE_NOW + 42 * HOUR_MS),
    },
  ],
  fetchedAt: new Date(SAMPLE_NOW),
  stale: false,
  hours: Array.from({ length: 96 }, (_, index) => {
    const height = 1.6 + 1.2 * Math.sin(index / 14);
    return {
      time: new Date(SAMPLE_NOW - 6 * HOUR_MS + index * HOUR_MS),
      waveHeightMeters: height,
      wavePeriodSeconds: 9,
      wavePeakPeriodSeconds: 11,
      waveDirectionDegrees: 290,
      primarySwellHeightMeters: height * 0.8,
      primarySwellDirectionDegrees: 285,
      windSpeedMetersPerSecond: 6 + 3 * Math.sin(index / 9),
      windGustMetersPerSecond: 10,
      windDirectionDegrees: 250,
      cloudCoverPercent: 40,
      precipitationMillimeters: 0,
      airTemperatureCelsius: 15,
    };
  }),
};
const SAMPLE_TIDE_STATION = {
  id: "sample",
  name: "Le Conquet",
  latitude: 48.36,
  longitude: -4.78,
  distanceKm: 16,
  source: { name: "TICON-4", url: "https://www.seanoe.org/" },
  license: {
    type: "cc-by-4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    commercialUse: true,
  },
};
const SAMPLE_TIDES: TideTimeline = {
  station: SAMPLE_TIDE_STATION,
  datum: "LAT",
  timeline: Array.from({ length: 3 * 144 + 1 }, (_, index) => ({
    time: new Date(SAMPLE_DAY - 24 * HOUR_MS + index * (HOUR_MS / 6)),
    heightMeters: 3.6 + 2.8 * Math.sin((index / 74.5) * 2 * Math.PI),
  })),
};
const SAMPLE_EXTREMES: TideExtremes = {
  station: SAMPLE_TIDE_STATION,
  datum: "LAT",
  // The high and low waters of the curve above.
  extremes: Array.from({ length: 11 }, (_, index) => ({
    time: new Date(SAMPLE_DAY - 24 * HOUR_MS + (18.625 + index * 37.25) * (HOUR_MS / 6)),
    type: index % 2 === 0 ? ("high" as const) : ("low" as const),
    heightMeters: index % 2 === 0 ? 6.4 : 0.8,
    coefficient: index % 2 === 0 ? 92 - index : null,
  })),
};
// The lists of an invented account, and one of someone else's that it kept.
const SAMPLE_CHIPS = [
  { id: "favorites", name: "", isDefault: true },
  { id: "finistere", name: "Finistère", isDefault: false },
  { id: "landes", name: "Landes", isDefault: false },
];
const SAMPLE_JOINED_CHIPS = [{ id: "trip", name: "Trip to Galicia", isDefault: false }];
// What the sample spot says of itself, for the sentence of the sea now to be judged by.
const SAMPLE_WORDS = {
  bestTides: ["mid", "mid_high"],
  bestSwellDirections: ["W", "WNW"],
  bestWindDirections: ["E", "ESE"],
  sizeFactors: ["double"],
  offshoreDirectionDegrees: 110,
  waveSizeMeters: { min: 1, max: 3 },
};
const LOADED = { isPending: false, isError: false };
const LOADING = { data: undefined, isPending: true, isError: false };
// What a panel is given of the forecast and the tide when none is asked for.
const NOTHING = { data: undefined, isPending: false, isError: false };

// A username that the page never keeps: it shows how the form says that one is taken.
const refuseTaken = async () => "This username is taken.";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    // Named after its title, so that an address opens the page at it: `#wind-station-panel`.
    <section id={title.toLowerCase().replaceAll(" ", "-")} className="grid scroll-mt-m gap-m">
      <h2 className="text-l font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-xs">{children}</div>;
}

// Every shared component with its variants and states. Development only.
function AnalyticsSample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open analytics consent
      </Button>
      <AnalyticsConsentDialog open={open} onChoice={() => setOpen(false)} />
    </>
  );
}

// The account's devices, and every state push can be in on one of them: decision 031, "Push".
const SAMPLE_DEVICES: PushDevice[] = [
  {
    id: "here",
    label: "Chrome · macOS",
    createdAt: new Date(SAMPLE_NOW - 40 * 24 * 60 * 60 * 1000),
    seenAt: new Date(SAMPLE_NOW - 4 * 60 * 1000),
  },
  {
    id: "phone",
    label: "Safari · iPhone",
    createdAt: new Date(SAMPLE_NOW - 12 * 24 * 60 * 60 * 1000),
    seenAt: new Date(SAMPLE_NOW - 3 * 24 * 60 * 60 * 1000),
  },
  {
    id: "unnamed",
    label: null,
    createdAt: new Date(SAMPLE_NOW - 90 * 24 * 60 * 60 * 1000),
    seenAt: new Date(SAMPLE_NOW - 61 * 24 * 60 * 60 * 1000),
  },
];
const PUSH_STATES: [name: string, state: PushState, devices?: PushDevice[]][] = [
  ["Asking the instance", { kind: "loading" }],
  ["The instance could not be asked", { kind: "unknown" }],
  ["The browser could not be read", { kind: "unsure" }, SAMPLE_DEVICES.slice(1)],
  ["An instance with no keys", { kind: "none" }, SAMPLE_DEVICES.slice(1)],
  ["A browser that cannot", { kind: "unable" }, SAMPLE_DEVICES.slice(1)],
  ["An iPhone, not on the Home Screen", { kind: "home-screen" }],
  ["The browser's leave refused", { kind: "refused" }, SAMPLE_DEVICES.slice(1)],
  ["Off", { kind: "off", isBusy: false, failure: null }],
  ["On", { kind: "on", isBusy: false, failure: null }, SAMPLE_DEVICES],
  ["A request on its way", { kind: "off", isBusy: true, failure: null }],
  ["Being switched off", { kind: "on", isBusy: true, failure: null }, SAMPLE_DEVICES],
  ["A request that failed", { kind: "off", isBusy: false, failure: "on" }],
  ["Switching off failed", { kind: "on", isBusy: false, failure: "off" }, SAMPLE_DEVICES],
  [
    "As many devices as an account keeps",
    { kind: "off", isBusy: false, failure: "full" },
    SAMPLE_DEVICES.slice(1),
  ],
];

export function DesignSystemPage() {
  const bindings = useShortcuts();
  const [layers, setLayers] = useState<MapLayers>({
    sea: true,
    arrows: true,
    buoys: true,
    wind: true,
    breaks: true,
  });
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [chip, setChip] = useState<string>();
  const [seaTime, setSeaTime] = useState(SAMPLE_NOW);
  const [searched, setSearched] = useState("po");
  const [morphed, setMorphed] = useState(0);

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-xxl px-m py-xl">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Design system</h1>
        <ThemeToggle label="Switch between light and dark" />
      </header>

      <Section title="Colors">
        <TooltipProvider delay={0}>
          {[NEUTRALS, TRANSPARENT_NEUTRALS].map((neutrals) => (
            <div key={neutrals[0]} className="edge flex overflow-hidden rounded-xs">
              {neutrals.map((neutral) => (
                <Tooltip key={neutral}>
                  <TooltipTrigger
                    render={<span />}
                    tabIndex={0}
                    aria-label={neutral}
                    className={`h-12 flex-1 focus-visible:outline-(--focus-ring-outline) focus-visible:-outline-offset-2 ${neutral}`}
                  />
                  <TooltipPopup>{neutral}</TooltipPopup>
                </Tooltip>
              ))}
            </div>
          ))}
          <Row>
            {ACCENTS.map((accent) => (
              <Tooltip key={accent}>
                <TooltipTrigger
                  render={<span />}
                  tabIndex={0}
                  aria-label={accent}
                  className={`size-8 rounded-full focus-visible:outline-(--focus-ring-outline) ${accent}`}
                />
                <TooltipPopup>{accent}</TooltipPopup>
              </Tooltip>
            ))}
          </Row>
        </TooltipProvider>
      </Section>

      <Section title="Type">
        <div className="grid gap-xs">
          {TEXT_STEPS.map((step) => (
            <p key={step} className={step}>
              {step} · Swell 1.8 m at 12 s
            </p>
          ))}
          <p className="font-mono">font-mono · 1.8 m · 12 s · WNW</p>
        </div>
      </Section>

      <Section title="Button">
        {PROVIDERS.map((provider) => (
          <Row key={provider}>
            <ProviderButton provider={provider} />
            <ProviderButton provider={provider} isPending />
            <ProviderButton provider={provider} disabled />
          </Row>
        ))}
        {VARIANTS.map((variant) => (
          <Row key={variant}>
            <Button variant={variant}>{variant}</Button>
            <Button variant={variant}>
              <PlusIcon data-slot="icon" aria-hidden />
              With icon
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} isPending>
              Pending
            </Button>
          </Row>
        ))}
        <Row>
          {SIZES.map((size) => (
            <Button key={size} size={size}>
              {size}
              <ArrowRightIcon data-slot="icon" aria-hidden />
            </Button>
          ))}
        </Row>
        <Row>
          {ICON_SIZES.map((size) => (
            <Button key={size} size={size} variant="secondary" aria-label={size}>
              <PlusIcon data-slot="icon" aria-hidden />
            </Button>
          ))}
        </Row>
      </Section>

      <Section title="Field">
        <div className="grid max-w-sm gap-m">
          <div className="grid gap-xs">
            <Label htmlFor="ds-name">Spot name</Label>
            <Input id="ds-name" placeholder="La Torche" />
          </div>
          <Input aria-label="Invalid" aria-invalid defaultValue="Invalid value" />
          <Input aria-label="Disabled" disabled defaultValue="Disabled" />
          <Input aria-label="Small" size="sm" placeholder="Small" />
          <Input aria-label="Large" size="lg" placeholder="Large" />
          <Textarea aria-label="Notes" placeholder="Notes" />
        </div>
      </Section>

      <Section title="Menu">
        <Row>
          <Menu>
            <MenuTrigger render={<Button variant="outline" />}>Open menu</MenuTrigger>
            <MenuPopup align="start">
              <MenuGroup>
                <MenuGroupLabel>Spot</MenuGroupLabel>
                <MenuItem>Edit</MenuItem>
                <MenuItem>Share</MenuItem>
                <MenuItem disabled>Duplicate</MenuItem>
                <MenuSeparator />
                <MenuItem variant="destructive">Delete</MenuItem>
              </MenuGroup>
            </MenuPopup>
          </Menu>
        </Row>
      </Section>

      <Section title="Overlays">
        <Row>
          <Button variant="outline" onClick={openShortcutSettings}>
            Open a dialog
          </Button>
          <Button
            variant="outline"
            onClick={() => toast("Spot saved", { description: "La Torche is in your spots." })}
          >
            Show a toast
          </Button>
          <span className="flex items-center gap-xs text-neutral-7">
            Command palette
            <ShortcutKeys hotkey={bindings["command-palette"]} />
          </span>
        </Row>
      </Section>

      <Section title="Popover">
        <Row>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>Open a popover</PopoverTrigger>
            <PopoverPopup className="w-72">
              <PopoverTitle>Buoy and model</PopoverTitle>
              <PopoverDescription>
                The model's past hours are its latest run, not the forecast as first issued.
              </PopoverDescription>
            </PopoverPopup>
          </Popover>
        </Row>
      </Section>

      <Section title="Tabs">
        <Row>
          <Tabs defaultValue="forecast" className="w-64">
            <TabsList>
              <TabsTab value="forecast">Forecast</TabsTab>
              <TabsTab value="guide">Guide</TabsTab>
              <TabsTab value="later" disabled>
                Later
              </TabsTab>
            </TabsList>
            <TabsPanel value="forecast" className="text-neutral-7">
              The week ahead.
            </TabsPanel>
            <TabsPanel value="guide" className="text-neutral-7">
              What is known of the spot.
            </TabsPanel>
          </Tabs>
          <Tabs defaultValue="live">
            <TabsList variant="segment">
              <TabsTab value="live">48 h</TabsTab>
              <TabsTab value="week">7 d</TabsTab>
            </TabsList>
          </Tabs>
        </Row>
      </Section>

      <Section title="Switch">
        <Row>
          <Switch aria-label="Off" />
          <Switch aria-label="On" defaultChecked />
          <Switch aria-label="Disabled" disabled />
          <Switch aria-label="Disabled and on" disabled defaultChecked />
        </Row>
      </Section>

      <Section title="Toggle">
        <Row>
          <Toggle aria-label="Off">Left</Toggle>
          <Toggle aria-label="On" defaultPressed>
            Left
          </Toggle>
          <Toggle variant="outline">Sand</Toggle>
          <Toggle variant="outline" defaultPressed>
            Sand
          </Toggle>
          <Toggle variant="outline" disabled>
            Disabled
          </Toggle>
        </Row>
        <ToggleGroup
          multiple
          variant="outline"
          size="sm"
          defaultValue={["mid", "high"]}
          aria-label="Best tide"
          className="max-w-64"
        >
          {["low", "mid_low", "mid", "mid_high", "high"].map((stage) => (
            <ToggleGroupItem key={stage} value={stage}>
              {stage.replace("_", " to ")}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="Slider">
        <div className="grid w-64 gap-m">
          <Slider defaultValue={30} getAriaLabel={() => "Value"} />
          <Slider defaultValue={[20, 70]} getAriaLabel={(index) => (index === 0 ? "From" : "To")} />
          <Slider defaultValue={30} disabled getAriaLabel={() => "Disabled"} />
        </div>
      </Section>

      <Section title="Badge">
        <Row>
          <Badge>Revoked</Badge>
          <Badge variant="success">Working</Badge>
          <Badge variant="warning">Suspended</Badge>
          <Badge variant="error">Over the limit</Badge>
        </Row>
      </Section>

      <Section title="Meter">
        <div className="grid w-64 gap-m">
          <Meter value={120} max={300}>
            <div className="flex items-baseline justify-between gap-s">
              <MeterLabel>Calls this hour</MeterLabel>
              <MeterValue>{() => "120 / 300"}</MeterValue>
            </div>
            <MeterTrack>
              <MeterIndicator />
            </MeterTrack>
          </Meter>
          <Meter value={255} max={300} aria-label="Near the limit">
            <MeterTrack>
              <MeterIndicator level="low" />
            </MeterTrack>
          </Meter>
          <Meter value={300} max={300} aria-label="At the limit">
            <MeterTrack>
              <MeterIndicator level="high" />
            </MeterTrack>
          </Meter>
        </div>
      </Section>

      <Section title="Table">
        <Table>
          <TableCaption>Three keys, one of them revoked.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead>State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Tide clock</TableCell>
              <TableCell className="font-mono text-neutral-7">key_a1B2</TableCell>
              <TableCell className="text-right tabular-nums">1,204</TableCell>
              <TableCell>
                <Badge variant="success">Working</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Harbour screen</TableCell>
              <TableCell className="font-mono text-neutral-7">key_c3D4</TableCell>
              <TableCell className="text-right tabular-nums">86</TableCell>
              <TableCell>
                <Badge variant="success">Working</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Old script</TableCell>
              <TableCell className="font-mono text-neutral-7">key_e5F6</TableCell>
              <TableCell className="text-right tabular-nums">0</TableCell>
              <TableCell>
                <Badge>Revoked</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section title="Drawer">
        <Row>
          <Drawer swipeDirection="right">
            <DrawerTrigger render={<Button variant="outline" />}>Open a side panel</DrawerTrigger>
            <DrawerContent showCloseButton>
              <DrawerHeader>
                <DrawerTitle>Les Pierres Noires</DrawerTitle>
                <DrawerDescription>A panel on the side of a wide screen.</DrawerDescription>
              </DrawerHeader>
              <DrawerPanel>Swell 1.8 m at 12 s, from WNW.</DrawerPanel>
            </DrawerContent>
          </Drawer>
          <Drawer showSwipeHandle>
            <DrawerTrigger render={<Button variant="outline" />}>Open a sheet</DrawerTrigger>
            <DrawerContent variant="edge">
              <DrawerHeader>
                <DrawerTitle>Les Pierres Noires</DrawerTitle>
                <DrawerDescription>A sheet at the bottom of a phone.</DrawerDescription>
              </DrawerHeader>
              <DrawerPanel>Swell 1.8 m at 12 s, from WNW.</DrawerPanel>
            </DrawerContent>
          </Drawer>
        </Row>
      </Section>

      <Section title="Map markers">
        <Row>
          <BuoyPill heightMeters={0.4} periodSeconds={6} directionDegrees={250} freshness="fresh" />
          <BuoyPill
            heightMeters={1.8}
            periodSeconds={12}
            directionDegrees={290}
            freshness="fresh"
          />
          <BuoyPill
            heightMeters={2.6}
            periodSeconds={10}
            directionDegrees={null}
            freshness="aging"
          />
          <BuoyPill heightMeters={3.4} periodSeconds={14} directionDegrees={300} freshness="old" />
          <BuoyPill
            heightMeters={5.2}
            periodSeconds={null}
            directionDegrees={270}
            freshness="fresh"
          />
          <BuoyPill
            heightMeters={8.5}
            periodSeconds={17}
            directionDegrees={280}
            freshness="fresh"
          />
        </Row>
        <Row>
          <BuoyPill
            heightMeters={1.8}
            periodSeconds={12}
            directionDegrees={290}
            freshness="fresh"
            selected
          />
          <BuoyPill
            heightMeters={1.8}
            periodSeconds={12}
            directionDegrees={290}
            freshness="fresh"
            saved
          />
        </Row>
        <Row>
          {[2, 8, 13, 18, 23, 28, 35, 45].map((knots) => (
            <WindBadge key={knots} speedKnots={knots} directionDegrees={knots * 9} />
          ))}
          <WindBadge speedKnots={12} directionDegrees={null} />
          <WindBadge speedKnots={12} directionDegrees={200} selected />
        </Row>
        <Row>
          <HeightChip heightMeters={1.8} directionDegrees={290} />
          <FreshnessDot freshness="fresh" />
          <FreshnessDot freshness="aging" />
          <FreshnessDot freshness="old" />
          {(["fresh", "aging", "old"] as const).map((freshness) => (
            <span key={freshness} className="relative size-6">
              <FreshnessGauge freshness={freshness} />
            </span>
          ))}
          <span className="relative ml-s size-4">
            <UserDot className="absolute" />
          </span>
        </Row>
        <Row>
          <BreakDisc />
          <BreakPill name="Pointe des Sables" />
          <BreakPill name="Pointe des Sables" selected />
          <BreakPill name="Pointe des Sables" selected mirrored />
          <BreakPill name="The long name of a break that the pill has to cut short" />
        </Row>
        <Row>
          <BreakDisc own />
          <BreakPill name="My sandbank" own />
          <BreakPill name="My sandbank" own selected />
          <SpotPin aria-label="The marker of a spot being added" />
        </Row>
      </Section>

      <Section title="Map legend">
        <MapLegend
          layers={layers}
          onLayersChange={setLayers}
          expanded={legendExpanded}
          onExpandedChange={setLegendExpanded}
          windTruncated
          breaksTruncated
        />
      </Section>

      <Section title="Sea timeline">
        <SeaTimeline
          className="max-w-160"
          time={new Date(seaTime)}
          times={SAMPLE_SEA_TIMES}
          onTimeChange={setSeaTime}
        />
      </Section>

      <Section title="Bottom navigation">
        {/* The bar a phone goes from one screen to another by, at a phone's width, on what it
            floats over. */}
        <div className="max-w-sm rounded-(--radius-xs) bg-neutral-3 pt-s">
          <BottomNav />
        </div>
      </Section>

      <Section title="Morphing text">
        {/* A value that its reader changes by hand moves to what it becomes. */}
        <div className="flex items-center gap-m">
          <p className="text-xl font-medium tabular-nums">
            <MorphText>{morphed % 2 === 0 ? "1 h 30" : "2 h 45"}</MorphText>
          </p>
          <Button variant="secondary" size="sm" onClick={() => setMorphed(morphed + 1)}>
            Change
          </Button>
        </div>
      </Section>

      <Section title="Place search">
        {/* The search of the map by a name, with what it found of each kind. */}
        <div className="grid max-w-sm gap-xs">
          <PlaceSearch
            search={{
              query: searched,
              onQueryChange: setSearched,
              isSearching: searched.trim().length >= 2,
              spots: SAMPLE_FOUND.filter((one) => one.kind === "spot"),
              breaks: SAMPLE_FOUND.filter((one) => one.kind === "break"),
              stations: SAMPLE_FOUND.filter((one) => one.kind === "station"),
              places: SAMPLE_FOUND.filter((one) => one.kind === "place"),
              isPending: false,
              isError: false,
              credit: "© OpenStreetMap contributors",
            }}
            onPick={(found) => toast(found.name)}
            label="Search"
            placeholder="A spot, a buoy, a town"
          >
            <p className="text-s text-neutral-7">Type two letters to see what a search finds.</p>
          </PlaceSearch>
        </div>
      </Section>

      <Section title="List chips">
        <div className="grid max-w-sm gap-m">
          {/* In a panel, then as they float on the map. */}
          <ListChips
            className="mx-0 px-0"
            lists={SAMPLE_CHIPS}
            joined={SAMPLE_JOINED_CHIPS}
            current={chip}
            onPick={setChip}
          />
          <div className="rounded-(--radius-xs) bg-neutral-3 p-s">
            <ListChips
              onMap
              lists={SAMPLE_CHIPS}
              joined={SAMPLE_JOINED_CHIPS}
              current={chip}
              onPick={setChip}
            />
          </div>
        </div>
      </Section>

      {/* Where an assistant sends an account that it wants to read: decision 047. */}
      <Section title="Connect page">
        <div className="grid gap-m lg:grid-cols-2">
          <div className="edge rounded-(--radius-xs)">
            <ConnectPage
              state="asking"
              client={{ name: "Claude", site: "https://claude.ai" }}
              username="maelle_lg"
              returnsTo="claude.ai"
              isAnswering={false}
              failed={false}
              onAllow={() => {}}
              onDeny={() => {}}
            />
          </div>
          {/* An app of the account's own machine, which named itself nothing, and failed. */}
          <div className="edge rounded-(--radius-xs)">
            <ConnectPage
              state="asking"
              client={{ name: null, site: null }}
              username={null}
              returnsTo={null}
              isAnswering={false}
              failed
              onAllow={() => {}}
              onDeny={() => {}}
            />
          </div>
          <div className="edge rounded-(--radius-xs)">
            <ConnectPage state="waiting" />
          </div>
          <div className="edge rounded-(--radius-xs)">
            <ConnectPage state="nothing" />
          </div>
        </div>
      </Section>

      {/* A page of one column, centered while it fits: the sign-in and the pages a mail leads to. */}
      <Section title="Page column">
        <div className="edge grid h-80 overflow-hidden rounded-(--radius-xs)">
          <PageColumn>
            <div className="grid gap-xs">
              <h1 className="text-l font-medium">{m.reset_title_invalid()}</h1>
              <p className="text-neutral-7">{m.reset_invalid()}</p>
            </div>
            <div>
              <Button>{m.reset_ask_again()}</Button>
            </div>
          </PageColumn>
        </div>
      </Section>

      <Section title="Account panel">
        <div className="grid gap-m lg:grid-cols-2">
          <div className="edge rounded-(--radius-xs) p-m">
            <AccountPanel
              account={{ name: "maelle_lg", email: "maelle@example.org", username: "maelle_lg" }}
              standing={{ score: 180, rank: "cs" }}
              friendCount={3}
              agents={{
                list: [
                  { clientId: "one", name: "Claude", site: "https://claude.ai", since: null },
                  { clientId: "two", name: null, site: null, since: null },
                ],
                disconnecting: "two",
                onDisconnect: () => {},
              }}
              check={{ isSending: false, onSend: () => {} }}
              onUsernameSave={refuseTaken}
              onSignIn={() => {}}
              onCreateAccount={() => {}}
              onSignOut={() => {}}
              onOpenAlertSettings={() => {}}
              onOpenContributions={() => {}}
              onOpenFriends={() => {}}
              onOpenSessions={() => {}}
              profile={SAMPLE_PROFILE}
              onOpenProfile={() => {}}
            />
          </div>
          {/* An account made before usernames: it is asked to choose one. */}
          <div className="edge rounded-(--radius-xs) p-m">
            <AccountPanel
              account={{ name: "Maëlle Le Goff", email: "maelle@example.org", username: null }}
              onUsernameSave={refuseTaken}
              onSignIn={() => {}}
              onCreateAccount={() => {}}
              onSignOut={() => {}}
              onOpenAlertSettings={() => {}}
              onOpenContributions={() => {}}
              onOpenFriends={() => {}}
              onOpenSessions={() => {}}
              profile={null}
              onOpenProfile={() => {}}
            />
          </div>
          {/* A visitor: the browser keeps the units, the theme and the language. */}
          <div className="edge rounded-(--radius-xs) p-m">
            <AccountPanel
              account={undefined}
              onUsernameSave={refuseTaken}
              onSignIn={() => {}}
              onCreateAccount={() => {}}
              onSignOut={() => {}}
              onOpenAlertSettings={() => {}}
              onOpenContributions={() => {}}
              onOpenFriends={() => {}}
              onOpenSessions={() => {}}
              onOpenProfile={() => {}}
            />
          </div>
        </div>
      </Section>

      <Section title="Surfer profile, and the questions a new account is asked">
        <ProfileSamples />
      </Section>

      <Section title="Guide of a break, and contributions">
        <GuideSamples />
      </Section>

      <Section title="Friends, and the link that makes them">
        <FriendSamples />
      </Section>

      <Section title="Sessions, and the log an account keeps of them">
        <SessionSamples />
      </Section>

      <Section title="Public page of a surf break">
        <SpotPageSamples />
      </Section>

      <Section title="Forecast panel at three densities">
        {/* The same spot at each density, with its words to be judged by: decision 061. */}
        <div className="grid gap-m lg:grid-cols-3">
          {DENSITIES.map((density) => (
            <div key={density} className="edge grid content-start gap-s rounded-(--radius-xs) p-m">
              <p className="text-s font-medium text-neutral-7">{densityName(density)}</p>
              <Details
                density={density}
                spot={{ latitude: 48.34, longitude: -4.62 }}
                words={SAMPLE_WORDS}
                now={SAMPLE_NOW}
                forecast={{ data: SAMPLE_FORECAST, ...LOADED }}
                tides={{ data: SAMPLE_TIDES, ...LOADED }}
                extremes={{ data: SAMPLE_EXTREMES, ...LOADED }}
                offshoreFrom={SAMPLE_WORDS.offshoreDirectionDegrees}
                nearbyWind={{ station: SAMPLE_WIND_STATION, distanceKm: 4 }}
                footer={null}
              />
            </div>
          ))}
        </div>
        {/* The sentence alone: at a place without words, as a buoy, and while it loads. */}
        <div className="grid max-w-96 gap-xs">
          <SeaNow
            waves={{ height: 1.6, period: 11, direction: 290 }}
            wind={{ knots: 9, direction: 250, atShore: null }}
            tide={{
              trend: "falling",
              next: { type: "low", time: new Date(SAMPLE_NOW + 3 * HOUR_MS) },
            }}
            verdict={null}
            isLoading={false}
          />
          <SeaNow waves={{}} wind={{ atShore: null }} tide={null} verdict={null} isLoading />
          <SeaNow
            waves={{}}
            wind={{ atShore: null }}
            tide={null}
            verdict={null}
            isLoading={false}
          />
        </div>
      </Section>

      <Section title="Learn">
        <LearnSamples />
      </Section>

      <Section title="Viewer skeleton">
        {/* The map's place before the map, in a frame of a screen's proportions. */}
        <ViewerSkeleton className="h-144 rounded-(--radius-xs)" />
      </Section>

      <Section title="Chart">
        <div className="grid gap-m sm:grid-cols-2">
          <SeaChart
            label="Wave height"
            scale={WAVE_HEIGHT_SCALE}
            formatValue={formatHeight}
            points={SAMPLE_HEIGHTS}
            marker={new Date(SAMPLE_NOW - 12 * HOUR_MS)}
          />
          <SeaChart
            label="Wind"
            scale={WIND_SPEED_SCALE}
            formatValue={formatWind}
            points={SAMPLE_WIND}
          />
          <TideChart
            label="Tide"
            now={new Date(SAMPLE_NOW)}
            extremes={SAMPLE_EXTREMES.extremes}
            points={SAMPLE_TIDES.timeline.map((entry) => ({
              time: entry.time,
              value: entry.heightMeters,
            }))}
          />
          <SeaChart label="Loading" formatValue={formatHeight} points={[]} isLoading />
          <TideChart label="Tide, loading" extremes={[]} points={[]} isLoading />
          <SeaChart label="Empty" formatValue={formatHeight} points={[]} />
        </div>
      </Section>

      <Section title="Station panel">
        <div className="grid gap-m lg:grid-cols-2">
          <div className="edge rounded-(--radius-xs) p-m">
            <StationPanel
              now={SAMPLE_NOW}
              station={undefined}
              history={LOADING}
              forecast={LOADING}
              tides={LOADING}
              extremes={LOADING}
            />
          </div>
          <div className="edge rounded-(--radius-xs) p-m">
            <StationPanel
              now={SAMPLE_NOW}
              station={undefined}
              history={{ data: SAMPLE_READINGS, ...LOADED }}
              forecast={{ data: SAMPLE_FORECAST, ...LOADED }}
              tides={{ data: SAMPLE_TIDES, ...LOADED }}
              extremes={{ data: SAMPLE_EXTREMES, ...LOADED }}
            />
          </div>
        </div>
      </Section>

      <Section title="Wind station panel">
        <div className="grid gap-m lg:grid-cols-2">
          <div className="edge rounded-(--radius-xs) p-m">
            <StationPanel
              now={SAMPLE_NOW}
              station={SAMPLE_WIND_STATION}
              history={{ data: SAMPLE_WIND_READINGS, ...LOADED }}
              historyDays={7}
              forecast={{ data: SAMPLE_FORECAST, ...LOADED }}
              tides={NOTHING}
              extremes={NOTHING}
            />
          </div>
          <div className="edge rounded-(--radius-xs) p-m">
            <StationPanel
              now={SAMPLE_NOW}
              station={SAMPLE_WIND_STATION}
              history={LOADING}
              forecast={NOTHING}
              tides={NOTHING}
              extremes={NOTHING}
            />
          </div>
          <div className="edge rounded-(--radius-xs) p-m">
            <StationPanel
              now={SAMPLE_NOW}
              station={{ ...SAMPLE_WIND_STATION, latestReading: null }}
              history={{ data: { ...SAMPLE_WIND_READINGS, readings: [] }, ...LOADED }}
              forecast={NOTHING}
              tides={NOTHING}
              extremes={NOTHING}
            />
          </div>
        </div>
      </Section>

      <Section title="Nearest wind station">
        <div className="grid max-w-96 gap-xs">
          <NearbyWindStation
            nearby={{ station: SAMPLE_WIND_STATION, distanceKm: 4 }}
            now={SAMPLE_NOW}
            offshoreFrom={110}
          />
          <NearbyWindStation
            nearby={{ station: SAMPLE_WIND_STATION, distanceKm: 12 }}
            now={SAMPLE_NOW}
            offshoreFrom={300}
          />
          <NearbyWindStation
            nearby={{ station: SAMPLE_WIND_STATION, distanceKm: 27 }}
            now={SAMPLE_NOW}
          />
        </div>
      </Section>

      <Section title="Size against the forecast">
        {/* The sentence under a break's tiles, in each of its states: decision 062. */}
        <div className="grid max-w-96 gap-s">
          <SizeAgainstForecast
            learned={{ sessions: 14, factor: 1.8, bySwell: [] }}
            locals={null}
            hours={SAMPLE_FORECAST.hours}
            now={SAMPLE_NOW}
          />
          <SizeAgainstForecast
            learned={{
              sessions: 14,
              factor: 1.8,
              bySwell: [
                {
                  sector: SAMPLE_SWELL_SECTOR,
                  period: SAMPLE_PERIOD_BAND,
                  factor: 2,
                  sessions: 6,
                },
              ],
            }}
            locals={null}
            hours={SAMPLE_FORECAST.hours}
            now={SAMPLE_NOW}
          />
          <SizeAgainstForecast
            learned={{ sessions: 3, factor: null, bySwell: [] }}
            locals={["double"]}
            hours={SAMPLE_FORECAST.hours}
            now={SAMPLE_NOW}
          />
          <SizeAgainstForecast
            learned={{ sessions: 14, factor: 1.8, bySwell: [] }}
            locals={["same", "one_and_a_half"]}
            hours={SAMPLE_FORECAST.hours}
            now={SAMPLE_NOW}
          />
          {/* Nothing known: nothing drawn. */}
          <SizeAgainstForecast
            learned={{ sessions: 3, factor: null, bySwell: [] }}
            locals={null}
            hours={SAMPLE_FORECAST.hours}
            now={SAMPLE_NOW}
          />
        </div>
      </Section>

      <Section title="Push on this device">
        <div className="grid gap-m lg:grid-cols-2">
          {PUSH_STATES.map(([name, state, devices = []]) => (
            <div key={name} className="edge grid content-start gap-s rounded-(--radius-xs) p-m">
              <p className="text-s text-neutral-7">{name}</p>
              <PushSetting
                state={state}
                devices={{ data: devices, ...LOADED }}
                deviceId={state.kind === "on" ? "here" : null}
                removing={name === "On" ? ["unnamed"] : []}
                now={SAMPLE_NOW}
                onSwitch={() => {}}
                onRemove={() => {}}
                onRetry={() => {}}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Analytics consent">
        <AnalyticsSample />
      </Section>

      <Section title="Feedback">
        <Row>
          <Spinner />
          <Kbd>D</Kbd>
          <Skeleton className="h-9 w-40" />
        </Row>
      </Section>
    </main>
  );
}
