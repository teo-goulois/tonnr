// Alchemy validates deployment inputs with Varlock; Workers use native env bindings.
import type { PublicCoercedEnvSchema } from "./env";

export const ENV = {
  VITE_SERVER_URL: import.meta.env.VITE_SERVER_URL!,
  VITE_POSTHOG_PROJECT_TOKEN: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN,
  VITE_POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST,
  VITE_POSTHOG_ENVIRONMENT: import.meta.env.VITE_POSTHOG_ENVIRONMENT,
} satisfies Pick<
  PublicCoercedEnvSchema,
  | "VITE_SERVER_URL"
  | "VITE_POSTHOG_PROJECT_TOKEN"
  | "VITE_POSTHOG_HOST"
  | "VITE_POSTHOG_ENVIRONMENT"
>;
