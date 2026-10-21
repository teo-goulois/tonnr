import { describe, expect, it } from "vitest";

import { type BreakDraft, draftSchema, sameDraft, valuesOf } from "./break-fields";
import { NOTHING_SAID } from "./words";

// What the form of a break says is wrong with it, field by field, and what it sends: decision 076,
// over decision 049's catalogue. An invented break.

const DRAFT: BreakDraft = {
  name: "La Pointe",
  latitude: "47.80000",
  longitude: "-4.35000",
  characteristics: NOTHING_SAID,
  offshore: "",
  size: { min: "", max: "" },
  description: "",
  language: "en",
};

/** The fields the schema finds wrong, by their names in the form. */
function wrong(draft: BreakDraft) {
  const checked = draftSchema().safeParse(draft);
  return checked.success ? [] : checked.error.issues.map((issue) => issue.path.join("."));
}

describe("the form of a break", () => {
  it("takes a break with a name and a point, and nothing else said", () => {
    expect(wrong(DRAFT)).toEqual([]);
  });

  it("says each wrong field under itself", () => {
    expect(
      wrong({
        ...DRAFT,
        name: "  ",
        latitude: "91",
        longitude: "west",
        offshore: "360",
        description: "ok",
      }),
    ).toEqual(["name", "latitude", "longitude", "offshore", "description"]);
  });

  it("says a size under the bound that is wrong", () => {
    expect(wrong({ ...DRAFT, size: { min: "a", max: "" } })).toEqual(["size.min"]);
    expect(wrong({ ...DRAFT, size: { min: "", max: "31" } })).toEqual(["size.max"]);
    expect(wrong({ ...DRAFT, size: { min: "3", max: "1" } })).toEqual(["size.max"]);
    expect(wrong({ ...DRAFT, size: { min: "0.5", max: "" } })).toEqual([]);
  });

  it("sends the words of a line in the catalogue's order, and a line with none as nothing", () => {
    const values = valuesOf({
      ...DRAFT,
      name: " La Pointe ",
      characteristics: { ...NOTHING_SAID, waveDirections: ["right", "left"], breakTypes: [] },
      offshore: " 45 ",
      size: { min: "1", max: "" },
      description: "  Long rights at mid tide.  ",
    });
    expect(values.name).toBe("La Pointe");
    expect(values.characteristics.waveDirections).toEqual(["left", "right"]);
    expect(values.characteristics.breakTypes).toBeNull();
    expect(values.characteristics.offshoreDirectionDegrees).toBe(45);
    expect(values.characteristics.waveSizeMeters).toEqual({ min: 1, max: null });
    expect(values.description).toEqual({ text: "Long rights at mid tide.", language: "en" });
  });

  it("is unchanged when only the order of a line's words or an empty line differ", () => {
    const pressed = {
      ...DRAFT,
      characteristics: { ...NOTHING_SAID, waveDirections: ["left", "right"] },
    } as BreakDraft;
    const again = {
      ...DRAFT,
      characteristics: { ...NOTHING_SAID, waveDirections: ["right", "left"], breakTypes: [] },
    } as BreakDraft;
    expect(sameDraft(pressed, again)).toBe(true);
    expect(sameDraft(DRAFT, { ...DRAFT, name: "La Pointe Nord" })).toBe(false);
  });
});
