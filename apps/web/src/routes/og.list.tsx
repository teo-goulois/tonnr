import { createFileRoute, notFound } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";
import { buttonVariants } from "@repo/ui/components/ui/button";

import { SHARED_PICTURE } from "@/lib/public-pages";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

// The picture a shared list is shown with when its link is sent, at the size its sites ask for,
// which `scripts/landing-shots.mjs` takes in each language: what the link opens, over the landing's
// map. The page never ships: a production build answers 404.
export const Route = createFileRoute("/og/list")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: ListPicture,
});

function ListPicture() {
  return (
    <div
      className="relative isolate overflow-hidden bg-neutral-1"
      style={{ width: SHARED_PICTURE.width, height: SHARED_PICTURE.height }}
    >
      <img
        src={`/landing/hero-map-light-${getLocale()}.webp`}
        alt=""
        className="absolute inset-y-0 left-[18%] -z-10 h-full w-[100%] max-w-none object-cover object-[45%_45%]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--neutral-1)_0%,var(--neutral-1)_44%,color-mix(in_oklab,var(--neutral-1)_55%,transparent)_58%,transparent_76%)]"
      />
      <div className="flex h-full max-w-[40rem] flex-col justify-between p-[4.5rem]">
        <div className="flex items-center gap-xs text-[1.75rem] font-bold tracking-[-0.02em]">
          <img src="/favicon.svg" alt="" width={40} height={40} className="size-10" />
          {APP_NAME}
        </div>
        <div className="grid justify-items-start gap-l">
          <h1 className="text-[4rem] leading-[1.04] font-bold tracking-[-0.04em] text-balance text-neutral-9">
            {m.list_picture_title()}
          </h1>
          <p className="text-[1.6rem] leading-snug text-pretty text-neutral-7">
            {m.list_picture_text()}
          </p>
          <span
            className={buttonVariants({
              size: "lg",
              className: "pointer-events-none h-14 px-l text-[1.4rem]",
            })}
          >
            {m.shared_open()}
          </span>
        </div>
      </div>
    </div>
  );
}
