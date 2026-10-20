import type { AlertSettings } from "@repo/client/viewer/types";
import { CalendarIcon, ClockIcon, GlobalIcon, MailIcon, MoonIcon, SunIcon } from "@repo/ui/icon";
import type { ReactNode } from "react";
import { RefreshControl, View } from "react-native";

import { ErrorState } from "@/components/ui/error-state";
import { Row, Section } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { Loading, SkeletonText } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import {
  ALL_DAY,
  allWeek,
  awayDay,
  awayMoment,
  clock,
  DAYS_AHEAD,
  dayOf,
  dayWords,
  FIRST_QUIET,
  hoursFrom,
  hoursTo,
  moved,
  noticeChoices,
  noticeWords,
  oneStretch,
  type Stretch,
  stretchWords,
  weekdays,
  weekWith,
} from "./alert-settings-words";
import { DayPicker, TimePicker } from "./clock-pickers";
import { MenuPicker } from "./menu-picker";
import { PushSetting } from "./push-setting";
import { Step } from "./settings-steps";
import { type AlertSettingsChange, useAlertSettings } from "./use-alert-settings";

// How an account wants to be told, for all its alerts, one step into the account's tab: the
// web's `AlertSettingsForm`, as a phone's settings group it, each switch the platform's own and
// each time, day and choice among a few the platform's own picker. Every control saves what it
// changes at once. Decisions 031, 040 and 068.

