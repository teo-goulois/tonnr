import { APP_NAME } from "@repo/config/app";

import { HOSTS, type Hosted, PUBLISHER } from "@/lib/legal";
import { m } from "@/paraglide/messages.js";

import { LegalPage, LegalSection, linked } from "./legal-page";

const HOSTED: Record<Hosted, () => string> = {
  web: m.legal_host_web,
  api: m.legal_host_api,
};

/** The mentions légales a French site owes its readers: who publishes it, and who hosts it. */
export function LegalNoticePage() {
  return (
    <LegalPage title={m.legal_title()}>
      <LegalSection title={m.legal_publisher_title()}>
        <p>{m.legal_publisher_text({ name: APP_NAME, publisher: PUBLISHER.name })}</p>
        <p>
          {m.legal_contact()}{" "}
          <a href={`mailto:${PUBLISHER.email}`} className={linked}>
            {PUBLISHER.email}
          </a>
        </p>
      </LegalSection>

      <LegalSection title={m.legal_hosts_title()}>
        {HOSTS.map((host) => (
          <div key={host.hosts} className="grid gap-xs">
            <p className="font-medium text-neutral-10">{HOSTED[host.hosts]()}</p>
            <p>
              {host.name}
              <br />
              {host.address}
              <br />
              {host.phone}
            </p>
          </div>
        ))}
      </LegalSection>

      <LegalSection title={m.legal_code_title()}>
        <p>{m.legal_code_text({ name: APP_NAME })}</p>
      </LegalSection>
    </LegalPage>
  );
}
