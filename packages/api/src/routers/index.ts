import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { breaksRouter } from "./breaks";
import { forecastsRouter } from "./forecasts";
import { notificationsRouter } from "./notifications";
import { preferencesRouter } from "./preferences";
import { spotsRouter } from "./spots";
import { stationsRouter } from "./stations";
import { tidesRouter } from "./tides";

// The public API, version 1. Once released it only grows: a breaking change goes in a new version.
export const v1Router = {
  breaks: breaksRouter,
  forecasts: forecastsRouter,
  notifications: notificationsRouter,
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
