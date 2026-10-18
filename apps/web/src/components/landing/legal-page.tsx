import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";

export const linked = "focus-ring rounded-xs underline underline-offset-2";

/** The date the three legal texts were last changed: change it with any of them. */
export const LEGAL_UPDATED = "2026-10-18";

/** A page of the three legal texts, terms, privacy and legal notice, each linking the others. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <LandingHeader />

      <main className="mx-auto grid w-full max-w-3xl flex-1 content-start gap-xl px-m py-xl">
        <div className="grid gap-xs">
          <h1 className="text-xl font-bold sm:text-xxl">{title}</h1>
          <p className="text-s text-neutral-7">
            {m.legal_updated({
              date: new Date(LEGAL_UPDATED).toLocaleDateString(getLocale(), {
                dateStyle: "long",
                timeZone: "UTC",
              }),
            })}
          </p>
        </div>
        {children}
        <nav aria-label={m.legal_nav()} className="flex flex-wrap gap-x-m gap-y-xs text-s">
          <Link to="/terms" className={linked}>
            {m.terms_title()}
          </Link>
          <Link to="/privacy" className={linked}>
            {m.privacy_title()}
          </Link>
          <Link to="/legal" className={linked}>
            {m.legal_title()}
          </Link>
        </nav>
      </main>

      <LandingFooter />
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-s">
      <h2 className="text-l font-medium">{title}</h2>
      <div className="grid gap-s text-neutral-7">{children}</div>
    </section>
  );
}
