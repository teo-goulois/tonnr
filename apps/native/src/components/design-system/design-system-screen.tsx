import {
  BellIcon,
  BookmarkFillIcon,
  BookmarkIcon,
  GlobalIcon,
  InfoIcon,
  ListsIcon,
  LogOutIcon,
  MapIcon,
  PlusIcon,
  SettingsIcon,
  ShareIcon,
  TrashIcon,
  WaveIcon,
  WindIcon,
  XIcon,
} from "@repo/ui/icon";
import { router } from "expo-router";
import { type ReactNode, useState } from "react";
import { ScrollView, View } from "react-native";
import { ScopedTheme } from "uniwind";

import { BASEMAP_ATTRIBUTION, creditParts, joinedCredits } from "@/components/map/basemap";
import { MapCredits } from "@/components/map/map-credits";
import { RankBadge } from "@/components/account/rank-badge";
import { UserDot } from "@/components/map/map-markers";
import { Glyph } from "@/components/shared/glyph";
import { ICON_SAMPLES, ICONS } from "@/components/shared/icon-samples";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { edge } from "@/components/ui/edge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { type Feel, feel } from "@/components/ui/haptics";
import { Row, RowTile, Section, SettingLine } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { Segmented } from "@/components/ui/segmented";
import { Separator } from "@/components/ui/separator";
import { Loading, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Card, Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { Text, type TextStep } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { THEME_CHOICES, type ThemeChoice } from "@/lib/theme-choice";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import type { ThemeColors } from "@/theme/tokens";

// Every component of the app's kit, with its variants and its states, and the icons as the app
// draws them: the design system of Téo's handbook, which a development build alone opens
// (`app.tonnr://design-system`). A new component of `src/components/ui/` is shown here in the
// same change. Its words are the developer's, in English, as the web's page has them; what a
// component says itself is a message.

const STEPS: TextStep[] = ["xxs", "xs", "s", "m", "l", "xl", "xxl"];
const PALETTE: (keyof ThemeColors)[] = [
  "color-1",
  "color-2",
  "color-3",
  "color-4",
  ...Array.from({ length: 10 }, (_, index) => `neutral-${index + 1}` as keyof ThemeColors),
  "success",
  "warning",
  "error",
];

const THEME_LABELS: Record<ThemeChoice, () => string> = {
  system: m.account_theme_system,
  light: m.account_theme_light,
  dark: m.account_theme_dark,
};

function Block({ title, children }: { title: string; children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.s }}>
      <Text size="l" weight="medium" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Line({ children }: { children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
      {children}
    </View>
  );
}

function Note({ children }: { children: string }) {
  return (
    <Text size="xs" tone="muted">
      {children}
    </Text>
  );
}

function Palette() {
  const { colors, space, radius } = useTheme();
  return (
    <Line>
      {PALETTE.map((name) => (
        <View key={name} style={{ width: 64, gap: space.xxs }}>
          <View
            style={[
              { height: 40, borderRadius: radius.xs, backgroundColor: colors[name] },
              edge(colors["neutral-4"], { inset: true }),
            ]}
          />
          <Text size="xxs" tone="muted" dense numberOfLines={1}>
            {name}
          </Text>
        </View>
      ))}
    </Line>
  );
}

function Type() {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      {STEPS.map((step) => (
        <Text key={step} size={step} numberOfLines={1}>
          {step} · Hossegor 1.8 m
        </Text>
      ))}
      <Line>
        <Text weight="regular">Regular</Text>
        <Text weight="medium">Medium</Text>
        <Text weight="heavy">Heavy</Text>
      </Line>
      <Line>
        <Text>Default</Text>
        <Text tone="muted">Muted</Text>
        <Text tone="accent">Accent</Text>
        <Text tone="danger">Danger</Text>
      </Line>
      <Text size="l" weight="medium" numeric dense>
        1.8 m · 12 s · 14 kn
      </Text>
      <Note>Figures of one width, and dense: Dynamic Type grows them up to 1.3 times.</Note>
    </View>
  );
}

