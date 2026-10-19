import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { nameProcedures } from "../procedures";
import { accountRouter } from "./account";
import { activityRouter } from "./activity";
import { accountsRouter } from "./accounts";
import { actionsRouter } from "./actions";
import { agentsRouter } from "./agents";
import { alertsRouter } from "./alerts";
import { breaksRouter } from "./breaks";
import { candidatesRouter } from "./candidates";
import { catalogueRouter } from "./catalogue";
import { clientsRouter } from "./clients";
import { consoleRouter } from "./console";
import { contributionsRouter } from "./contributions";
import { developersRouter } from "./developers";
import { errorReportsRouter } from "./error-reports";
import { forecastsRouter } from "./forecasts";
import { friendsRouter } from "./friends";
import { guidesRouter } from "./guides";
import { ideasRouter } from "./ideas";
import { instanceRouter } from "./instance";
import { keysRouter } from "./keys";
import { listsRouter } from "./lists";
import { mapsRouter } from "./maps";
import { mediaRouter } from "./media";
import { notificationsRouter } from "./notifications";
import { pagesRouter } from "./pages";
import { placesRouter } from "./places";
import { preferencesRouter, shortcutsRouter } from "./preferences";
import { profileRouter } from "./profile";
import { privateCatalogueRouter } from "./private-catalogue";
import { publicationsRouter } from "./publications";
import { reviewsRouter } from "./reviews";
import { pushRouter } from "./push";
import { reportNoticesRouter } from "./report-notices";
import { reportsRouter } from "./reports";
import { sessionsRouter } from "./sessions";
import { sharedRouter } from "./shared";
import { spotsRouter } from "./spots";
import { stationsRouter } from "./stations";
import { tidesRouter } from "./tides";
import { usageRouter } from "./usage";
import { visitorsRouter } from "./visitors";

// The API, version 1. Once released it only grows: a breaking change goes in a new version.
// Every procedure asks who calls: decision 019 says which take a key and which a session,
// decision 020 which take the admin's site as well, decision 027 which take a member of a
// developer account, and decision 039 which answer a visitor of the web app. Decisions 045 and
// 047 say which an agent calls as a tool of the MCP server, decision 049 how an operator
// keeps the catalogue of breaks, and decision 057 what the public pages of the web app read, and
// decision 063 what an account says of itself as a surfer, decision 066 the photos and the
// videos of its sessions, decision 067 the reports of the waves at a break, decision 068 what
// an account is told of them, and decision 069 what the apps read of an account's preferences
// and which builds of the apps for phones the instance answers.
export const v1Router = {
  account: accountRouter,
  activity: activityRouter,
  accounts: accountsRouter,
  actions: actionsRouter,
  agents: agentsRouter,
  alerts: alertsRouter,
  breaks: breaksRouter,
  candidates: candidatesRouter,
  catalogue: catalogueRouter,
  clients: clientsRouter,
  console: consoleRouter,
  contributions: contributionsRouter,
  developers: developersRouter,
  errorReports: errorReportsRouter,
  forecasts: forecastsRouter,
  friends: friendsRouter,
  guides: guidesRouter,
  ideas: ideasRouter,
  instance: instanceRouter,
  keys: keysRouter,
  lists: listsRouter,
  maps: mapsRouter,
  media: mediaRouter,
  notifications: notificationsRouter,
  pages: pagesRouter,
  places: placesRouter,
  preferences: preferencesRouter,
  profile: profileRouter,
  privateCatalogue: privateCatalogueRouter,
  publications: publicationsRouter,
  push: pushRouter,
  reportNotices: reportNoticesRouter,
  reports: reportsRouter,
  reviews: reviewsRouter,
  sessions: sessionsRouter,
  shared: sharedRouter,
  spots: spotsRouter,
  stations: stationsRouter,
  tides: tidesRouter,
  usage: usageRouter,
  visitors: visitorsRouter,
};

export const appRouter = {
  v1: v1Router,
  // The keyboard's shortcuts, which the web app alone keeps: decision 069.
  preferences: shortcutsRouter,
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
};
// A call is counted under its procedure's name.
nameProcedures(appRouter);

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
