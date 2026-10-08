<!--
Generated from apps/web/content/handbook/web/support-email.md.
Do not edit this snapshot directly. Run `pnpm knowledge:build` after changing the handbook.
-->

# Support email

Use this recipe for a low-volume inbox managed by one person, such as
`support@example.com`. It has no additional service cost: Cloudflare Email
Routing receives and forwards messages, while a personal Gmail account reads and
replies to them.

Do not use it for application-generated, transactional, marketing, or bulk
email. Those need a properly authenticated sending service.

## Result

```text
Inbound:  support@example.com -> Cloudflare Email Routing -> owner@gmail.com
Outbound: Gmail "Send mail as" -> smtp.gmail.com -> customer
```

This does not require a Worker, Cloudflare Email Sending, Resend, or Google
Workspace.

## Preconditions

- The domain uses Cloudflare DNS.
- The owner has a Gmail account and can enable Google 2-Step Verification.
- The domain does not already receive mail through another provider. Existing MX
  records can conflict with Email Routing; stop and ask before replacing them.
- The user performs every secret-entry step. Never ask them to paste an app
  password into chat, source control, or a project file.

## 1. Receive support email

In Cloudflare, open **Compute > Email Service > Email Routing** for the domain.

1. Enable Email Routing and let Cloudflare add its required MX and SPF records.
2. Under **Destination Addresses**, add `owner@gmail.com`.
3. Open Cloudflare's verification message in Gmail and verify the destination.
4. Under **Routing Rules**, create the custom address `support@example.com`.
5. Choose **Send to an email** and select the verified Gmail destination.
6. Confirm that the rule is active, then send a message to the support address
   from a different mailbox.

Do not manually duplicate SPF records. If DNS already contains mail records,
inspect and reconcile them before changing anything.

## 2. Send and reply as the support address

1. In the Google Account, enable **2-Step Verification**.
2. Create an **App password** dedicated to Gmail SMTP. Use this generated
   password below, not the normal Google password.
3. In Gmail on desktop, open **Settings > See all settings > Accounts and
   Import > Send mail as > Add another email address**.
4. Enter the public display name and `support@example.com`.
5. Configure the SMTP step with:
   - server: `smtp.gmail.com`
   - port: `587` with TLS, or `465` with SSL
   - username: the complete `owner@gmail.com` address
   - password: the Google App password
6. Gmail sends a confirmation to `support@example.com`. Cloudflare forwards it
   to the Gmail inbox; open it and confirm the address.
7. In **Accounts and Import**, under **When replying to a message**, select
   **Reply from the same address the message was sent to**.
8. Optionally make the support address the default From address if this inbox is
   used mainly for support.

The **Treat as an alias** option changes how Gmail treats the address as the same
identity. Leave its default for a single-owner support inbox unless the user
specifically needs separate-identity behavior.

## 3. Verify the complete flow

Use an unrelated external mailbox for the test:

1. Send a new message to `support@example.com` and verify it reaches Gmail.
2. Reply from Gmail and verify the draft's **From** field before sending.
3. Confirm the reply arrives externally as `support@example.com`.
4. Reply once more from the external mailbox and confirm the conversation returns
   to Gmail.

Do not call the setup complete after DNS is active. Both directions and the
visible From address must pass.

## Troubleshooting

- **Replies use the personal address:** select **Reply from the same address the
  message was sent to**, reload Gmail, and start a fresh reply.
- **The Gmail confirmation never arrives:** verify the Cloudflare destination,
  active routing rule, support address spelling, spam folder, and Email Routing
  activity.
- **SMTP authentication fails:** use the full Gmail address and an App password,
  not the regular password. App passwords require 2-Step Verification and may be
  unavailable for managed, security-key-only, or Advanced Protection accounts.
- **TLS negotiation fails:** use TLS on `587` or SSL on `465`.
- **A valid alias starts bouncing:** remove it from **Send mail as**, add it again,
  and repeat verification.

## Limits to state clearly

- This is for human, low-volume support and remains subject to Gmail's sending
  limits and account policies.
- Some recipients or mail clients can show the personal Gmail address or an
  “on behalf of” indication.
- It does not provide the same custom-domain DKIM/DMARC alignment or operational
  guarantees as Google Workspace or a dedicated sending provider.
- Changing the Google Account password revokes its App passwords.

When these limits matter, recommend a dedicated mailbox or transactional sender
instead of disguising this recipe as production email infrastructure.

## Current official references

- [Cloudflare Email Routing rules and destination addresses](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/)
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Cloudflare email DNS records and conflicts](https://developers.cloudflare.com/dns/troubleshooting/email-issues/)
- [Gmail: send from another address or alias](https://support.google.com/mail/answer/22370)
- [Google: sign in with App passwords](https://support.google.com/mail/answer/185833)

Recheck these references before automating the setup because provider interfaces
and account restrictions can change.
