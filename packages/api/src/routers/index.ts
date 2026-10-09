import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { accountRouter } from "./account";
import { breaksRouter } from "./breaks";
import { forecastsRouter } from "./forecasts";
import { keysRouter } from "./keys";
import { listsRouter } from "./lists";
import { mapsRouter } from "./maps";
import { notificationsRouter } from "./notifications";
import { preferencesRouter } from "./preferences";
import { privateBreaksRouter } from "./private-breaks";
import { spotsRouter } from "./spots";
import { stationsRouter } from "./stations";
import { tidesRouter } from "./tides";

// The API, version 1. Once released it only grows: a breaking change goes in a new version.
// Every procedure asks who calls: decision 019 says which take a key and which a session.
export const v1Router = {
  account: accountRouter,
  breaks: breaksRouter,
  forecasts: forecastsRouter,
  keys: keysRouter,
  lists: listsRouter,
  maps: mapsRouter,
  notifications: notificationsRouter,
  privateBreaks: privateBreaksRouter,
  spots: spotsRouter,
  stations: stationsRouter,
  tides: tidesRouter,
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
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