function Buttons() {
  const { colors, space } = useTheme();
  const [saving, setSaving] = useState(false);
  return (
    <View style={{ gap: space.s }}>
      <Line>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Delete</Button>
      </Line>
      <Line>
        <Button icon={PlusIcon}>With an icon</Button>
        <Button
          variant="secondary"
          loading={saving}
          onPress={() => {
            setSaving(true);
            setTimeout(() => setSaving(false), 1500);
          }}
        >
          Press to load
        </Button>
        <Button disabled>Disabled</Button>
        <Button variant="outline" disabled>
          Disabled
        </Button>
        <Button variant="danger" disabled>
          Disabled
        </Button>
      </Line>
      <Button fill>As wide as its place</Button>
      <Line>
        <IconButton icon={PlusIcon} label="Add" variant="primary" />
        <IconButton icon={SettingsIcon} label="Settings" />
        <IconButton icon={ShareIcon} label="Share" variant="ghost" />
        <IconButton icon={TrashIcon} label="Delete" variant="danger" />
        <IconButton icon={BookmarkFillIcon} label="Saved" variant="surface" selected />
        <IconButton icon={MapIcon} label="Map" variant="surface" disabled />
        <IconButton icon={BellIcon} label="Alerts" loading />
      </Line>
      <Line>
        <IconButton icon={ListsIcon} label="Lists, unfolded" variant="surface" expanded />
        <IconButton icon={ListsIcon} label="A list shown alone" variant="inverse" />
      </Line>
      <Line>
        <IconButton icon={ShareIcon} label="Share" variant="ghost" size="small" />
        <IconButton
          icon={ShareIcon}
          label="Shared"
          variant="ghost"
          size="small"
          iconColor={colors["color-1"]}
        />
        <IconButton icon={TrashIcon} label="Delete" variant="ghost" size="small" />
        <IconButton icon={XIcon} label="Take out" variant="ghost" size="small" disabled />
      </Line>
      <Note>
        A button with a name is the theme's one height; a round one is 48 points, and a small one
        40, the web's icon-sm, for a button in a line of text.
      </Note>
      <Line>
        <Button variant="secondary" size="xs">
          Now
        </Button>
        <Button variant="ghost" size="xs" muted>
          Show less
        </Button>
        <Button variant="secondary" size="xs" icon={PlusIcon}>
          With an icon
        </Button>
        <Button variant="secondary" size="xs" disabled>
          Disabled
        </Button>
        <IconButton icon={InfoIcon} label="About these figures" variant="ghost" size="xs" muted />
        <IconButton icon={ShareIcon} label="Share" variant="secondary" size="xs" />
      </Line>
      <Note>
        The web's xs, as a phone draws it: 36 points, the small type, for a control in the head of a
        part of a panel, which a finger is given 44 points around. Muted, a ghost one is grey.
      </Note>
    </View>
  );
}

function Chips() {
  const { colors, space, radius } = useTheme();
  const [list, setList] = useState<string>("all");
  const lists = [
    { id: "all", name: "All" },
    { id: "favorites", name: "Favorites" },
    { id: "basque", name: "Basque coast" },
  ];
  return (
    <View style={{ gap: space.s }}>
      <ChipRow label="Lists">
        {lists.map((item) => (
          <Chip
            key={item.id}
            label={item.name}
            selected={list === item.id}
            onPress={() => setList(item.id)}
          />
        ))}
        <Chip
          label="Landes"
          icon={ShareIcon}
          iconLabel="Shared list"
          selected={list === "landes"}
          onPress={() => setList("landes")}
        />
        <Chip label="Disabled" selected={false} disabled onPress={() => {}} />
      </ChipRow>
      <View
        style={{ padding: space.s, borderRadius: radius.xs, backgroundColor: colors["neutral-3"] }}
      >
        <ChipRow label="Lists on the map">
          {lists.map((item) => (
            <Chip
              key={item.id}
              label={item.name}
              floating
              selected={list === item.id}
              onPress={() => setList(item.id)}
            />
          ))}
        </ChipRow>
      </View>
      <Note>Floating, as the row stands on the map.</Note>
    </View>
  );
}

