# 068. Telling the reports at the breaks an account keeps, and what a report's author reads of it

Status: accepted on 2026-10-19. Téo asked for it the day reports went online ([decision 067](067-reports-of-the-waves.md)): notifications "quand un report apparait sur un spot dans un favoris ou une liste et tout ce qui suit". He answered the ten questions I asked, each as I proposed, and added two things: the author of a report reads "des stats sur le nb de vue etc.", and the operators know "dans posthog etc." whether the feature is used. What is marked "chosen here" is his to overturn. Codex challenged the design before it was built; what it changed is said where it applies.

## Context

A report says what a break looks like now, and is worth a few hours. Whoever keeps that break in a list wants to know when one comes, while it is still true, without opening the app to look. The instance already tells an account by push and in the web app's list, for its alerts ([decision 031](031-alerts.md)), with a machinery built for windows of the forecast that move, merge and go: what was told at each spot, claims, a mail and a push that leave apart. A report is simpler: it comes once, at one break, and is true or gone.

## Decision

### Who is told, and of what

- An account is told of a report at a break when it keeps the break: in one of its lists, the favorites among them, in a list shared with it that it kept ([decision 035](035-shared-lists.md)), or as the break of one of its own spots. Never of its own report, and nothing while it is suspended or away ("away until" of its alert settings). Chosen here, at Téo's word.
- A switch of the account, "reports at my spots", on unless it is switched off, beside the moments of its alerts (`alert_settings.on_reports`). And a switch on each list, on unless switched off: the owner's on its list (`station_list.reports_on`), a member's on its membership (`station_list_member.reports_on`). A break is told when one of the lists that hold it says yes, or when it is the break of an own spot. Chosen here.
- A report is told when it is shown: its checks passed, or an operator showed it. Once: `surf_report.announced_at` says it was, whatever becomes of it later. One shown more than two hours after it was sent is not told: it no longer says the sea of now. Chosen here.

### The notice

- What an account is told is a notice: an account, a break, the reports it holds, when it began, whether it was read. A report that comes at a break within three hours of the beginning of the account's notice there joins it, and makes it unread again: an account has one notice at a break in three hours, whatever the number of reports. Chosen here.
- The notices are listed with what the alerts told, in the alerts' panel, by time, and counted in the same unread badge. A notice says the break, how many reports, and the first photo, author, size and note of the newest that is still shown. One whose reports are all gone, flagged, removed or deleted, says that the report was removed, with nothing of it.
- A notice is kept 30 days, then deleted. Chosen here.

### Push

- A notice is pushed to every browser where the account switched push on, as an alert is: one push for a notice, so one at most at a break in three hours. A report that joins a notice whose push has left adds no push. No mail: a mail is heavy for what is true for two hours. Chosen here, at Téo's word.
- It leaves at once, or at the end of the account's quiet hours, and is given up when the newest report it holds is three hours old. It is written as it leaves, from the reports still shown then: none left, it does not leave.
- Six report pushes a day at most for an account, counted apart from the 24 of its alerts. One over the count is held: the list still has it. Chosen here, at Téo's word.
- It says, in the account's language: "New report at <break>" or "3 reports at <break>", then the newest report's author, size and the start of its note. It shows the report's first photo where the browser shows a picture in a notification, which an iPhone does not: the address of its thumbnail, signed for three hours. Pressed, it opens the break on its reports' tab, and the notice is read. Its tag is the break, so that a newer notice at a break takes the older one's place.
- It leaves as an alert's push leaves: in two steps, its claim written first and the browsers held with the account and its settings, in the order the API holds them, once at most. A push service that says a subscription is gone has it deleted.

### What the author reads

- The author of a report reads, under it, how many saw it, how many opened one of its photos or videos, and how many accounts it was told to. An operator reads the same in the admin. Nobody reads who. Chosen here.
- A browser counts a report once, when its card has been in view for a second: in the panel of a break, or on the public page of the break. It keeps the reports it counted, a week, in its own storage, and asks the API to count each once, which keeps a number and nothing of who. A photo opened in the viewer is counted the same way, once a browser. The author's own browser does not count. An account and a visitor count; a key does not: a program has no screen. Chosen here.
- Counts that anyone could raise by calling the API again are not proof of anything. They are a pleasure for the author, and said as such nowhere else.

### What the operators read

- PostHog receives, from the API as every action does: `report_notices_switched`, `list_reports_switched`, `report_notice_read` (which says a notice, pushed or listed, was opened), `reports_seen` and `report_media_opened`, with no report, break or list named. The worker sends nothing to PostHog, as before.
- The admin's overview says the reports of the week: sent, shown, refused, waiting for an operator, the notices made and the pushes that left, and the views. PostHog holds a dashboard of the feature.

## Rejected

- **A notice for each report.** At a break that works on a Sunday morning, ten reports would be ten pushes. One notice in three hours says the same, and a report that joins it shows in the list.
- **A mail.** Heavy, late, and counted against the instance's daily mails, for what is true two hours.
- **The alerts' notifications and deliveries.** They keep, at each spot, what each way out told of moving windows: a report has nothing that moves, and its rules would have been a branch in each of theirs.
- **Counting viewers by who they are**, an account's id or a hash of an address. It would tell who looks at which break, for a figure that is a pleasure and no more.

## Consequences

- The migration `report-notices` adds the switches, `announced_at` and the counts to `surf_report`, and `report_notice` with `report_notice_report`. It marks every report already shown as told, so that the first worker of this version tells none of the past.
- The worker has a job `tell-reports`, every minute, on an instance that keeps media: it tells what was shown since, and sends what is due.
- `/privacy` says that a report's views are counted with nothing of who, and that the browser keeps which reports it counted.
