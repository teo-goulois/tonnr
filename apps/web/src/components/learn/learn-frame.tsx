import type { ReactNode } from "react";

import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { UnitsFromAccount } from "@/components/shared/units-account";
import { Crumbs } from "@/components/spot-pages/spot-frame";
import { LEARN_ROOT } from "@/lib/learn";
import type { Crumb } from "@/lib/spot-pages";
import { m } from "@/paraglide/messages.js";

// The frame of the guides and of the glossary: the landing's bar and footer around one column,
// as the pages of the surf breaks are drawn, with the path over the page. The units this browser
// or the account chose are put in force, since a demo writes a figure in them. Decision 060.

/** The root of the path over a page of the guides. */
export const learnRoot = (): Crumb => ({ name: m.learn_nav(), page: LEARN_ROOT });

export function LearnFrame({
  crumbs,
  title,
  lead,
  children,
}: {
  crumbs: Crumb[];
  title: ReactNode;
  lead: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <LandingHeader />
      <UnitsFromAccount />
      <main className="mx-auto grid w-full max-w-3xl flex-1 content-start gap-xl px-m py-xl">
        <header className="grid gap-s">
          <Crumbs crumbs={crumbs} label={m.learn_path_label()} />
          <h1 className="text-xl font-bold text-balance sm:text-xxl">{title}</h1>
          <p className="max-w-2xl text-l text-neutral-7 text-pretty">{lead}</p>
        </header>
        {children}
      </main>
      <LandingFooter />
    </div>
  );
}
