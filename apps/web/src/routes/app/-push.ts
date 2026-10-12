import { thisBrowser } from "@/lib/push";
import { pushApi } from "@/lib/push-here";
import { type PushAsked, usePush as usePushOf } from "@/lib/use-push";

/** Push on this device, in this browser and with the API: `usePush` of `lib/use-push.ts`. */
export const usePush = (asked: PushAsked) => usePushOf(asked, thisBrowser, pushApi);
