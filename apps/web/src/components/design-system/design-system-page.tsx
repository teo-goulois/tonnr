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
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { Slider } from "@repo/ui/components/ui/slider";
import { Switch } from "@repo/ui/components/ui/switch";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { ArrowRightIcon, PlusIcon } from "@repo/ui/icon";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { ShortcutKeys } from "@/components/shared/shortcut-keys";
import { openShortcutSettings } from "@/components/shared/shortcut-settings";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { MapLegend } from "@/components/viewer/map-legend";
import { SeaTimeline } from "@/components/viewer/sea-timeline";
import {
  BuoyPill,
  FreshnessDot,
  HeightChip,
  UserDot,
  WindBadge,
} from "@/components/viewer/map-markers";
import { SeaChart } from "@/components/viewer/sea-chart";
import { TideChart } from "@/components/viewer/tide-chart";
import type { MapLayers } from "@/components/viewer/station-map";
import { StationPanel } from "@/components/viewer/station-panel";
import type {
  Forecast,
  StationReadings,
  TideExtremes,
  TideTimeline,
} from "@/components/viewer/types";
import { formatKnots, formatMeters } from "@/lib/format";
import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE } from "@/lib/sea-scales";
import { useShortcuts } from "@/lib/shortcuts";

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

const HOUR_MS = 60 * 60 * 1000;
// A fixed moment, so the samples below draw the same curves on every visit.
const SAMPLE_NOW = Date.UTC(2026, 9, 9, 6);
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
const SAMPLE_FORECAST: Forecast = {
  point: { latitude: 48.3, longitude: -5 },
  source: {
    name: "Open-Meteo",
    url: "https://open-meteo.com/",
    attribution: "Weather data by Open-Meteo.com",
    license: {
      type: "cc-by-4.0",
      url: "https://creativecommons.org/licenses/by/4.0/",
      commercialUse: false,
    },
  },
  hours: Array.from({ length: 96 }, (_, index) => {
    const height = 1.6 + 1.2 * Math.sin(index / 14);
    return {
      time: new Date(SAMPLE_NOW - 6 * HOUR_MS + index * HOUR_MS),
      waveHeightMeters: height,
      wavePeriodSeconds: 9,
      waveDirectionDegrees: 290,
      swellHeightMeters: height * 0.8,
      swellPeriodSeconds: 11,
      swellDirectionDegrees: 285,
      windWaveHeightMeters: height * 0.3,
      windWavePeriodSeconds: 4,
      windWaveDirectionDegrees: 250,
      windSpeedMetersPerSecond: 6 + 3 * Math.sin(index / 9),
      windGustMetersPerSecond: 10,
      windDirectionDegrees: 250,
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
  })),
};
const LOADED = { isPending: false, isError: false };
const LOADING = { data: undefined, isPending: true, isError: false };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-m">
      <h2 className="text-l font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-xs">{children}</div>;
}

// Every shared component with its variants and states. Development only.
export function DesignSystemPage() {
  const bindings = useShortcuts();
  const [layers, setLayers] = useState<MapLayers>({
    sea: true,
    buoys: true,
    wind: true,
    breaks: true,
  });
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [seaTime, setSeaTime] = useState(SAMPLE_NOW);

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-xxl px-m py-xl">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Design system</h1>
        <ThemeToggle label="Switch between light and dark" />
      </header>

      <Section title="Colors">
        <div className="edge flex overflow-hidden rounded-xs">
          {NEUTRALS.map((neutral) => (
            <span key={neutral} className={`h-12 flex-1 ${neutral}`} />
          ))}
        </div>
        <Row>
          <span className="size-8 rounded-full bg-color-1" />
          <span className="size-8 rounded-full bg-success" />
          <span className="size-8 rounded-full bg-warning" />
          <span className="size-8 rounded-full bg-error" />
        </Row>
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

      <Section title="Switch">
        <Row>
          <Switch aria-label="Off" />
          <Switch aria-label="On" defaultChecked />
          <Switch aria-label="Disabled" disabled />
          <Switch aria-label="Disabled and on" disabled defaultChecked />
        </Row>
      </Section>

      <Section title="Slider">
        <div className="grid w-64 gap-m">
          <Slider defaultValue={30} getAriaLabel={() => "Value"} />
          <Slider defaultValue={[20, 70]} getAriaLabel={(index) => (index === 0 ? "From" : "To")} />
          <Slider defaultValue={30} disabled getAriaLabel={() => "Disabled"} />
        </div>
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
          <span className="relative ml-s size-4">
            <UserDot className="absolute" />
          </span>
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

      <Section title="Chart">
        <div className="grid gap-m sm:grid-cols-2">
          <SeaChart
            label="Wave height"
            scale={WAVE_HEIGHT_SCALE}
            formatValue={formatMeters}
            points={SAMPLE_HEIGHTS}
            marker={new Date(SAMPLE_NOW - 12 * HOUR_MS)}
          />
          <SeaChart
            label="Wind"
            scale={WIND_SPEED_SCALE}
            formatValue={formatKnots}
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
          <SeaChart label="Loading" formatValue={formatMeters} points={[]} isLoading />
          <TideChart label="Tide, loading" extremes={[]} points={[]} isLoading />
          <SeaChart label="Empty" formatValue={formatMeters} points={[]} />
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
