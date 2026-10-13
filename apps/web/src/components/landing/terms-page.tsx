import { APP_NAME } from "@repo/config/app";

import { m } from "@/paraglide/messages.js";

import { LandingHeader } from "./landing-header";

// The licence a spot is published under once an operator accepts it: decision 034. A list of
// words written in a guide goes under it too, and a text under the licence that goes with it
// for what a database holds: decision 041.
const LICENSE_URL = "https://opendatacommons.org/licenses/odbl/1-0/";
const CONTENTS_LICENSE_URL = "https://opendatacommons.org/licenses/dbcl/1-0/";

const linked = "focus-ring rounded-xs underline underline-offset-2";

/**
 * What an account agrees to: what becomes of a spot it asks to make public, and of what it
 * writes in the guide of a public spot.
 */
export function TermsPage({ apiDocsUrl }: { apiDocsUrl: string }) {
  return (
    <div className="flex min-h-svh flex-col">
      <LandingHeader apiDocsUrl={apiDocsUrl} />

      <main className="mx-auto grid w-full max-w-3xl flex-1 content-start gap-xl px-m py-xl">
        <h1 className="text-xl font-bold sm:text-xxl">{m.terms_title()}</h1>

        <section className="grid gap-s">
          <h2 className="text-l font-medium">{m.terms_private_title()}</h2>
          <p className="text-neutral-7">{m.terms_private_text()}</p>
        </section>

        <section className="grid gap-s">
          <h2 className="text-l font-medium">{m.terms_public_title()}</h2>
          <p className="text-neutral-7">{m.terms_public_text({ name: APP_NAME })}</p>
          <p className="text-neutral-7">{m.terms_public_rights()}</p>
          <p>
            <a
              href={LICENSE_URL}
              target="_blank"
              rel="noreferrer"
              className="focus-ring rounded-xs underline underline-offset-2"
            >
              {m.terms_public_license()}
            </a>
          </p>
        </section>

        <section className="grid gap-s">
          <h2 className="text-l font-medium">{m.terms_guide_title()}</h2>
          <p className="text-neutral-7">{m.terms_guide_text({ name: APP_NAME })}</p>
          <p className="text-neutral-7">{m.terms_guide_rights()}</p>
          <p className="flex flex-wrap gap-x-m gap-y-xs">
            <a href={LICENSE_URL} target="_blank" rel="noreferrer" className={linked}>
              {m.terms_public_license()}
            </a>
            <a href={CONTENTS_LICENSE_URL} target="_blank" rel="noreferrer" className={linked}>
              {m.terms_guide_license()}
            </a>
          </p>
        </section>

        <section className="grid gap-s">
          <h2 className="text-l font-medium">{m.terms_shared_title()}</h2>
          <p className="text-neutral-7">{m.terms_shared_text()}</p>
        </section>
        <section className="grid gap-s">
          <h2 className="text-l font-medium">{m.analytics_title()}</h2>
          <p className="text-neutral-7">{m.analytics_terms()}</p>
        </section>
      </main>
    </div>
  );
}
