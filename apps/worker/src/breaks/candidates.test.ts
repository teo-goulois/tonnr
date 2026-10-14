import { describe, expect, it } from "vitest";

import { FormatError } from "../providers/format-error";
import { imagesOf, parseCandidates } from "./candidates";

// Invented candidates: no list's data is in the tests.
const line = (overrides: Record<string, unknown> = {}) => ({
  ref: "g1",
  name: "North jetty",
  ...overrides,
});

const file = (...candidates: Record<string, unknown>[]) => ({ list: "guide", candidates });

describe("a file of candidates", () => {
  it("reads a candidate with all a list may say of it", () => {
    const read = parseCandidates(
      file(
        line({
          location: ["France", "Finistère"],
          latitude: 48,
          longitude: -4.5,
          pointNote: "The beach, not the peak",
          pointUrl: "https://example.org/beach",
          characteristics: { breakTypes: ["beach"], offshoreDirectionDegrees: 90 },
          proposal: {
            action: "merge",
            breakId: "b-1",
            others: ["b-2"],
            note: "Same jetty",
            doubts: ["Which end"],
          },
          evidence: [{ url: "https://example.org/a", title: "A page", note: "Says so" }],
          texts: [{ label: "description", language: "fr", text: "Une jetée." }],
          figures: [{ image: "p12.jpg", crop: [0, 0, 1, 0.5], mark: [0.2, 0.1, 0.3, 0.12] }],
          details: { page: 12 },
        }),
      ),
    );

    expect(read).toEqual({
      list: "guide",
      candidates: [
        {
          ref: "g1",
          name: "North jetty",
          location: ["France", "Finistère"],
          latitude: 48,
          longitude: -4.5,
          pointNote: "The beach, not the peak",
          pointUrl: "https://example.org/beach",
          characteristics: { breakTypes: ["beach"], offshoreDirectionDegrees: 90 },
          proposal: {
            action: "merge",
            breakId: "b-1",
            others: ["b-2"],
            note: "Same jetty",
            doubts: ["Which end"],
          },
          evidence: [{ url: "https://example.org/a", title: "A page", note: "Says so" }],
          texts: [{ label: "description", language: "fr", text: "Une jetée." }],
          figures: [{ image: "p12.jpg", crop: [0, 0, 1, 0.5], mark: [0.2, 0.1, 0.3, 0.12] }],
          details: { page: 12 },
        },
      ],
    });
  });

  it("reads a candidate of which only the name is known", () => {
    expect(parseCandidates(file(line()))).toMatchObject({
      candidates: [
        {
          latitude: null,
          longitude: null,
          characteristics: null,
          proposal: null,
          evidence: [],
          texts: [],
          figures: [],
        },
      ],
    });
  });

  it("names the pictures its candidates show, each once", () => {
    const read = parseCandidates(
      file(
        line({ figures: [{ image: "p12.jpg" }, { image: "p13.png" }] }),
        line({ ref: "g2", figures: [{ image: "p12.jpg" }] }),
      ),
    );
    if (read instanceof FormatError) throw read;

    expect(imagesOf(read)).toEqual(["p12.jpg", "p13.png"]);
  });

  it.each([
    ["a point without its longitude", line({ latitude: 48 })],
    ["a word the catalogue does not have", line({ characteristics: { breakTypes: ["cove"] } })],
    ["a merge that names no break", line({ proposal: { action: "merge" } })],
    ["an action of its own", line({ proposal: { action: "publish" } })],
    ["other breaks that are no ids", line({ proposal: { action: "hold", others: [12] } })],
    ["a page that is no web address", line({ evidence: [{ url: "file:///etc/passwd" }] })],
    ["a picture's name that leaves its folder", line({ figures: [{ image: "../p12.jpg" }] })],
    [
      "a box larger than its picture",
      line({ figures: [{ image: "p12.jpg", crop: [0, 0, 2, 1] }] }),
    ],
    ["a field of its own", line({ rating: 4 })],
  ])("refuses %s", (_, given) => {
    expect(parseCandidates(file(given))).toBeInstanceOf(FormatError);
  });

  it("refuses a reference given twice, and a list without a short name", () => {
    expect(parseCandidates(file(line(), line()))).toBeInstanceOf(FormatError);
    expect(parseCandidates({ list: "A Guide", candidates: [line()] })).toBeInstanceOf(FormatError);
  });
});
