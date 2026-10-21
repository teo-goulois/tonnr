import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement as h } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CHARACTERISTIC_FIELDS } from "@/components/viewer/break-characteristics";
import type { Spot } from "@/components/viewer/types";
import { m } from "@/paraglide/messages.js";

import { NewSpotPanel, type SpotDraft } from "./new-spot-panel";
import { type SpotDescription, SpotGuide } from "./spot-guide";

// The forms of a spot of one's own, on the form kit of decision 076: what the owner says it is
// like, and the name of a new one, which the place it is put on suggests.

beforeAll(() => {
  // jsdom has no media queries: the kit asks whether the reader wants motion.
  window.matchMedia ??= vi.fn().mockReturnValue({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as never;
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
});

afterEach(cleanup);

async function press(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const nothingSaid = {
  ...Object.fromEntries(CHARACTERISTIC_FIELDS.map(({ key }) => [key, null])),
  offshoreDirectionDegrees: null,
  waveSizeMeters: null,
} as SpotDescription;

// Only what the guide reads of a spot.
const spotSaying = (characteristics: Partial<SpotDescription>) =>
  ({ isOwner: true, characteristics: { ...nothingSaid, ...characteristics } }) as unknown as Spot;

describe("the guide of a spot of one's own", () => {
  it("sends what was pressed, and lets what was left alone follow the spot", async () => {
    const onSave = vi.fn();
    const props = { isEditing: true, onEditingChange: () => {}, isSaving: false, onSave };
    const { rerender } = render(
      h(SpotGuide, { ...props, spot: spotSaying({ breakTypes: ["beach"] }) }),
    );

    const bottom = CHARACTERISTIC_FIELDS.find(({ key }) => key === "bottomTypes")!;
    const group = screen.getByRole("group", { name: bottom.label() });
    await press(within(group).getByRole("button", { name: bottom.words[0]!.reading() }));

    // The spot changes elsewhere while the form is open.
    rerender(h(SpotGuide, { ...props, spot: spotSaying({ breakTypes: ["reef"] }) }));
    await press(screen.getByRole("button", { name: m.spot_guide_save() }));

    expect(onSave).toHaveBeenCalledWith({
      ...nothingSaid,
      breakTypes: ["reef"],
      bottomTypes: [bottom.words[0]!.word],
    });
  });
});

const point = { latitude: 47.84, longitude: -4.36 };
const nothingFound = { data: [], isPending: false, isError: false };

function panel(draft: SpotDraft, onNameChange = vi.fn(), onSave = vi.fn()) {
  return h(NewSpotPanel, {
    query: "",
    onQueryChange: () => {},
    search: { breaks: nothingFound, places: nothingFound, credit: undefined },
    onPick: () => {},
    draft,
    onNameChange,
    near: undefined,
    onOpenSpot: () => {},
    isFull: false,
    isSaving: false,
    onSave,
  });
}

describe("the name of a new spot", () => {
  it("is asked for before the spot is saved", async () => {
    const onSave = vi.fn();
    render(panel({ name: "", point }, vi.fn(), onSave));
    await press(screen.getByRole("button", { name: m.spot_save() }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(m.spot_name_missing())).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(m.spot_name_label()));
  });

  it("follows what the marker is put on, and is told as it is typed", async () => {
    const onNameChange = vi.fn();
    const onSave = vi.fn();
    const { rerender } = render(panel({ name: "", point }, onNameChange, onSave));
    const field = screen.getByLabelText(m.spot_name_label()) as HTMLInputElement;

    // The marker went down on a break: the draft takes its name.
    rerender(panel({ name: "La Torche", point }, onNameChange, onSave));
    expect(field.value).toBe("La Torche");
    expect(onNameChange).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.change(field, { target: { value: "My corner" } });
    });
    expect(onNameChange).toHaveBeenLastCalledWith("My corner");

    rerender(panel({ name: "My corner", point }, onNameChange, onSave));
    await press(screen.getByRole("button", { name: m.spot_save() }));
    expect(onSave).toHaveBeenCalledWith("My corner");
  });
});
