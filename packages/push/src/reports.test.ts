import { describe, expect, it } from "vitest";

import { PUSH_BYTES } from "./encrypt";
import { type ReportPushContent, reportPush } from "./reports";
import { testPusher } from "./testing";

// The push a notice of reports sends: decision 068.
const content = (more: Partial<ReportPushContent> = {}): ReportPushContent => ({
  locale: "fr",
  noticeId: "n1",
  breakId: "b1",
  breakName: "La Gravière",
  count: 1,
  author: "lena",
  waveSize: "head",
  note: "Ça rentre propre sur le pic nord",
  image: "https://bucket.example.org/m/1/0/thumb.webp?X-Amz-Signature=abc",
  page: "https://app.example.org/fr",
  ...more,
});

describe("the push of a notice of reports", () => {
  it("names the break and the newest report, and opens the break on its reports", () => {
    expect(reportPush(content())).toEqual({
      title: "Nouveau report à La Gravière",
      body: "lena · Tête · « Ça rentre propre sur le pic nord »",
      url: "https://app.example.org/fr/app?break=b1&tab=reports&notice=n1",
      tag: "report-b1",
      image: "https://bucket.example.org/m/1/0/thumb.webp?X-Amz-Signature=abc",
      locale: "fr",
      // What the app on a phone reads besides: the break's notices under one thread, and the
      // notice it marks read. Decision 072.
      thread: "report:b1",
      ids: { notice: "n1" },
      level: "active",
    });
  });

  it("counts the reports it holds, in each language", () => {
    const titles = (["en", "fr", "es", "pt"] as const).map(
      (locale) => reportPush(content({ locale, count: 3 })).title,
    );
    expect(titles).toEqual([
      "3 reports at La Gravière",
      "3 reports à La Gravière",
      "3 reportes en La Gravière",
      "3 reports em La Gravière",
    ]);
  });

  it("says what it knows, cuts a long note, and has no picture without one", () => {
    const push = reportPush(
      content({ author: null, waveSize: null, note: "x".repeat(300), image: null }),
    );
    expect(push.body).toMatch(/^« x+… »$/);
    expect(push.body.length).toBeLessThanOrEqual(120);
    expect(push).not.toHaveProperty("image");
  });

  it("stays well under what one push holds, its picture's address too", () => {
    const push = reportPush(
      content({
        breakName: "N".repeat(200),
        author: "a".repeat(20),
        note: "é".repeat(280),
        image: `https://bucket.example.org/${"k".repeat(700)}`,
      }),
    );
    expect(Buffer.byteLength(JSON.stringify(push))).toBeLessThan(PUSH_BYTES / 2);
  });

  it("sends the picture with the words, and the words alone when both would not fit", async () => {
    const service = testPusher();
    const browser = service.device();
    const push = reportPush(content());
    await service.pusher.send(browser, push, 3600);
    await service.pusher.send(
      browser,
      { ...push, image: `https://bucket.example.org/${"k".repeat(PUSH_BYTES)}` },
      3600,
    );
    const [first, second] = service.sent();
    expect(first?.push.image).toBe(push.image);
    // A browser is sent the words, and nothing of what an app reads besides.
    expect(second?.push).toEqual({
      title: push.title,
      body: push.body,
      url: push.url,
      tag: push.tag,
    });
  });
});
