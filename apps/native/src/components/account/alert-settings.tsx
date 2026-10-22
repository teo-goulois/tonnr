import {
  ALL_DAY,
  type AlertSettingsChange,
  clock,
  DAY_MINUTES,
  DAYS_AHEAD,
  FIRST_QUIET,
  noticeChoices,
} from "@repo/client/alerts/settings";
import type { AlertSettings } from "@repo/client/viewer/types";
import { type ReactNode, useState } from "react";
import { RefreshControl, View } from "react-native";

import { RangeSlider } from "@/components/alerts/range-slider";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { feel } from "@/components/ui/haptics";
import { Row, Section } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { Toggle, ToggleGroup } from "@/components/ui/toggle";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { type PhonePush, usePhonePush } from "@/lib/use-push";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import {
  allWeek,
  awayDay,
  awayMoment,
  dateOfDay,
  dayOf,
  dayWords,
  noticeWords,
  oneStretch,
  type Stretch,
  stretchWords,
  weekdays,
  weekWith,
} from "./alert-settings-words";
import { DayPicker, TimePicker } from "./clock-pickers";
import { PushSetting } from "./push-setting";
import { Step } from "./settings-steps";
import { useAlertSettings } from "./use-alert-settings";

// How an account wants to be told, for all its alerts, one step into the account's tab: the
// web's `AlertSettingsForm`, section by section in its order, its rows on the screen's ground as
// the web's panel draws them. Each switch is the platform's own, and so is each time and day,
// which the web asks in a field; a choice among a few is the web's toggles. Every control saves
// what it changes at once. Decisions 031, 040 and 068.

/** What stands under a switch at the start of the line, as the web's bare field: a picker. */
function Under({ children }: { children: ReactNode }) {
  return <View style={{ alignItems: "flex-start" }}>{children}</View>;
}

/** A choice among a few, as the web's small outline toggles say it: the one in force pressed in. */
function Choices({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: number; label: string }[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <ToggleGroup label={label}>
      {options.map((option) => (
        <Toggle
          key={option.value}
          label={option.label}
          pressed={option.value === value}
          onPress={() => {
            if (option.value !== value) onChange(option.value);
          }}
        />
      ))}
    </ToggleGroup>
  );
}

/** An end of the quiet hours: a time of the day, with its name before it. */
function QuietHour({
  label,
  minutes,
  onChange,
}: {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      {/* The picker says it to a screen reader. */}
      <Text size="s" accessible={false}>
        {label}
      </Text>
      <TimePicker
        label={`${m.alert_settings_quiet()}, ${label}`}
        minutes={minutes}
        onChange={onChange}
      />
    </View>
  );
}

/** One day of the week: whether the account can go, and between which hours. */
function DayHours({
  day,
  hours,
  onChange,
}: {
  day: string;
  hours: readonly Stretch[];
  onChange: (hours: Stretch[]) => void;
}) {
  const { space } = useTheme();
  // The slider is followed while it moves, and saved when it is let go.
  const [moving, setMoving] = useState<Stretch | null>(null);
  const shown = moving ?? hours[0] ?? { from: 0, to: DAY_MINUTES };
  const isFree = hours.length > 0;
  // Hours given in several stretches, as the API takes them: the slider sets one, so they are
  // shown as they are and kept until one stretch is asked for in their place.
  const whole = hours.length > 1 ? oneStretch(hours) : undefined;
  const words = !isFree || whole ? dayWords(hours) : stretchWords(shown);
  const label = `${m.alert_settings_day_free({ day })}, ${words}`;
  const flip = (free: boolean) => onChange(free ? ALL_DAY : []);

  return (
    <View style={{ gap: space.xxs }}>
      {/* The day, and its hours beside its switch, which the whole line is to a screen reader. */}
      <View
        accessible
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: isFree }}
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName !== "activate") return;
          feel(isFree ? "toggle-off" : "toggle-on");
          flip(!isFree);
        }}
        style={{
          minHeight: TARGET,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.s,
        }}
      >
        <Text style={{ flexShrink: 1 }}>{day}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
          <Text size="s" tone="muted" numeric>
            {words}
          </Text>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Switch value={isFree} onChange={flip} />
          </View>
        </View>
      </View>
      {whole ? (
        <Button
          variant="ghost"
          onPress={() => onChange([whole])}
          style={{ alignSelf: "flex-start" }}
        >
          {m.alert_settings_day_one({ hours: stretchWords(whole) })}
        </Button>
      ) : isFree ? (
        <RangeSlider
          leastLabel={m.alert_settings_day_from({ day })}
          mostLabel={m.alert_settings_day_to({ day })}
          values={[shown.from / 60, shown.to / 60]}
          min={0}
          max={24}
          step={1}
          gap={1}
          ends={false}
          format={(hour) => clock(hour * 60)}
          onChange={([from, to]) => setMoving({ from: from * 60, to: to * 60 })}
          onCommit={([from, to]) => {
            setMoving(null);
            onChange([{ from: from * 60, to: to * 60 }]);
          }}
        />
      ) : null}
    </View>
  );
}