function Segments() {
  const { space } = useTheme();
  const [unit, setUnit] = useState<"m" | "ft">("m");
  const [part, setPart] = useState<"news" | "mine">("news");
  const [density, setDensity] = useState<"essentials" | "details" | "everything">("details");
  return (
    <View style={{ gap: space.s }}>
      <Segmented
        label="Height"
        options={[
          { value: "m", label: "Meters" },
          { value: "ft", label: "Feet" },
        ]}
        value={unit}
        onChange={setUnit}
      />
      <Segmented
        label="Density"
        fill
        options={[
          { value: "essentials", label: "Essentials" },
          { value: "details", label: "Details" },
          { value: "everything", label: "Everything" },
        ]}
        value={density}
        onChange={setDensity}
      />
      <Segmented
        label="Not known yet"
        options={[
          { value: "a", label: "Nothing" },
          { value: "b", label: "Chosen" },
        ]}
        value={null}
        onChange={() => {}}
      />
      <Tabs
        label="Alerts"
        options={[
          { value: "news", label: "Notifications" },
          { value: "mine", label: "My alerts" },
        ]}
        value={part}
        onChange={setPart}
      />
      <Note>
        Tabs are the web's underline: the parts of one screen. A segmented control chooses a value.
      </Note>
      <Segmented
        label="Disabled"
        disabled
        options={[
          { value: "a", label: "One" },
          { value: "b", label: "Two" },
        ]}
        value="a"
        onChange={() => {}}
      />
    </View>
  );
}

function Switches() {
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  return (
    <Line>
      <Switch value={on} onChange={setOn} label="On" />
      <Switch value={off} onChange={setOff} label="Off" />
      <Switch value disabled onChange={() => {}} label="On, disabled" />
      <Switch value={false} disabled onChange={() => {}} label="Off, disabled" />
    </Line>
  );
}

function Surfaces() {
  const { space } = useTheme();
  const tell = useTell();
  return (
    <View style={{ gap: space.s }}>
      <Line>
        {(["raised", "default", "muted"] as const).map((variant) => (
          <Surface key={variant} variant={variant} style={{ padding: space.m }}>
            <Text size="s">{variant}</Text>
          </Surface>
        ))}
      </Line>
      <Card title="La Gravière" description="A beach break, best at mid tide on a west swell." />
      <Card
        title="Opens something"
        description="The whole card is one button."
        onPress={() => tell({ title: "The card was pressed" })}
      />
      <Surface style={{ paddingVertical: space.s }}>
        <Text style={{ paddingHorizontal: space.m }}>Above the line</Text>
        <View style={{ paddingVertical: space.xs }}>
          <Separator />
        </View>
        <Text style={{ paddingHorizontal: space.m }}>Under it</Text>
        <View style={{ paddingVertical: space.xs }}>
          <Separator inset={space.m} />
        </View>
        <Text style={{ paddingHorizontal: space.m }}>Under a line that starts at the text</Text>
      </Surface>
    </View>
  );
}

