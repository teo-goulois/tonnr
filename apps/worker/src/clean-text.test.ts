import { expect, it } from "vitest";

import { cleanText } from "./clean-text";

it("removes control characters and extra spaces", () => {
  expect(cleanText("  Saint\u0000Jean \t de\nLuz  ")).toBe("Saint Jean de Luz");
});
