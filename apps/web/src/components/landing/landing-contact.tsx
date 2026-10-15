import { Button } from "@repo/ui/components/ui/button";
import { ChatFillDuoIcon } from "@repo/ui/icon";
import { useState } from "react";

import { WAVE_HEIGHT_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { EmailMenu } from "@/components/shared/email-menu";

import { MessageForm, type Topic } from "./landing-idea";
import { Card, Tile, Woven, column } from "./landing-parts";

/** What a message of `/contact` may be about. A link names one with `?topic=`. */
export const CONTACT_TOPICS = ["question", "bug", "key", "other"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

// Each topic's words, and how its text starts: a bug and a key ask what is needed to answer.
const topics = (): Topic[] => [
  { id: "question", label: m.contact_topic_question(), start: "" },
  { id: "bug", label: m.contact_topic_bug(), start: m.contact_topic_bug_start() },
  { id: "key", label: m.contact_topic_key(), start: m.contact_topic_key_start() },
  { id: "other", label: m.contact_topic_other(), start: "" },
];

/**
 * `/contact`: whatever a person wants to tell whoever makes the product, a question, a bug or a
 * word, sent by mail as an idea is and answered at the address given. Decision 026.
 */
export function ContactPage({ topic }: { topic?: ContactTopic }) {
  // Who sent the message that left, while the page says thank you.
  const [sentBy, setSentBy] = useState<string | null>(null);

  return (
    <section className={`${column} grid gap-xl pt-xl lg:grid-cols-12 lg:pt-xxl`}>
      <div className="grid content-start gap-m lg:col-span-5">
        <h1 className="text-l font-medium text-balance lg:text-xl">
          <Woven
            say={m.contact_title}
            words={{
              write: (
                <>
                  <Tile color={scaleColor(WAVE_HEIGHT_SCALE, 1.5)} className="mr-[0.2em]">
                    <ChatFillDuoIcon />
                  </Tile>
                  {m.contact_word()}
                </>
              ),
            }}
          />
          <span className="text-neutral-7"> {m.contact_more()}</span>
        </h1>
        <p className="text-neutral-7">
          {m.contact_direct()} <EmailMenu className="text-neutral-10" />
        </p>
      </div>
      <Card className="lg:col-span-7">
        {sentBy === null ? (
          <MessageForm
            about="message"
            onSent={setSentBy}
            topics={topics()}
            topic={topic}
            words={{
              text: m.contact_text(),
              placeholder: m.contact_placeholder(),
              full: m.contact_full(),
              failed: m.contact_failed(),
            }}
          />
        ) : (
          <div role="status" className="grid justify-items-start gap-s">
            <h2 className="text-l font-medium">{m.landing_idea_sent_title({ name: sentBy })}</h2>
            <p className="text-neutral-7">{m.contact_sent_text()}</p>
            <Button variant="secondary" onClick={() => setSentBy(null)}>
              {m.contact_again()}
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}