function Lists() {
  const { colors, space } = useTheme();
  const [push, setPush] = useState(true);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const tell = useTell();
  return (
    <View style={{ gap: space.l }}>
      <Section title="Settings" footer="A line under the rows says what they do.">
        <Row icon={GlobalIcon} title="Language" value="English" onPress={() => {}} />
        <Row icon={WaveIcon} title="Height" value="Meters" onPress={() => {}} />
        <Row
          icon={BellIcon}
          tint={colors.warning}
          title="Push on this phone"
          toggle={{ value: push, onChange: setPush }}
        />
        <Row icon={WindIcon} title="Disabled" value="Knots" disabled onPress={() => {}} />
      </Section>
      <Section>
        <Row
          title="A row with a description"
          description="And no icon: its line starts at the title."
          onPress={() => {}}
        />
        <Row title="A row that says, and opens nothing" value="2.0.1" />
        <Row
          icon={LogOutIcon}
          title="Sign out"
          destructive
          chevron={false}
          onPress={() => tell({ title: "Signed out", tone: "success" })}
        />
      </Section>
      <Section plain title="A plain section, the web's panel" lead="A line over its rows.">
        <Row
          title="A row that opens"
          description="Its words stand in line with the title."
          onPress={() => {}}
        />
        <Row
          title="This phone"
          badge="This device"
          accessory={<IconButton icon={TrashIcon} label="Remove" variant="ghost" size="small" />}
        />
        <Row
          title="Push on this phone"
          description="The switch stands at the top of two lines."
          note="It could not be turned on."
          toggle={{ value: push, onChange: setPush }}
        />
        <Row
          title="Waiting for its answer"
          toggle={{ value: push, onChange: setPush, disabled: true }}
        />
        <Row title="Delete the account" description="One step in." destructive onPress={() => {}} />
      </Section>
      <Section plain title="Display">
        <SettingLine label="Theme">
          <Segmented<"system" | "light" | "dark">
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </SettingLine>
        <SettingLine label="A setting with a long name, whose choice goes under it">
          <Segmented<"a" | "b" | "c">
            label="Density"
            value="b"
            onChange={() => {}}
            options={[
              { value: "a", label: "Simple" },
              { value: "b", label: "Classic" },
              { value: "c", label: "Complete" },
            ]}
          />
        </SettingLine>
      </Section>
      <Line>
        <Badge>This device</Badge>
        <Badge tone="success">Counted</Badge>
        <Badge tone="warning">Waiting</Badge>
        <Badge tone="error">Refused</Badge>
        <RankBadge rank="cs" />
      </Line>
      <Surface
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.s,
          minHeight: TARGET,
          paddingHorizontal: space.m,
        }}
      >
        <RowTile icon={PlusIcon} />
        <RowTile icon={BellIcon} tint={colors.warning} />
        <RowTile icon={WindIcon} disabled />
        <Text tone="muted" style={{ flex: 1 }}>
          A row's tile alone, beside a field
        </Text>
      </Surface>
    </View>
  );
}

function States() {
  const { space } = useTheme();
  const [retrying, setRetrying] = useState(false);
  return (
    <View style={{ gap: space.s }}>
      <Surface>
        <EmptyState
          icon={BookmarkIcon}
          title="Nothing saved yet"
          description="Open a buoy or a surf break and press its bookmark."
          action={{ label: "Open the map", onPress: () => {} }}
        />
      </Surface>
      <Surface>
        <ErrorState
          title={m.saved_load_failed()}
          retrying={retrying}
          onRetry={() => {
            setRetrying(true);
            setTimeout(() => setRetrying(false), 1500);
          }}
        />
      </Surface>
      <Surface style={{ padding: space.m }}>
        <Loading>
          <View style={{ gap: space.s }}>
            <View style={{ flexDirection: "row", gap: space.s, alignItems: "center" }}>
              <Skeleton width={40} height={40} round />
              <View style={{ flex: 1 }}>
                <SkeletonText lines={2} size="s" />
              </View>
            </View>
            <Skeleton height={120} />
            <SkeletonText lines={3} />
          </View>
        </Loading>
      </Surface>
    </View>
  );
}

function Toasts() {
  const tell = useTell();
  return (
    <Line>
      <Button variant="secondary" onPress={() => tell({ title: "Copied" })}>
        Tell
      </Button>
      <Button
        variant="secondary"
        onPress={() =>
          tell({
            title: "The alert is saved",
            description: "Hossegor, 1.5 m and more",
            tone: "success",
          })
        }
      >
        Done
      </Button>
      <Button
        variant="secondary"
        onPress={() => tell({ title: "Your lists could not be loaded.", tone: "danger" })}
      >
        Failed
      </Button>
      <Button
        variant="secondary"
        onPress={() =>
          tell({
            title: "Removed from Favorites",
            action: { label: "Undo", onPress: () => tell({ title: "Back in Favorites" }) },
          })
        }
      >
        With an action
      </Button>
    </Line>
  );
}

const FEELS: Feel[] = ["select", "toggle-on", "toggle-off", "hold", "done", "failed", "warn"];

function Feels() {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.s }}>
      <Line>
        {FEELS.map((what) => (
          <Button key={what} variant="secondary" onPress={() => feel(what)}>
            {what}
          </Button>
        ))}
      </Line>
      <Note>Felt on a phone, not on a simulator.</Note>
    </View>
  );
}

