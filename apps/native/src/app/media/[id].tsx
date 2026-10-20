import { router, useLocalSearchParams } from "expo-router";
import { Spinner } from "heroui-native";
import { View } from "react-native";
import { ScopedTheme } from "uniwind";

import { MediaViewer } from "@/components/media/media-viewer";
import { useBreakReports } from "@/components/reports/use-reports";
import { useSessionMedia } from "@/components/sessions/use-sessions";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { m } from "@/paraglide/messages";
import { dark } from "@/theme/tokens";

type Params = {
  id: string;
  // Whose photos and videos are gone through: a session's, or a report's at a break.
  session?: string;
  report?: string;
  break?: string;
};

/**
 * A photo or a video over the whole screen, among those of its session, `?session=<id>`, or of its
 * report, `?break=<id>&report=<id>`: decisions 066 and 067. What it shows is read from what the
 * screen it was opened from asked, and asked again when it is opened by itself. It is dark
 * whatever the theme, and so is what it says while it waits or once it could not be had.
 */
export default function MediaScreen() {
  const params = useLocalSearchParams<Params>();
  const session = useSessionMedia(params.session);
  const reports = useBreakReports(params.report ? params.break : undefined);
  const report = reports.data?.reports.find((one) => one.id === params.report);
  const items = params.session ? session.data : report?.media;
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  // What it was opened on is gone, or could not be asked: a session deleted, a report taken away.
  const asked = params.session ? session : reports;
  const isGone = asked.isError || (!params.session && reports.data !== undefined && !report);

  if (items) {
    return (
      <MediaViewer
        items={items}
        initialId={params.id}
        label={params.session ? m.media_viewer_title() : m.report_viewer_title()}
        onClose={close}
      />
    );
  }
  return (
    <ScopedTheme theme="dark">
      <View
        accessible={!isGone}
        accessibilityLabel={isGone ? undefined : m.native_loading()}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: dark["neutral-1"],
        }}
      >
        {isGone ? (
          <>
            <ErrorState
              title={params.session ? m.session_not_found() : m.reports_load_failed()}
              onRetry={asked.isError ? () => void asked.refetch() : undefined}
              retrying={asked.isFetching}
            />
            <Button variant="ghost" onPress={close}>
              {m.media_close()}
            </Button>
          </>
        ) : (
          <Spinner color={dark["neutral-10"]} />
        )}
      </View>
    </ScopedTheme>
  );
}
