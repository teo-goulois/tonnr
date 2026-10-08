import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { forecastsRouter } from "./forecasts";
import { stationsRouter } from "./stations";
import { tidesRouter } from "./tides";

// The public API, version 1. Once released it only grows: a breaking change goes in a new version.
export const v1Router = {
  forecasts: forecastsRouter,
  stations: stationsRouter,
  tides: tidesRouter,
};

export const appRouter = {
  v1: v1Router,
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
