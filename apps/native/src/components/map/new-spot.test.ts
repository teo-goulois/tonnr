import { describe, expect, it } from "vitest";

import {
  createInput,
  draftAt,
  NAME_MOST,
  nearOf,
  nudged,
  placedAt,
  pointOf,
  stepFrom,
  writePoint,
} from "./new-spot";

const HOSSEGOR = { latitude: 43.6646, longitude: -1.4423 };
const BREAK = { id: "b1", name: "La Gravière", latitude: 43.6703, longitude: -1.4444 };

describe("the point a press held on the map sends", () => {
  it("reads the figures it wrote, and nothing else", () => {
    expect(pointOf("43.5", "-1.6")).toEqual({ latitude: 43.5, longitude: -1.6 });
    expect(pointOf(["43.5"], ["-1.6"])).toEqual({ latitude: 43.5, longitude: -1.6 });
    expect(pointOf("43.5", undefined)).toBeUndefined();
    expect(pointOf("", "-1.6")).toBeUndefined();
    expect(pointOf("north", "-1.6")).toBeUndefined();
    expect(pointOf("95", "-1.6")).toBeUndefined();
  });

  it("brings a longitude dragged past the edge back into the world", () => {
    expect(pointOf("10", "200")).toEqual({ latitude: 10, longitude: -160 });
  });
});

describe("the name of a new spot", () => {
  it("follows what the marker is put on until the person writes one", () => {
    const onBreak = placedAt(draftAt(HOSSEGOR, false), BREAK, {
      breakId: BREAK.id,
      name: BREAK.name,
    });
    expect(onBreak).toMatchObject({ name: "La Gravière", breakId: "b1", placed: true });

    const elsewhere = placedAt(onBreak, HOSSEGOR, { name: "Hossegor" });
    expect(elsewhere.name).toBe("Hossegor");
    expect(elsewhere.breakId).toBeUndefined();

    const written = { ...elsewhere, name: "My peak" };
    expect(placedAt(written, BREAK, { breakId: "b1", name: BREAK.name }).name).toBe("My peak");
  });

  it("keeps its name when the marker is moved by hand, and leaves the break", () => {
    const onBreak = placedAt(draftAt(HOSSEGOR, false), BREAK, { breakId: "b1", name: "Gravière" });
    const moved = placedAt(onBreak, HOSSEGOR);
    expect(moved).toMatchObject({ name: "Gravière", breakId: undefined, placed: true });
  });

  it("is cut to what the API takes", () => {
    const long = "a".repeat(NAME_MOST + 20);
    expect(placedAt(draftAt(HOSSEGOR, false), HOSSEGOR, { name: long }).name).toHaveLength(
      NAME_MOST,
    );
  });
});

describe("what a new spot is saved with", () => {
  it("is nothing until the marker is put and the spot named", () => {
    expect(createInput({ ...draftAt(HOSSEGOR, false), name: "Hossegor" })).toBeUndefined();
    expect(createInput({ ...draftAt(HOSSEGOR, true), name: "   " })).toBeUndefined();
  });

  it("is the break alone while the marker stands on it", () => {
    const onBreak = placedAt(draftAt(HOSSEGOR, false), BREAK, { breakId: "b1", name: "Gravière" });
    expect(createInput(onBreak)).toEqual({ breakId: "b1", name: "Gravière" });
  });

  it("is the point, to a tenth of a metre, once moved", () => {
    const draft = { ...draftAt({ latitude: 43.66461234567, longitude: -1.44231234567 }, true) };
    expect(createInput({ ...draft, name: " Home " })).toEqual({
      name: "Home",
      latitude: 43.664612,
      longitude: -1.442312,
    });
  });
});

describe("what stands near the marker", () => {
  const spots = [{ id: "s1", name: "Mine", latitude: 43.6655, longitude: -1.4423 }];
  const breaks = [BREAK, { id: "b2", name: "Les Culs Nus", latitude: 43.6648, longitude: -1.4425 }];

  it("is a spot of the account's and a break within 150 metres", () => {
    const near = nearOf(draftAt(HOSSEGOR, true), spots, breaks);
    expect(near.spot?.id).toBe("s1");
    expect(near.break?.id).toBe("b2");
  });

  it("is no break once the spot is made from one", () => {
    const onBreak = placedAt(draftAt(HOSSEGOR, false), breaks[1]!, { breakId: "b2" });
    expect(nearOf(onBreak, spots, breaks).break).toBeUndefined();
  });

  it("is nothing before the marker is put", () => {
    expect(nearOf(draftAt(HOSSEGOR, false), spots, breaks)).toEqual({
      spot: undefined,
      break: undefined,
    });
  });
});

describe("a step of the marker", () => {
  it("is an eighth of what the map shows", () => {
    const bounds = [-2, 43, -1, 44] as [number, number, number, number];
    expect(nudged(HOSSEGOR, bounds, "north").latitude).toBeCloseTo(43.7896);
    expect(nudged(HOSSEGOR, bounds, "west").longitude).toBeCloseTo(-1.5673);
  });

  it("goes round the world across the antimeridian", () => {
    const bounds = [170, -10, -170, 10] as [number, number, number, number];
    expect(nudged({ latitude: 0, longitude: 179 }, bounds, "east").longitude).toBeCloseTo(-178.5);
  });

  it("starts from the marker once it was put, and from the middle of the map until then", () => {
    const bounds = [-2, 43, -1, 44] as [number, number, number, number];
    const opened = draftAt({ latitude: 46, longitude: -3 }, false);
    expect(stepFrom(opened, bounds)).toEqual({ latitude: 43.5, longitude: -1.5 });
    const put = placedAt(opened, HOSSEGOR);
    expect(stepFrom(put, bounds)).toEqual(HOSSEGOR);
    const across = [170, -10, -170, 10] as [number, number, number, number];
    expect(stepFrom(opened, across)).toEqual({ latitude: 0, longitude: 180 });
  });
});

it("writes the point as the web writes it", () => {
  expect(writePoint(HOSSEGOR)).toBe("43.66460, -1.44230");
});
