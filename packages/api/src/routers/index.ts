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
import { consoleRouter } from "./console";
import { contributionsRouter } from "./contributions";
import { developersRouter } from "./developers";
import { forecastsRouter } from "./forecasts";
import { friendsRouter } from "./friends";
import { guidesRouter } from "./guides";
import { instanceRouter } from "./instance";
import { keysRouter } from "./keys";
import { listsRouter } from "./lists";
import { mapsRouter } from "./maps";
import { notificationsRouter } from "./notifications";
import { placesRouter } from "./places";
import { preferencesRouter } from "./preferences";
import { publicationsRouter } from "./publications";
import { reviewsRouter } from "./reviews";
import { pushRouter } from "./push";
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
// 047 say which an agent calls as a tool of the MCP server, and decision 049 how an operator
// keeps the catalogue of breaks.
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
  console: consoleRouter,
  contributions: contributionsRouter,
  developers: developersRouter,
  forecasts: forecastsRouter,
  friends: friendsRouter,
  guides: guidesRouter,
  instance: instanceRouter,
  keys: keysRouter,
  lists: listsRouter,
  maps: mapsRouter,
  notifications: notificationsRouter,
  places: placesRouter,
  publications: publicationsRouter,
  push: pushRouter,
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
  preferences: preferencesRouter,
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
