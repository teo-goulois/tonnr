import { Link } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { BookmarkIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

import { formatHeight, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { AlertDemo, BuoysDemo, ModelsDemo, SecondaryDemo, ShadowDemo } from "./demos-advanced";
import { GuidePage } from "./guide-page";

// The advanced guide: what the figures are made of, and where they end, in an alert made of
// one's own sessions. Decision 060.
export function AdvancedGuide() {
  useUnits();
  const name = { name: APP_NAME };
  return (
    <GuidePage
      level="advanced"
      also={
        <Link
          to="/app"
          search={{ panel: "account", settings: "sessions" }}
          className={cn(buttonVariants({ variant: "secondary" }), "group/open")}
        >
          <BookmarkIcon data-slot="icon" aria-hidden />
          {m.sessions_title()}
        </Link>
      }
      lessons={[
        {
          id: "models",
          paragraphs: [m.learn_a_models_p1(name), m.learn_a_models_p2(), m.learn_a_models_p3()],
          demo: <ModelsDemo />,
          keep: m.learn_a_models_keep(),
        },
        {
          id: "buoys",
          paragraphs: [
            m.learn_a_buoys_p1(),
            m.learn_a_buoys_p2({ gap: formatHeight(0.3) }),
            m.learn_a_buoys_p3(name),
          ],
          demo: <BuoysDemo />,
          keep: m.learn_a_buoys_keep(),
        },
        {
          id: "secondary",
          paragraphs: [
            m.learn_a_secondary_p1(),
            m.learn_a_secondary_p2(),
            m.learn_a_secondary_p3(),
          ],
          demo: <SecondaryDemo />,
          keep: m.learn_a_secondary_keep(),
        },
        {
          id: "shadow",
          paragraphs: [m.learn_a_shadow_p1(), m.learn_a_shadow_p2(), m.learn_a_shadow_p3()],
          demo: <ShadowDemo />,
          keep: m.learn_a_shadow_keep(),
        },
        {
          id: "alert",
          paragraphs: [m.learn_a_alert_p1(name), m.learn_a_alert_p2(), m.learn_a_alert_p3()],
          demo: <AlertDemo />,
          keep: m.learn_a_alert_keep(),
        },
      ]}
    />
  );
}
