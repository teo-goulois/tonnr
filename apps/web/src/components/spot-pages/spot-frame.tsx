import { ChevronRightIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { linked } from "@/components/landing/legal-page";
import { SPOTS_ROOT } from "@/lib/public-pages";
import type { Crumb } from "@/lib/spot-pages";
import { m } from "@/paraglide/messages.js";
import { localizeHref } from "@/paraglide/runtime.js";

// The frame of the public pages of the surf breaks and their hubs: the landing's bar and footer
// around one column, as the pages beside the landing are drawn. Decision 057.

/**
 * The address of a page of the spots in the reader's language, for a plain link: a page is
 * served from the Worker's cache when it is asked for as a document, where the router would ask
 * the API again from the browser.
 */
export function spotHref(page: string) {
  return localizeHref(page);
}

/** A link from one page of the spots to another. */
export function SpotLink({
  page,
  className,
  children,
}: {
  page: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={spotHref(page)} className={cn("focus-ring rounded-xs", className)}>
      {children}
    </a>
  );
}

export function SpotFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <LandingHeader />
      <main className="mx-auto grid w-full max-w-3xl flex-1 content-start gap-xl px-m py-xl">
        {children}
      </main>
      <LandingFooter />
    </div>
  );
}

/** A part of a page: its title, then what it holds. */
export function SpotSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-s">
      <div className="flex flex-wrap items-baseline justify-between gap-x-m gap-y-xxs">
        <h2 className="text-l font-medium">{title}</h2>
        {note && <span className="text-s text-neutral-7">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * The path over a page, from the widest place to the nearest: each a link to its hub where one
 * exists, and a name alone where none does.
 */
export function Crumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label={m.page_places_label()}>
      <ol className="flex flex-wrap items-center gap-x-xxs gap-y-xxs text-s text-neutral-7">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.name}-${index}`} className="flex items-center gap-xxs">
            {index > 0 && <ChevronRightIcon aria-hidden className="size-3 shrink-0" />}
            {crumb.page ? (
              <SpotLink page={crumb.page} className="hover:text-neutral-10">
                {crumb.name}
              </SpotLink>
            ) : (
              <span>{crumb.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The page at an address that has no spot: a deleted one, or one that never was. */
export function SpotNotFound() {
  return (
    <SpotFrame>
      <div className="grid gap-s">
        <h1 className="text-xl font-bold sm:text-xxl">{m.page_not_found_title()}</h1>
        <p className="text-neutral-7">{m.page_not_found_text()}</p>
        <p>
          <a href={spotHref(SPOTS_ROOT)} className={linked}>
            {m.page_all_spots()}
          </a>
        </p>
      </div>
    </SpotFrame>
  );
}

/** The page while the instance is closed to visitors: the Worker answers it with a 503. */
export function SpotClosed() {
  return (
    <SpotFrame>
      <div className="grid gap-s">
        <h1 className="text-xl font-bold sm:text-xxl">{m.page_closed_title()}</h1>
        <p className="text-neutral-7">{m.page_closed_text()}</p>
      </div>
    </SpotFrame>
  );
}
