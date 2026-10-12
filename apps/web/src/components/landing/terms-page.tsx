import { APP_NAME } from "@repo/config/app";

import { m } from "@/paraglide/messages.js";

import { LandingHeader } from "./landing-header";

// The licence a spot is published under once an operator accepts it: decision 034.
const LICENSE_URL = "https://opendatacommons.org/licenses/odbl/1-0/";

/** What an account agrees to: so far, what becomes of a spot it asks to make public. */
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
      </main>
    </div>
  );
}
