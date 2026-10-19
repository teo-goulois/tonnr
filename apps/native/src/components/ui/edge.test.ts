import { describe, expect, it } from "vitest";

import { border } from "@/theme/tokens";

import { edge } from "./edge";

describe("an edge", () => {
  it("is a line of the theme's finest width, laid as a shadow outside the view", () => {
    expect(border.s).toBe(0.5);
    expect(edge("#dedede")).toEqual({ boxShadow: "0 0 0 0.5px #dedede" });
  });

  it("is drawn inside a view that clips, and in another width when asked", () => {
    expect(edge("#dedede", { inset: true })).toEqual({ boxShadow: "inset 0 0 0 0.5px #dedede" });
    expect(edge("#dedede", { width: border.m })).toEqual({ boxShadow: "0 0 0 1.5px #dedede" });
  });
});