/** A row whose end is a picker: its title, a line under it, and the picker. */
function PickerRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string | undefined;
  children: ReactNode;
}) {
  const { space } = useTheme();
  return (
    <View
      style={{
        minHeight: TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingHorizontal: space.m,
        paddingVertical: space.xs,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text>{title}</Text>
        {description ? (
          <Text size="s" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const hourOptions = (hours: number[]) =>
  hours.map((minutes) => ({ value: minutes, label: clock(minutes) }));

/** The one stretch of a day the account can go: its beginning and its end, on whole hours. */
function DayStretch({
  day,
  stretch,
  onChange,
}: {
  day: string;
  stretch: Stretch;
  onChange: (stretch: Stretch) => void;
}) {
  const { space } = useTheme();
  return (
    <View
      style={{
        minHeight: TARGET,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: space.xs,
        paddingHorizontal: space.m,
        paddingVertical: space.xxs,
      }}
    >
      <MenuPicker
        label={m.alert_settings_day_from({ day })}
        value={stretch.from}
        options={hourOptions(hoursFrom(stretch.to))}
        onChange={(from) => onChange(moved(stretch, "from", from))}
      />
      <Text tone="muted" accessible={false}>
        –
      </Text>
      <MenuPicker
        label={m.alert_settings_day_to({ day })}
        value={stretch.to}
        options={hourOptions(hoursTo(stretch.from))}
        onChange={(to) => onChange(moved(stretch, "to", to))}
      />
    </View>
  );
}

/** The days of the week the account can go, each with its hours. */
function WeekHours({
  week,
  onChange,
}: {
  week: Stretch[][];
  onChange: (week: Stretch[][]) => void;
}) {
  const days = weekdays(getLocale());
  return (
    <Section title={m.alert_settings_hours()}>
      {days.flatMap((day, index) => {
        const hours = week[index] ?? [];
        const isFree = hours.length > 0;
        const first = hours[0];
        const whole = oneStretch(hours);
        const set = (next: Stretch[]) => onChange(weekWith(week, index, next));
        const rows = [
          <Row
            key={`${day}-free`}
            title={day}
            description={dayWords(hours)}
            toggle={{ value: isFree, onChange: (free) => set(free ? ALL_DAY : []) }}
            accessibilityHint={m.alert_settings_day_free({ day })}
          />,
        ];
        // Hours given in several stretches, as the API takes them, are shown as they are and
        // kept until one stretch is asked for in their place.
        if (hours.length > 1 && whole) {
          rows.push(
            <Row
              key={`${day}-one`}
              title={m.alert_settings_day_one({ hours: stretchWords(whole) })}
              chevron={false}
              onPress={() => set([whole])}
            />,
          );
        } else if (first) {
          rows.push(
            <DayStretch
              key={`${day}-hours`}
              day={day}
              stretch={first}
              onChange={(stretch) => set([stretch])}
            />,
          );
        }
        return rows;
      })}
    </Section>
  );
}

/** The settings once they are read. */
function SettingsForm({
  kept,
  phoneZone,
  onChange,
}: {
  kept: AlertSettings;
  phoneZone: string;
  onChange: (change: AlertSettingsChange) => void;
}) {
  const zone = kept.zone ?? phoneZone;
  const isQuiet = kept.quietFrom !== null && kept.quietTo !== null;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const away = awayDay(kept.awayUntil, zone);

  return (
    <>
      <Section title={m.alert_settings_when()}>
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
          <PickerRow title={m.alert_settings_evening_at()}>
            <TimePicker
              label={m.alert_settings_evening_at()}
              minutes={kept.eveningMinutes}
              onChange={(eveningMinutes) => onChange({ eveningMinutes })}
            />
          </PickerRow>
        ) : null}
        <Row
          title={m.alert_settings_begin()}
          description={m.alert_settings_begin_hint()}
          toggle={{ value: kept.onBegin, onChange: (onBegin) => onChange({ onBegin }) }}
        />
        {kept.onBegin ? (
          <PickerRow title={m.alert_settings_notice()}>
            <MenuPicker
              label={m.alert_settings_notice()}
              value={kept.noticeMinutes}
              options={noticeChoices(kept.noticeMinutes).map((minutes) => ({
                value: minutes,
                label: noticeWords(minutes),
              }))}
              onChange={(noticeMinutes) => onChange({ noticeMinutes })}
            />
          </PickerRow>
        ) : null}
      </Section>

      {/* The reports at the breaks the account keeps, told as they come: decision 068. */}
      <Section title={m.alert_settings_reports_title()}>
        <Row
          title={m.alert_settings_reports()}
          description={m.alert_settings_reports_hint()}
          toggle={{ value: kept.onReports, onChange: (onReports) => onChange({ onReports }) }}
        />
      </Section>

      <Section footer={m.alert_settings_ahead_hint()}>
        <PickerRow title={m.alert_settings_ahead()}>
          <MenuPicker
            label={m.alert_settings_ahead()}
            value={kept.horizonDays}
            options={DAYS_AHEAD.map((count) => ({
              value: count,
              label: m.alert_settings_days({ count }),
            }))}
            onChange={(horizonDays) => onChange({ horizonDays })}
          />
        </PickerRow>
      </Section>

      <Section title={m.alert_settings_can_go()}>
        <Row
          icon={SunIcon}
          title={m.alert_settings_daylight()}
          description={m.alert_settings_daylight_hint()}
          toggle={{
            value: kept.daylightOnly,
            onChange: (daylightOnly) => onChange({ daylightOnly }),
          }}
        />
        <Row
          icon={ClockIcon}
          title={m.alert_settings_hours()}
          description={m.alert_settings_hours_hint()}
          toggle={{
            value: kept.week !== null,
            onChange: (given) => onChange({ week: given ? allWeek() : null }),
          }}
        />
        {/* Away is a switch, and the day it ends the platform's calendar under it. */}
        <Row
          icon={CalendarIcon}
          title={m.alert_settings_away()}
          description={m.alert_settings_away_hint()}
          toggle={{
            value: kept.awayUntil !== null,
            onChange: (isAway) =>
              onChange({ awayUntil: isAway ? awayMoment(dayOf(tomorrow), zone) : null }),
          }}
        />
        {kept.awayUntil !== null && away ? (
          <PickerRow title={m.native_away_back()}>
            <DayPicker
              label={m.alert_settings_away()}
              day={away}
              from={tomorrow}
              onChange={(day) => onChange({ awayUntil: awayMoment(day, zone) })}
            />
          </PickerRow>
        ) : null}
      </Section>

      {kept.week ? <WeekHours week={kept.week} onChange={(week) => onChange({ week })} /> : null}

      <Section title={m.alert_settings_how()}>
        {/* A mail needs an instance that sends some. An account says yes before its address is
            checked, and mail leaves once it is. */}
        {kept.mail === "off" ? (
          <Row
            icon={MailIcon}
            title={m.alert_settings_mail()}
            description={m.alert_settings_mail_none()}
            disabled
          />
        ) : (
          <Row
            icon={MailIcon}
            title={m.alert_settings_mail()}
            description={
              kept.mail === "unchecked"
                ? m.alert_settings_mail_unchecked()
                : m.alert_settings_mail_hint()
            }
            toggle={{ value: kept.byMail === true, onChange: (byMail) => onChange({ byMail }) }}
          />
        )}
        {kept.mail !== "off" && kept.byMail === true ? (
          <Row
            title={m.alert_settings_subject()}
            description={m.alert_settings_subject_hint()}
            toggle={{
              value: kept.namesInSubject,
              onChange: (namesInSubject) => onChange({ namesInSubject }),
            }}
          />
        ) : null}
        {kept.mail !== "off" && kept.byMail === true ? (
          <Row
            icon={MoonIcon}
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
        {kept.mail !== "off" && kept.byMail === true && isQuiet ? (
          <PickerRow title={m.alert_settings_quiet_from()}>
            <TimePicker
              label={`${m.alert_settings_quiet()}, ${m.alert_settings_quiet_from()}`}
              minutes={kept.quietFrom ?? FIRST_QUIET.quietFrom}
              onChange={(quietFrom) => onChange({ quietFrom, quietTo: kept.quietTo })}
            />
          </PickerRow>
        ) : null}
        {kept.mail !== "off" && kept.byMail === true && isQuiet ? (
          <PickerRow title={m.alert_settings_quiet_to()}>
            <TimePicker
              label={`${m.alert_settings_quiet()}, ${m.alert_settings_quiet_to()}`}
              minutes={kept.quietTo ?? FIRST_QUIET.quietTo}
              onChange={(quietTo) => onChange({ quietFrom: kept.quietFrom, quietTo })}
            />
          </PickerRow>
        ) : null}
      </Section>

      <PushSetting />

      <Section title={m.alert_settings_zone()}>
        <Row icon={GlobalIcon} title={kept.zone ?? m.alert_settings_zone_unset()} />
        {kept.zone !== phoneZone ? (
          <Row
            title={m.alert_settings_zone_use({ zone: phoneZone })}
            chevron={false}
            onPress={() => onChange({ zone: phoneZone })}
          />
        ) : null}
      </Section>
    </>
  );
}

/** The step of the alerts' settings, once the API has said them. */
export function AlertSettingsStep() {
  const { colors } = useTheme();
  const alerting = useAlertSettings();
  const refresh = (
    <RefreshControl
      refreshing={alerting.isRefetching}
      onRefresh={alerting.refetch}
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
        />
      ) : alerting.isError ? (
        <ErrorState
          title={m.alert_settings_load_failed()}
          onRetry={alerting.refetch}
          retrying={alerting.isRefetching}
        />
      ) : (
        <Loading>
          <SkeletonText lines={8} />
        </Loading>
      )}
    </Step>
  );
}
