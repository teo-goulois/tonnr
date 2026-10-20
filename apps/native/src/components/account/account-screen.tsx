import { APP_NAME, REPOSITORY_URL } from "@repo/config/app";
import {
  AtSignFillIcon,
  BellIcon,
  BookOpenIcon,
  ChartAreaFillDuoIcon,
  EyeSlashFillDuoIcon,
  FileTextIcon,
  GithubIcon,
  GlobalIcon,
  Link2Icon,
  MapPinIcon,
  InfoIcon,
  LayersIcon,
  LockIcon,
  LogbookIcon,
  LogOutIcon,
  MailIcon,
  MoonIcon,
  PaintbrushIcon,
  PenIcon,
  PeopleFillDuoIcon,
  SunIcon,
  SurferFillIcon,
  TrashIcon,
  WaterLevelFillDuoIcon,
  WaveIcon,
  WindIcon,
} from "@repo/ui/icon";
import { useQuery } from "@tanstack/react-query";
import * as Application from "expo-application";
import { type Href, router } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";

import { useProfile } from "@/components/profile/use-profile";
import { profileWords } from "@/components/profile/profile-words";
import { confirmDestructive } from "@/components/saved/confirm";
import { feel } from "@/components/ui/haptics";
import { Row, Section } from "@/components/ui/list";
import { useTheme } from "@/lib/theme";
import { type Units, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";

import { AccountHeader } from "./account-header";
import { AgentsSection } from "./agents";
import { densityName, useDensity, usePalette } from "./display";
import { useSignOut } from "./leave";
import { useOpenPage } from "./open-page";
import { rankName } from "./rank-badge";
import {
  blocksWords,
  friendsWords,
  LANGUAGES,
  MEASURES,
  points,
  THEME_WORDS,
} from "./settings-words";
import { unitName } from "./unit-name";
import { setConsent, setErrorReports, useConsent, useErrorReports } from "./use-consent";
import { useOwnAccount, useSendVerification } from "./use-own-account";

const MEASURE_ICONS = {
  windSpeed: WindIcon,
  height: WaveIcon,
  temperature: SunIcon,
  distance: MapPinIcon,
  precipitation: WaterLevelFillDuoIcon,
} satisfies Record<keyof Units, unknown>;

const go = (href: Href) => () => router.push(href);

/**
 * The account's tab, as a phone's settings are: who is signed in, then what the account is in
 * the guides and the log, how it is told of its alerts, how the app draws and writes, its
 * language, the assistants it connected, its privacy, what the app is, and at the end what signs
 * out and what deletes it. A visitor has the settings the phone keeps and the two ways in. The
 * web's `AccountPanel` says the same: decisions 040, 041, 044, 047, 061, 063 and 071.
 */
export function AccountScreen() {
  const { colors, space, choice } = useTheme();
  const { openPage, openAddress } = useOpenPage();
  const own = useOwnAccount();
  const check = useSendVerification();
  const signOut = useSignOut();
  const units = useUnits();
  const density = useDensity();
  const palette = usePalette();
  const consent = useConsent();
  const errorReports = useErrorReports();
  const signedIn = own.signedIn === true;
  const account = own.account;

  const profiling = useProfile();
  const standing = useQuery(
    orpc.v1.contributions.mine.queryOptions({ enabled: signedIn, retry: false }),
  );
  const friends = useQuery(orpc.v1.friends.list.queryOptions({ enabled: signedIn, retry: false }));
  const blocks = useQuery(orpc.v1.blocks.list.queryOptions({ enabled: signedIn, retry: false }));

  const refreshing = own.isRefetching || standing.isRefetching || friends.isRefetching;
  const refresh = () => {
    void own.refetch();
    void standing.refetch();
    void friends.refetch();
    void blocks.refetch();
    profiling.retry();
  };

  async function askSignOut() {
    const sure = await confirmDestructive({
      title: m.native_sign_out_title(),
      ...(account && { message: account.email }),
      confirm: m.auth_sign_out(),
    });
    if (!sure) return;
    await signOut();
    feel("done");
    router.replace("/");
  }

  const score = standing.data?.score ?? 0;
  const rank = standing.data?.rank ?? null;
  const version = `${Application.nativeApplicationVersion ?? "0.0.0"} (${Application.nativeBuildVersion ?? "0"})`;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
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
      <AccountHeader
        isPending={own.isPending}
        account={
          signedIn && account
            ? {
                username: account.username,
                email: account.email,
                rank,
                checked: account.checksAddresses ? account.emailVerified : undefined,
              }
            : undefined
        }
        onSendCheck={check.send}
        isSendingCheck={check.isSending}
      />

      {signedIn ? (
        <Section title={m.native_account_you()}>
          <Row
            icon={AtSignFillIcon}
            title={m.auth_username()}
            value={account?.username ? `@${account.username}` : m.username_choose()}
            onPress={go("/account/username")}
          />
          <Row
            icon={SurferFillIcon}
            title={m.profile_title()}
            description={profileWords(profiling.profile) ?? m.profile_hint()}
            onPress={go("/account/profile")}
          />
          <Row
            icon={LogbookIcon}
            title={m.sessions_title()}
            description={m.sessions_hint()}
            onPress={go("/account/logbook")}
          />
          <Row
            icon={PenIcon}
            title={m.contributions_title()}
            description={
              score > 0
                ? [points(score), rank && rankName(rank)].filter(Boolean).join(" · ")
                : m.contributions_hint()
            }
            onPress={go("/account/contributions")}
          />
          <Row
            icon={PeopleFillDuoIcon}
            title={m.friends_title()}
            description={friendsWords(friends.data?.friends.length)}
            onPress={go("/account/friends")}
          />
        </Section>
      ) : null}

      {signedIn ? (
        <Section title={m.native_account_notifications()}>
          <Row
            icon={BellIcon}
            title={m.command_alerts_settings()}
            description={m.account_alerts_hint()}
            onPress={go("/account/alerts")}
          />
        </Section>
      ) : null}

      {/* The units every measurement is written in, on every screen: decision 033. */}
      <Section title={m.units_title()}>
        {MEASURES.map(({ measure, label }) => (
          <Row
            key={measure}
            icon={MEASURE_ICONS[measure]}
            title={label()}
            value={unitName(measure, units[measure])}
            onPress={go({ pathname: "/account/unit", params: { measure } })}
          />
        ))}
      </Section>

      <Section title={m.account_display()}>
        <Row
          icon={MoonIcon}
          title={m.account_theme()}
          value={THEME_WORDS[choice]()}
          onPress={go("/account/theme")}
        />
        <Row
          icon={LayersIcon}
          title={m.account_density()}
          value={densityName(density)}
          onPress={go("/account/density")}
        />
        <Row
          icon={PaintbrushIcon}
          title={m.account_palette()}
          value={palette === "windguru" ? "Windguru" : APP_NAME}
          onPress={go("/account/palette")}
        />
      </Section>

      <Section>
        <Row
          icon={GlobalIcon}
          title={m.account_language()}
          value={LANGUAGES[getLocale()]}
          onPress={go("/account/language")}
        />
      </Section>

      <AgentsSection />

      {/* Whether the app may tell what is used and what breaks: off until said yes. Decision 044. */}
      <Section title={m.native_account_privacy()} footer={m.analytics_description()}>
        <Row
          icon={ChartAreaFillDuoIcon}
          title={m.analytics_title()}
          toggle={{
            value: consent === "granted",
            onChange: (on) => setConsent(on ? "granted" : "denied"),
          }}
        />
        {consent === "granted" ? (
          <Row
            icon={InfoIcon}
            title={m.analytics_errors()}
            description={m.analytics_errors_description()}
            toggle={{ value: errorReports, onChange: setErrorReports }}
          />
        ) : null}
        <Row
          icon={LockIcon}
          title={m.analytics_details()}
          onPress={() => void openPage("privacy")}
        />
        {signedIn ? (
          <Row
            icon={EyeSlashFillDuoIcon}
            title={m.blocks_title()}
            description={blocksWords(blocks.data?.blocks.length)}
            onPress={go("/account/blocked")}
          />
        ) : null}
      </Section>

      {/* The pages beside the app, in the browser the system opens over it. */}
      <Section title={m.account_about({ app: APP_NAME })}>
        <Row
          icon={InfoIcon}
          title={m.account_about_home({ app: APP_NAME })}
          description={m.account_about_home_hint()}
          onPress={() => void openPage("home")}
        />
        <Row icon={BookOpenIcon} title={m.learn_footer()} onPress={() => void openPage("learn")} />
        <Row icon={Link2Icon} title={m.page_sources()} onPress={() => void openPage("sources")} />
        <Row icon={FileTextIcon} title={m.terms_title()} onPress={() => void openPage("terms")} />
        <Row icon={LockIcon} title={m.privacy_title()} onPress={() => void openPage("privacy")} />
        <Row icon={FileTextIcon} title={m.legal_title()} onPress={() => void openPage("legal")} />
        <Row icon={MailIcon} title={m.contact_nav()} onPress={() => void openPage("contact")} />
        <Row
          icon={GithubIcon}
          title={m.native_source_code()}
          description={m.landing_footer_license()}
          onPress={() => void openAddress(REPOSITORY_URL)}
        />
        <Row title={m.native_version()} value={version} />
      </Section>

      {signedIn ? (
        <View style={{ gap: space.l }}>
          <Section>
            <Row
              icon={LogOutIcon}
              title={m.auth_sign_out()}
              destructive
              chevron={false}
              onPress={() => void askSignOut()}
            />
          </Section>
          {/* Last of all, apart: the step that deletes the account says what goes first. */}
          <Section>
            <Row
              icon={TrashIcon}
              title={m.delete_account_title()}
              description={m.delete_account_hint()}
              destructive
              onPress={go("/account/delete")}
            />
          </Section>
        </View>
      ) : null}
    </ScrollView>
  );
}
