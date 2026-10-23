import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { UsernameForm } from "@/components/account/username-form";
import { AccountPrompt } from "@/components/auth/account-prompt";
import { ReportForm } from "@/components/reports/report-form";
import { FormScroll } from "@/components/ui/form";
import { PanelHeader, SheetRoot } from "@/components/ui/sheet";
import { Loading, SkeletonText } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/** Leaves the sheet: back to what opened it, or to the map when nothing is under it. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/**
 * Reports the waves at a break, `?break=<id>`, in the web drawer's sheet, `ReportSheet`: its
 * photos and videos, sent as a session's are, how big the waves look and a few words, the phone's
 * position read as it is sent. The break's name stands under the title from the start, from
 * `?name=` or from the break the place's sheet already read. An account with no username chooses
 * one first, since a report is read under it, and a visitor is asked for an account, as the
 * web's panel asks. Decisions 066, 067 and 078.
 */
export default function NewReport() {
  const params = useLocalSearchParams<{ break?: string; name?: string }>();
  const { colors, space } = useTheme();
  const { signedIn, pending, username } = useAccount();
  // A username kept here, before the session the sign-in library holds is read again.
  const [isNamed, setIsNamed] = useState(false);
  const breakId = params.break;
  const found = useQuery(
    orpc.v1.breaks.get.queryOptions({
      input: { id: breakId ?? "" },
      enabled: breakId !== undefined,
      retry: false,
    }),
  );
  // A line pulses in the name's place while the break is read, which the place's sheet has
  // usually read already.
  const name = params.name ?? found.data?.name ?? (found.isPending ? null : undefined);
  const ground = { flex: 1, backgroundColor: colors["neutral-1"] };

  // An address that names no break has nothing to report on: the sheet leaves as it opens.
  useEffect(() => {
    if (!breakId) leave();
  }, [breakId]);
  if (!breakId) return <View style={ground} />;

  if (signedIn && (username || isNamed)) {
    return (
      <SheetRoot style={ground}>
        <ReportForm key={breakId} breakId={breakId} name={name} />
      </SheetRoot>
    );
  }
  return (
    <SheetRoot style={ground}>
      <PanelHeader title={m.report_new()} description={name} onClose={leave} />
      <FormScroll
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.m, paddingBottom: space.xl }}
      >
        {pending ? (
          // While the account is read, the place of the lines that come.
          <Loading>
            <SkeletonText lines={2} size="s" />
          </Loading>
        ) : signedIn ? (
          <View style={{ gap: space.s }}>
            <Text size="s" tone="muted">
              {m.report_username_first()}
            </Text>
            <UsernameForm current={null} onSaved={() => setIsNamed(true)} />
          </View>
        ) : (
          // Once signed in, the sign-in sheet goes back to this one, which then holds the form.
          <AccountPrompt text={m.report_sign_in_prompt()} />
        )}
      </FormScroll>
    </SheetRoot>
  );
}