/** The settings once they are read. */
function SettingsForm({
  kept,
  phoneZone,
  onChange,
  push,
}: {
  kept: AlertSettings;
  phoneZone: string;
  onChange: (change: AlertSettingsChange) => void;
  push: PhonePush;
}) {
  const zone = kept.zone ?? phoneZone;
  const days = weekdays(getLocale());
  const isQuiet = kept.quietFrom !== null && kept.quietTo !== null;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  // The day the account is away until, on its own calendar. One that is past already is shown
  // as it is, which the picker then reaches.
  const away = awayDay(kept.awayUntil, zone);
  const awayFrom = away && dateOfDay(away) < tomorrow ? dateOfDay(away) : tomorrow;
  const byMail = kept.mail !== "off" && kept.byMail === true;

  return (
    <>
      <Section plain title={m.alert_settings_when()}>
        <Row
          title={m.alert_settings_found()}
          description={m.alert_settings_found_hint()}
          toggle={{ value: kept.onFound, onChange: (onFound) => onChange({ onFound }) }}
        />
        <Row
          title={m.alert_settings_change()}
          description={m.alert_settings_change_hint()}
          toggle={{ value: kept.onChange, onChange: (next) => onChange({ onChange: next }) }}
        />
        <Row
          title={m.alert_settings_evening()}
          description={m.alert_settings_evening_hint()}
          toggle={{ value: kept.onEvening, onChange: (onEvening) => onChange({ onEvening }) }}
        />
        {kept.onEvening ? (
          <Under>
            <TimePicker
              label={m.alert_settings_evening_at()}
              minutes={kept.eveningMinutes}
              onChange={(eveningMinutes) => onChange({ eveningMinutes })}
            />
          </Under>
        ) : null}
        <Row
          title={m.alert_settings_begin()}
          description={m.alert_settings_begin_hint()}
          toggle={{ value: kept.onBegin, onChange: (onBegin) => onChange({ onBegin }) }}
        />
        {kept.onBegin ? (
          // A notice set elsewhere, that is none of these, shows as it is.
          <Choices
            label={m.alert_settings_notice()}
            options={noticeChoices(kept.noticeMinutes).map((minutes) => ({
              value: minutes,
              label: noticeWords(minutes),
            }))}
            value={kept.noticeMinutes}
            onChange={(noticeMinutes) => onChange({ noticeMinutes })}
          />
        ) : null}
      </Section>

      {/* The reports at the breaks the account keeps, told as they come: decision 068. */}
      <Section plain title={m.alert_settings_reports_title()}>
        <Row
          title={m.alert_settings_reports()}
          description={m.alert_settings_reports_hint()}
          toggle={{ value: kept.onReports, onChange: (onReports) => onChange({ onReports }) }}
        />
      </Section>

      <Section plain title={m.alert_settings_ahead()} lead={m.alert_settings_ahead_hint()}>
        <Choices
          label={m.alert_settings_ahead_hint()}
          options={DAYS_AHEAD.map((count) => ({
            value: count,
            label: m.alert_settings_days({ count }),
          }))}
          value={kept.horizonDays}
          onChange={(horizonDays) => onChange({ horizonDays })}
        />
      </Section>

      <Section plain title={m.alert_settings_can_go()}>
        <Row
          title={m.alert_settings_daylight()}
          description={m.alert_settings_daylight_hint()}
          toggle={{
            value: kept.daylightOnly,
            onChange: (daylightOnly) => onChange({ daylightOnly }),
          }}
        />
        <Row
          title={m.alert_settings_hours()}
          description={m.alert_settings_hours_hint()}
          toggle={{
            value: kept.week !== null,
            onChange: (given) => onChange({ week: given ? allWeek() : null }),
          }}
        />
        {kept.week
          ? days.map((day, index) => (
              <DayHours
                key={day}
                day={day}
                hours={kept.week?.[index] ?? []}
                onChange={(hours) => onChange({ week: weekWith(kept.week, index, hours) })}
              />
            ))
          : null}
        {/* Away is a switch, since the platform's calendar cannot stand empty as the web's
            field does, and the day it ends is under it. */}
        <Row
          title={m.alert_settings_away()}
          description={m.alert_settings_away_hint()}
          toggle={{
            value: kept.awayUntil !== null,
            onChange: (isAway) =>
              onChange({ awayUntil: isAway ? awayMoment(dayOf(tomorrow), zone) : null }),
          }}
        />
        {kept.awayUntil !== null && away ? (
          <Under>
            <DayPicker
              label={m.alert_settings_away()}
              day={away}
              from={awayFrom}
              onChange={(day) => onChange({ awayUntil: awayMoment(day, zone) })}
            />
          </Under>
        ) : null}
      </Section>

      <Section plain title={m.alert_settings_how()}>
        {/* A mail needs an instance that sends some. An account says yes before its address is
            checked, and mail leaves once it is. */}
        {kept.mail === "off" ? (
          <Row
            title={m.alert_settings_mail()}
            description={m.alert_settings_mail_none()}
            disabled
          />
        ) : (
          <Row
            title={m.alert_settings_mail()}
            description={
              kept.mail === "unchecked"
                ? m.alert_settings_mail_unchecked()
                : m.alert_settings_mail_hint()
            }
            toggle={{ value: kept.byMail === true, onChange: (next) => onChange({ byMail: next }) }}
          />
        )}
        {byMail ? (
          <Row
            title={m.alert_settings_subject()}
            description={m.alert_settings_subject_hint()}
            toggle={{
              value: kept.namesInSubject,
              onChange: (namesInSubject) => onChange({ namesInSubject }),
            }}
          />
        ) : null}
        {byMail ? (
          <Row
            title={m.alert_settings_quiet()}
            description={m.alert_settings_quiet_hint()}
            toggle={{
              value: isQuiet,
              // Given whole: a beginning and an end, or neither.
              onChange: (quiet) =>
                onChange(quiet ? FIRST_QUIET : { quietFrom: null, quietTo: null }),
            }}
          />
        ) : null}
        {byMail && kept.quietFrom !== null && kept.quietTo !== null ? (
          <QuietLine
            from={kept.quietFrom}
            to={kept.quietTo}
            onChange={(quietFrom, quietTo) => onChange({ quietFrom, quietTo })}
          />
        ) : null}
        <PushSetting push={push} />
      </Section>

      <Section plain title={m.alert_settings_zone()}>
        <Text size="s">{kept.zone ?? m.alert_settings_zone_unset()}</Text>
        {kept.zone !== phoneZone ? (
          <Button
            variant="secondary"
            onPress={() => onChange({ zone: phoneZone })}
            style={{ alignSelf: "flex-start" }}
          >
            {m.alert_settings_zone_use({ zone: phoneZone })}
          </Button>
        ) : null}
      </Section>
    </>
  );
}