function Icons() {
  const { space } = useTheme();
  return (
    <Line>
      {ICONS.map(([name, icon]) => (
        <View key={name} style={{ width: 76, alignItems: "center", gap: space.xxs }}>
          <Glyph icon={icon} size={20} {...(ICON_SAMPLES[name] ?? {})} />
          <Text size="xxs" tone="muted" dense numberOfLines={1}>
            {name.replace(/Icon$/, "")}
          </Text>
        </View>
      ))}
    </Line>
  );
}

/** What floats over the map, which the map's screen draws with the kit. */
function MapParts() {
  const { space } = useTheme();
  const [creditsShown, setCreditsShown] = useState(true);
  return (
    <View style={{ gap: space.s }}>
      {creditsShown ? (
        <MapCredits
          parts={joinedCredits([
            creditParts("Generated using E.U. Copernicus Marine Service Information"),
            creditParts(BASEMAP_ATTRIBUTION),
          ])}
          onFold={() => setCreditsShown(false)}
        />
      ) : (
        <Button variant="secondary" onPress={() => setCreditsShown(true)}>
          Show the credits
        </Button>
      )}
      <Note>
        The credits open as the map does, fold at their button or once the map is moved, and open
        again from the legend.
      </Note>
      <Line>
        <UserDot label={m.locate_you_are_here()} />
      </Line>
      <Note>Where the reader was found: its halo pings unless motion was refused.</Note>
    </View>
  );
}

/** A few components in one theme, whatever theme is in force: light and dark side by side. */
function InTheme({ theme }: { theme: "light" | "dark" }) {
  return (
    <ScopedTheme theme={theme}>
      <ThemePanel title={theme === "light" ? "Light" : "Dark"} />
    </ScopedTheme>
  );
}

function ThemePanel({ title }: { title: string }) {
  const { colors, space, radius } = useTheme();
  const [on, setOn] = useState(true);
  return (
    <View
      style={[
        { flex: 1, gap: space.s, padding: space.s, borderRadius: radius.xs },
        { backgroundColor: colors["cte-canvas"] },
        edge(colors["neutral-4"]),
      ]}
    >
      <Text size="s" weight="medium">
        {title}
      </Text>
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Chip label="Favorites" selected onPress={() => {}} />
      <Switch value={on} onChange={setOn} label={title} />
      <Text size="s" tone="muted">
        Muted text
      </Text>
    </View>
  );
}

export function DesignSystemScreen() {
  const { colors, space, choice, choose, scheme } = useTheme();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}
      contentContainerStyle={{ gap: space.xl, padding: space.m, paddingBottom: space.xxl }}
    >
      <Block title="Theme">
        <Segmented
          label={m.account_theme()}
          options={THEME_CHOICES.map((value) => ({ value, label: THEME_LABELS[value]() }))}
          value={choice}
          onChange={choose}
        />
        <Note>{`In force: ${scheme}. The choice is kept on the phone, as the web's browser keeps it.`}</Note>
        <View style={{ flexDirection: "row", gap: space.s }}>
          <InTheme theme="light" />
          <InTheme theme="dark" />
        </View>
      </Block>
      <Block title="Colors">
        <Palette />
      </Block>
      <Block title="Text">
        <Type />
      </Block>
      <Block title="Button">
        <Buttons />
      </Block>
      <Block title="Chip">
        <Chips />
      </Block>
      <Block title="Segmented and tabs">
        <Segments />
      </Block>
      <Block title="Switch">
        <Switches />
      </Block>
      <Block title="Surface, card and separator">
        <Surfaces />
      </Block>
      <Block title="Section, row and badge">
        <Lists />
      </Block>
      <Block title="Empty, error and loading">
        <States />
      </Block>
      <Block title="Map">
        <MapParts />
      </Block>
      <Block title="Sheet">
        <Button variant="secondary" onPress={() => router.push("/design-system-sheet")}>
          Open a form sheet
        </Button>
        <Note>
          Change something in it, then swipe it down or press Cancel: it asks before it loses what
          changed.
        </Note>
      </Block>
      <Block title="Toast">
        <Toasts />
      </Block>
      <Block title="Feel">
        <Feels />
      </Block>
      <Block title="Icons">
        <Icons />
      </Block>
    </ScrollView>
  );
}
