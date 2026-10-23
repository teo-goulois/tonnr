import { UNIT_CHOICES } from "@repo/client/units";
import { APP_NAME } from "@repo/config/app";
import { LOCALES } from "@repo/config/locales";
import { LogOutIcon } from "@repo/ui/icon";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Application from "expo-application";
import { type Href, router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { AccountPrompt } from "@/components/auth/account-prompt";
import { useStanding } from "@/components/contributions/use-standing";
import { useProfile } from "@/components/profile/use-profile";
import { profileWords } from "@/components/profile/profile-words";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Row, Section, SettingLine } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { Segmented } from "@/components/ui/segmented";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { analyticsConfigured } from "@/lib/analytics";
import { THEME_CHOICES } from "@/lib/theme-choice";
import { useTheme } from "@/lib/theme";
import { type Units, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";

import { AccountHeader } from "./account-header";
import { AgentsSection } from "./agents";
import { DENSITIES, densityName, PALETTES, setPalette, useDensity, usePalette } from "./display";
import { useSaveDensity, useSaveUnits } from "./kept-settings";
import { useSignOut } from "./leave";
import { useOpenPage } from "./open-page";
import { rankName } from "./rank-badge";
import { restartInLanguage } from "./restart";
import {
  blocksWords,
  friendsWords,
  LANGUAGES,
  MEASURES,
  points,
  THEME_WORDS,
} from "./settings-words";
import type { SitePage } from "./site-pages";
import { unitName } from "./unit-name";
import {
  setConsent,
  setErrorReports,
  useConsent,
  useErrorReports,
  useInstanceErrorReports,
} from "./use-consent";
import { useOwnAccount, useSendVerification } from "./use-own-account";

const go = (href: Href) => () => router.push(href);

/** The choice of one measurement's unit, on a line, which saves at once: decision 033. */
function UnitLine<Measure extends keyof Units>({
  measure,
  label,
  units,
  onSave,
}: {
  measure: Measure;
  label: string;
  units: Units;
  onSave: (change: Partial<Units>) => void;
}) {
  // Each measure's choices are its own units, which the shared list does not say by its type.
  const offered = UNIT_CHOICES[measure] as unknown as readonly Units[Measure][];
  return (
    <SettingLine label={label}>
      <Segmented
        label={label}
        options={offered.map((unit) => ({ value: unit, label: unitName(measure, unit) }))}
        value={units[measure]}
        onChange={(unit) => onSave({ [measure]: unit } as Partial<Units>)}
      />
    </SettingLine>
  );
}

/**
 * A page of the site in a line of small links, as the web's panel lists its legal texts: it is
 * drawn at its line's height and reaches a finger's height past it.
 */
function PageLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, type } = useTheme();
  const slop = Math.ceil((TARGET - type.s.line) / 2);
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={{ top: slop, bottom: slop }}>
      {({ pressed }) => (
        <Text size="s" style={{ color: pressed ? colors["neutral-10"] : colors["neutral-7"] }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * What the app may tell of how it is used and of what breaks, as the web's `AnalyticsSetting`
 * offers it to a visitor and an account alike: off until said yes (decision 044), and the error
 * reports apart once it is, unless the instance's operator turned them off (decision 054). A
 * build that names no project of PostHog sends nothing, and has nothing to offer.
 */
function AnalyticsSection() {
  const consent = useConsent();
  const errorReports = useErrorReports();
  // What the instance answered, which the app asks once a run (`useAccountStart`).
  const instanceErrorReports = useInstanceErrorReports();
  const granted = consent === "granted";
  if (!analyticsConfigured) return null;
  return (
    <Section plain title={m.analytics_title()} lead={m.analytics_description()}>
      <Button
        variant="secondary"
        onPress={() => setConsent(granted ? "denied" : "granted")}
        style={{ alignSelf: "flex-start" }}
      >
        {granted ? m.analytics_disable() : m.analytics_allow()}
      </Button>
      {/* An instance whose operator turned them off has no reports to choose. */}
      {granted && instanceErrorReports ? (
        <Row
          title={m.analytics_errors()}
          description={m.analytics_errors_description()}
          toggle={{ value: errorReports, onChange: setErrorReports }}
        />
      ) : null}
    </Section>
  );
}

/** The place of the tab while the phone's session is read: who is signed in, and sections. */
function AccountSkeleton() {
  const { space, type } = useTheme();
  return (
    <Loading>
      <View style={{ gap: space.l }}>
        <View style={{ gap: space.xs }}>
          <Skeleton height={type.m.size} width="45%" />
          <Skeleton height={type.s.size} width="65%" />
        </View>
        {[2, 3, 5].map((rows) => (
          <View key={rows} style={{ gap: space.s }}>
            <Skeleton height={type.s.size} width="30%" />
            {Array.from({ length: rows }, (_, row) => (
              <Skeleton key={row} height={TARGET} />
            ))}
          </View>
        ))}
      </View>
    </Loading>
  );
}

/**
 * The account's tab, as the web's `AccountPanel` draws it on a phone, in its order: who is
 * signed in, then the sessions and the profile, the community, the units, the alerts, how the app
 * draws and its language, the assistants it connected, what the app is, what it may tell, and at
 * the end what signs out, what deletes the account, and the app's version. A visitor has the
 * settings the phone keeps and the two ways in. Decisions 040, 041, 044, 047, 061, 063 and 071.
 */
export function AccountScreen() {
  const { colors, space, choice, choose } = useTheme();
  const { openPage } = useOpenPage();
  const queryClient = useQueryClient();
  const own = useOwnAccount();
  const check = useSendVerification();
  const signOut = useSignOut();
  const units = useUnits();
  const saveUnits = useSaveUnits();
  const density = useDensity();
  const saveDensity = useSaveDensity();
  const palette = usePalette();
  const signedIn = own.signedIn === true;
  const account = own.account;
  const [isLeaving, setLeaving] = useState(false);

  const profiling = useProfile();
  // The contributions step reads the same question: a pull on either reads both again.
  const standing = useStanding();
  const friends = useQuery(orpc.v1.friends.list.queryOptions({ enabled: signedIn, retry: false }));
  const blocks = useQuery(orpc.v1.blocks.list.queryOptions({ enabled: signedIn, retry: false }));

  const refreshing =
    own.isRefetching ||
    standing.isRefetching ||
    friends.isRefetching ||
    blocks.isRefetching ||
    profiling.isRefetching;
  const refresh = () => {
    void own.refetch();
    void standing.refetch();
    void friends.refetch();
    void blocks.refetch();
    void queryClient.invalidateQueries({ queryKey: orpc.v1.agents.list.key() });
    profiling.retry();
  };

  // As the web: signing out asks nothing, and whoever signs out goes back to the map, which a
  // phone opens on in the web's landing's place.
  async function leave() {
    setLeaving(true);
    await signOut();
    setLeaving(false);
    feel("done");
    router.replace("/");
  }

  const page = (of: SitePage) => () => void openPage(of);
  const score = standing.data?.score ?? 0;
  const rank = standing.data?.rank ?? null;
  const version = `${Application.nativeApplicationVersion ?? "0.0.0"} (${Application.nativeBuildVersion ?? "0"})`;
  // The name and the address are the session's until the API says them, as the web's panel
  // reads them, and so is the username the account is called by, until the API says its own.
  const username = account ? account.username : own.session?.username;
  const name = account?.name ?? own.session?.name ?? "";

  if (own.signedIn === undefined) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}
        contentContainerStyle={{ padding: space.m, paddingBottom: space.xxl }}
      >
        <AccountSkeleton />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}
      contentContainerStyle={{ gap: space.l, padding: space.m, paddingBottom: space.xxl }}
      refreshControl={
        signedIn ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors["neutral-7"]}
          />
        ) : undefined
      }
    >
      {signedIn ? (
        <AccountHeader
          title={username ? `@${username}` : name}
          email={account?.email ?? own.session?.email ?? ""}
          rank={rank}
          // What chooses a username waits for the API, which knows the one in force.
          username={account?.username}
          check={
            account?.checksAddresses && !account.emailVerified
              ? { isSending: check.isSending, onSend: check.send }
              : undefined
          }
        />
      ) : (
        <AccountPrompt text={m.account_sign_in_prompt()} />
      )}

      {/* What the account surfed, and what the sea did then, and what it said of itself. */}
      {signedIn ? (
        <Section plain title={m.sessions_section()}>
          <Row
            title={m.profile_title()}
            description={profileWords(profiling.profile) ?? m.profile_hint()}
            onPress={go("/account/profile")}
          />
          <Row
            title={m.sessions_title()}
            description={m.sessions_hint()}
            onPress={go("/account/logbook")}
          />
        </Section>
      ) : null}

      {/* What the account wrote in the guides of the spots, and where it stands. */}
      {signedIn ? (
        <Section plain title={m.community_title()}>
          <Row
            title={m.contributions_title()}
            description={
              score > 0
                ? [points(score), rank && rankName(rank)].filter(Boolean).join(" · ")
                : m.contributions_hint()
            }
            onPress={go("/account/contributions")}
          />
          <Row
            title={m.friends_title()}
            description={friendsWords(friends.data?.friends.length)}
            onPress={go("/account/friends")}
          />
          <Row
            title={m.blocks_title()}
            description={blocksWords(blocks.data?.blocks.length)}
            onPress={go("/account/blocked")}
          />
        </Section>
      ) : null}

      {/* The units every measurement is written in, on every screen: decision 033. */}
      <Section plain title={m.units_title()}>
        {MEASURES.map(({ measure, label }) => (
          <UnitLine
            key={measure}
            measure={measure}
            label={label()}
            units={units}
            onSave={saveUnits}
          />
        ))}
      </Section>

      {signedIn ? (
        <Section plain title={m.alerts_title()}>
          <Row
            title={m.command_alerts_settings()}
            description={m.account_alerts_hint()}
            onPress={go("/account/alerts")}
          />
        </Section>
      ) : null}

      <Section plain title={m.account_display()}>
        <SettingLine label={m.account_theme()}>
          <Segmented
            label={m.account_theme()}
            options={THEME_CHOICES.map((value) => ({ value, label: THEME_WORDS[value]() }))}
            value={choice}
            onChange={choose}
          />
        </SettingLine>
        {/* The colors of the week's table in a panel: Windguru's, which the app starts with, or
            its own. */}
        <SettingLine label={m.account_palette()}>
          <Segmented
            label={m.account_palette()}
            options={PALETTES.map((value) => ({
              value,
              label: value === "windguru" ? "Windguru" : APP_NAME,
            }))}
            value={palette}
            onChange={setPalette}
          />
        </SettingLine>
        {/* How much of the forecast a panel shows: in words, the details, or everything.
            Decision 061. */}
        <SettingLine label={m.account_density()}>
          <Segmented
            label={m.account_density()}
            options={DENSITIES.map((value) => ({ value, label: densityName(value) }))}
            value={density}
            onChange={saveDensity}
          />
        </SettingLine>
        {/* The app starts again in the language chosen, on this tab (decision 069). */}
        <SettingLine label={m.account_language()}>
          <Segmented
            label={m.account_language()}
            options={LOCALES.map((value) => ({ value, label: LANGUAGES[value] }))}
            value={getLocale()}
            onChange={restartInLanguage}
          />
        </SettingLine>
      </Section>

      <AgentsSection />

      {/* The pages beside the app, in the browser the system opens over it. */}
      <Section plain title={m.account_about({ app: APP_NAME })}>
        <Row
          title={m.account_about_home({ app: APP_NAME })}
          description={m.account_about_home_hint()}
          onPress={page("home")}
        />
        <Row title={m.learn_footer()} onPress={page("learn")} />
        <Row title={m.page_sources()} onPress={page("sources")} />
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.m, rowGap: space.xs }}
        >
          <PageLink label={m.terms_title()} onPress={page("terms")} />
          <PageLink label={m.privacy_title()} onPress={page("privacy")} />
          <PageLink label={m.legal_title()} onPress={page("legal")} />
        </View>
      </Section>

      <AnalyticsSection />

      {signedIn ? (
        <Button
          variant="outline"
          icon={LogOutIcon}
          loading={isLeaving}
          onPress={() => void leave()}
          style={{ alignSelf: "flex-start" }}
        >
          {m.auth_sign_out()}
        </Button>
      ) : null}

      {/* Last of all, apart from the rest: the step that deletes the account says what goes
          before it asks. */}
      {signedIn ? (
        <Section plain>
          <Row
            title={m.delete_account_title()}
            description={m.delete_account_hint()}
            destructive
            onPress={go("/account/delete")}
          />
        </Section>
      ) : null}

      {/* The build a phone runs, which a store's build has no other place to say. */}
      <Text size="s" tone="muted">
        {`${m.native_version()} ${version}`}
      </Text>
    </ScrollView>
  );
}
