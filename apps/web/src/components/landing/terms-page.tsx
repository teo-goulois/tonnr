import { Link } from "@tanstack/react-router";
import { APP_NAME } from "@repo/config/app";

import { PUBLISHER } from "@/lib/legal";
import { m } from "@/paraglide/messages.js";

import { LegalPage, LegalSection, linked } from "./legal-page";

// The licence a spot is published under once an operator accepts it: decision 034. A list of
// words written in a guide goes under it too, and a text under the licence that goes with it
// for what a database holds: decision 041.
const LICENSE_URL = "https://opendatacommons.org/licenses/odbl/1-0/";
const CONTENTS_LICENSE_URL = "https://opendatacommons.org/licenses/dbcl/1-0/";

/**
 * What whoever uses the instance agrees to: what the service is and is not, how an account
 * behaves, and what becomes of a spot it asks to make public, of what it writes in the guide of
 * a public spot, and of a list it shares.
 */
export function TermsPage() {
  const who = { name: APP_NAME, publisher: PUBLISHER.name, email: PUBLISHER.email };

  return (
    <LegalPage title={m.terms_title()}>
      <LegalSection title={m.terms_about_title()}>
        <p>{m.terms_about_text(who)}</p>
        <p className="flex flex-wrap gap-x-m gap-y-xs">
          <Link to="/privacy" className={linked}>
            {m.privacy_title()}
          </Link>
          <Link to="/legal" className={linked}>
            {m.legal_title()}
          </Link>
        </p>
      </LegalSection>

      <LegalSection title={m.terms_figures_title()}>
        <p>{m.terms_figures_text(who)}</p>
        <p>
          {m.terms_figures_sources()}{" "}
          <Link to="/sources" className={linked}>
            {m.landing_nav_sources()}
          </Link>
        </p>
      </LegalSection>

      <LegalSection title={m.terms_account_title()}>
        <p>{m.terms_account_text()}</p>
      </LegalSection>

      <LegalSection title={m.terms_use_title()}>
        <p>{m.terms_use_text(who)}</p>
        <p>{m.terms_use_suspension(who)}</p>
      </LegalSection>

      <LegalSection title={m.terms_private_title()}>
        <p>{m.terms_private_text()}</p>
      </LegalSection>

      <LegalSection title={m.terms_public_title()}>
        <p>{m.terms_public_text({ name: APP_NAME })}</p>
        <p>{m.terms_public_rights()}</p>
        <p>
          <a href={LICENSE_URL} target="_blank" rel="noreferrer" className={linked}>
            {m.terms_public_license()}
          </a>
        </p>
      </LegalSection>

      <LegalSection title={m.terms_guide_title()}>
        <p>{m.terms_guide_text({ name: APP_NAME })}</p>
        <p>{m.terms_guide_rights()}</p>
        <p className="flex flex-wrap gap-x-m gap-y-xs">
          <a href={LICENSE_URL} target="_blank" rel="noreferrer" className={linked}>
            {m.terms_public_license()}
          </a>
          <a href={CONTENTS_LICENSE_URL} target="_blank" rel="noreferrer" className={linked}>
            {m.terms_guide_license()}
          </a>
        </p>
      </LegalSection>

      <LegalSection title={m.terms_shared_title()}>
        <p>{m.terms_shared_text()}</p>
      </LegalSection>

      <LegalSection title={m.terms_service_title()}>
        <p>{m.terms_service_text(who)}</p>
        <p>{m.terms_service_leave()}</p>
      </LegalSection>

      <LegalSection title={m.terms_changes_title()}>
        <p>{m.terms_changes_text(who)}</p>
        <p>{m.terms_changes_law(who)}</p>
      </LegalSection>
    </LegalPage>
  );
}
