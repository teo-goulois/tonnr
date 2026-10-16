import { cleanup, render, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  CanvasButtonSamples,
  CanvasFieldSamples,
  FIELD_SIZES,
} from "./canvas-variants";

afterEach(cleanup);

describe("variant coverage with one changing feature at a time", () => {
  it("renders every public button style, text size and icon size with the same label", () => {
    const { container } = render(createElement(CanvasButtonSamples));
    const comparisons = [...container.children];
    for (const [index, labels] of [
      [0, Object.keys(BUTTON_VARIANTS)],
      [1, Object.keys(BUTTON_SIZES).filter((size) => !size.startsWith("icon"))],
      [2, Object.keys(BUTTON_SIZES).filter((size) => size.startsWith("icon"))],
    ] as const) {
      const comparison = comparisons[index]!;
      expect(
        within(comparison as HTMLElement).getAllByRole("button", { name: "Continue" }),
      ).toHaveLength(labels.length);
      for (const label of labels)
        expect(within(comparison as HTMLElement).getByText(label)).toBeTruthy();
    }
    const textSizes = within(comparisons[1] as HTMLElement).getAllByRole("button");
    for (const button of [
      ...textSizes,
      ...within(comparisons[2] as HTMLElement).getAllByRole("button"),
    ])
      expect(button.className).toContain("bg-color-1");
  });
  it("renders all field sizes and leaves example drafts editable", () => {
    const { container } = render(createElement(CanvasFieldSamples));
    for (const size of FIELD_SIZES) {
      expect(within(container).getByRole("textbox", { name: `Spot name ${size}` })).toBeTruthy();
      expect(within(container).getByRole("textbox", { name: `Notes ${size}` })).toBeTruthy();
    }
    expect(
      (within(container).getByRole("textbox", { name: "Default spot" }) as HTMLInputElement)
        .disabled,
    ).toBe(false);
    expect(
      (within(container).getByRole("textbox", { name: "Read only notes" }) as HTMLTextAreaElement)
        .readOnly,
    ).toBe(true);
  });
});
