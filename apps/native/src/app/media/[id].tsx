import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { MediaViewer } from "@/components/media/media-viewer";
import { useBreakReports } from "@/components/reports/use-reports";
import { useSessionMedia } from "@/components/sessions/use-sessions";
import { Spinner } from "heroui-native";
import { m } from "@/paraglide/messages";

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
 * screen it was opened from asked, and asked again when it is opened by itself.
 */
export default function MediaScreen() {
  const params = useLocalSearchParams<Params>();
  const session = useSessionMedia(params.session);
  const reports = useBreakReports(params.report ? params.break : undefined);
  const report = reports.data?.reports.find((one) => one.id === params.report);
  const items = params.session ? session.data : report?.media;
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!items) {
    return (
      <View
        accessible
        accessibilityLabel={m.native_loading()}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}
      >
        <Spinner color="#ffffff" />
      </View>
    );
  }
  return (
    <MediaViewer
      items={items}
      initialId={params.id}
      label={params.session ? m.media_viewer_title() : m.report_viewer_title()}
      onClose={close}
    />
  );
}