/** The quiet hours on one line, as the web writes them: "from 22:00 to 07:00". */
function QuietLine({
  from,
  to,
  onChange,
}: {
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
}) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.s }}>
      <QuietHour
        label={m.alert_settings_quiet_from()}
        minutes={from}
        onChange={(next) => onChange(next, to)}
      />
      <QuietHour
        label={m.alert_settings_quiet_to()}
        minutes={to}
        onChange={(next) => onChange(from, next)}
      />
    </View>
  );
}

/** The step of the alerts' settings, once the API has said them. */
export function AlertSettingsStep() {
  const { colors, space, type } = useTheme();
  const { userId } = useAccount();
  const alerting = useAlertSettings();
  const push = usePhonePush(userId);
  // A pull asks again for the settings, and for what push on this phone reads.
  const refresh = (
    <RefreshControl
      refreshing={alerting.isRefetching}
      onRefresh={() => {
        alerting.refetch();
        push.refresh();
      }}
      tintColor={colors["neutral-7"]}
    />
  );

  return (
    <Step title={m.command_alerts_settings()} refreshControl={refresh}>
      {alerting.settings ? (
        <SettingsForm
          kept={alerting.settings}
          phoneZone={alerting.phoneZone}
          onChange={alerting.change}
          push={push}
        />
      ) : alerting.isError ? (
        <ErrorState
          plain
          title={m.alert_settings_load_failed()}
          onRetry={alerting.refetch}
          retrying={alerting.isRefetching}
        />
      ) : (
        <Loading>
          <View style={{ gap: space.s }}>
            <Skeleton height={type.m.line} width="40%" />
            <Skeleton height={type.m.line} width="80%" />
            <Skeleton height={type.m.line} width="60%" />
          </View>
        </Loading>
      )}
    </Step>
  );
}
