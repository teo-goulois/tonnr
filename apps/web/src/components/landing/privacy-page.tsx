import { APP_NAME } from "@repo/config/app";

import { PUBLISHER, RECIPIENTS } from "@/lib/legal";
import { m } from "@/paraglide/messages.js";

import { LegalPage, LegalSection, linked } from "./legal-page";

const CNIL_URL = "https://www.cnil.fr/fr/plaintes";

function List({ items }: { items: string[] }) {
  return (
    <ul className="grid list-disc gap-xs pl-l">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * What the instance keeps of the person who uses it, why, who else receives it, how long it is
 * kept and how to have it changed or deleted: what the GDPR asks a controller to say. It says
 * what the code does, and changes with it.
 */
export function PrivacyPage() {
  const who = { name: APP_NAME, publisher: PUBLISHER.name, email: PUBLISHER.email };

  return (
    <LegalPage title={m.privacy_title()}>
      <LegalSection title={m.privacy_who_title()}>
        <p>{m.privacy_who_text(who)}</p>
        <p>
          <a href={`mailto:${PUBLISHER.email}`} className={linked}>
            {PUBLISHER.email}
          </a>
        </p>
      </LegalSection>

      <LegalSection title={m.privacy_visit_title()}>
        <p>{m.privacy_visit_text()}</p>
        <p>{m.privacy_visit_audience(who)}</p>
        <p>{m.privacy_visit_browser()}</p>
      </LegalSection>

      <LegalSection title={m.privacy_account_title()}>
        <p>{m.privacy_account_text()}</p>
        <p>{m.privacy_account_sessions()}</p>
      </LegalSection>

      <LegalSection title={m.privacy_content_title()}>
        <p>{m.privacy_content_text()}</p>
        <List
          items={[
            m.privacy_content_shared(),
            m.privacy_content_public(),
            m.privacy_content_guides(),
            m.privacy_content_reports(),
            m.privacy_content_sizes(),
            m.privacy_content_friends(),
            m.privacy_content_operator(who),
          ]}
        />
        <p>{m.privacy_content_media()}</p>
        <p>{m.privacy_reports()}</p>
        <p>{m.privacy_reports_told()}</p>
      </LegalSection>

      <LegalSection title={m.privacy_alerts_title()}>
        <p>{m.privacy_alerts_mail()}</p>
        <p>{m.privacy_alerts_push()}</p>
      </LegalSection>

      <LegalSection title={m.privacy_search_title()}>
        <p>{m.privacy_search_text()}</p>
      </LegalSection>

      <LegalSection title={m.privacy_agents_title()}>
        <p>{m.privacy_agents_text()}</p>
      </LegalSection>

      <section id="analytics" className="grid scroll-mt-xxl gap-s">
        <h2 className="text-l font-medium">{m.privacy_analytics_title()}</h2>
        <div className="grid gap-s text-neutral-7">
          <p>{m.analytics_terms()}</p>
          <p>{m.privacy_analytics_more()}</p>
        </div>
      </section>

      <LegalSection title={m.privacy_contact_title()}>
        <p>{m.privacy_contact_text(who)}</p>
      </LegalSection>

      <LegalSection title={m.privacy_running_title()}>
        <p>{m.privacy_running_text()}</p>
      </LegalSection>

      <LegalSection title={m.privacy_bases_title()}>
        <List
          items={[
            m.privacy_bases_contract(),
            m.privacy_bases_consent(),
            m.privacy_bases_interest(),
            m.privacy_bases_messages(),
          ]}
        />
      </LegalSection>

      <LegalSection title={m.privacy_recipients_title()}>
        <ul className="grid gap-xs">
          {RECIPIENTS.map((recipient) => {
            const name = typeof recipient.name === "string" ? recipient.name : recipient.name();
            return (
              <li key={name}>
                <span className="font-medium text-neutral-10">{name}</span>
                {recipient.where ? ` (${recipient.where()})` : ""}: {recipient.does()}
              </li>
            );
          })}
        </ul>
        <p>{m.privacy_recipients_transfer()}</p>
        <p>{m.privacy_recipients_none()}</p>
      </LegalSection>

      <LegalSection title={m.privacy_keep_title()}>
        <List
          items={[
            m.privacy_keep_account(),
            m.privacy_keep_reports(),
            m.privacy_keep_notices(),
            m.privacy_keep_sent(),
            m.privacy_keep_counts(),
            m.privacy_keep_mails(),
            m.privacy_keep_consent(),
            m.privacy_keep_backups(),
            m.privacy_keep_after(),
          ]}
        />
      </LegalSection>

      <LegalSection title={m.privacy_rights_title()}>
        <p>{m.privacy_rights_text(who)}</p>
        <p>{m.privacy_rights_delete(who)}</p>
        <p>
          {m.privacy_rights_cnil()}{" "}
          <a href={CNIL_URL} target="_blank" rel="noreferrer" className={linked}>
            cnil.fr
          </a>
        </p>
      </LegalSection>

      <LegalSection title={m.privacy_changes_title()}>
        <p>{m.privacy_changes_text()}</p>
      </LegalSection>
    </LegalPage>
  );
}
