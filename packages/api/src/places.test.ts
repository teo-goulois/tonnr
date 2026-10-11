import { UpstreamError } from "@repo/upstream";
import { Effect, Result } from "effect";
import { describe, expect, it } from "vitest";

import { type PlaceSearch, createPlaces, readPlaces } from "./places";
import { testPlaces } from "./testing";

// Photon's answer, with made-up places: a beach, an address, a town in a county of its name, and
// two features that say nothing usable.
const ANSWER = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-4.35, 47.83] },
      properties: {
        osm_key: "natural",
        osm_value: "beach",
        name: "Plage des Galets",
        street: "Route de la Plage",
        city: "Kerlouarn",
        county: "Finistère",
        state: "Bretagne",
        country: "France",
        countrycode: "FR",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-4.36, 47.84] },
      properties: {
        housenumber: "12",
        street: "Rue du Phare",
        city: "Kerlouarn",
        country: "France",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [9.99, 53.55] },
      properties: { city: "Hafenstadt", state: "Hafenstadt", country: "Germany" },
    },
    { type: "Feature", geometry: { type: "Point", coordinates: [200, 47] }, properties: {} },
    { type: "Feature", geometry: { type: "Point", coordinates: [1, 1] }, properties: {} },
  ],
};

// What every search asks for: towns and named places, no street and no house.
const LAYERS =
  "&layer=city&layer=district&layer=locality&layer=county&layer=state&layer=country&layer=other";
const AT = Date.parse("2026-10-11T10:00:20Z");
const MINUTE = 60_000;
const wanted = (query: string, more: Partial<PlaceSearch> = {}): PlaceSearch => ({
  query,
  limit: 5,
  ...more,
});
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(effect));
const tagOf = (result: Result.Result<unknown, { _tag: string }>) =>
  Result.isFailure(result) ? result.failure._tag : "answered";
const failureOf = <E>(result: Result.Result<unknown, E>) =>
  Result.isFailure(result) ? result.failure : undefined;

/** A service whose every answer waits to be given: `answer` gives the oldest one asked. */
function slowService() {
  const pending: ((outcome: unknown) => void)[] = [];
  let now = AT;
  const places = createPlaces(
    {},
    (address) =>
      Effect.promise(() => new Promise<unknown>((resolve) => pending.push(resolve))).pipe(
        Effect.flatMap((outcome) =>
          typeof outcome === "number"
            ? Effect.fail(new UpstreamError({ url: address, status: outcome, retryable: false }))
            : Effect.succeed(outcome),
        ),
      ),
    () => now,
  );
  return {
    places,
    answer: (outcome: unknown, index = 0) => pending.splice(index, 1)[0]?.(outcome),
    at: (time: number) => {
      now = time;
    },
    // What was asked has reached the service.
    started: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

describe("readPlaces", () => {
  it("names a place and says where it lies, from the widest to the nearest", () => {
    expect(readPlaces(ANSWER)).toEqual([
      {
        name: "Plage des Galets",
        location: ["France", "Bretagne", "Finistère", "Kerlouarn"],
        latitude: 47.83,
        longitude: -4.35,
      },
      {
        name: "12 Rue du Phare",
        location: ["France", "Kerlouarn"],
        latitude: 47.84,
        longitude: -4.36,
      },
      // A town that has no name of its own is called by the nearest place, said once.
      { name: "Hafenstadt", location: ["Germany"], latitude: 53.55, longitude: 9.99 },
    ]);
  });

  it("leaves out a name that holds a control character", () => {
    const feature = (properties: object) => ({
      geometry: { coordinates: [1, 2] },
      properties,
    });
    expect(
      readPlaces({
        features: [
          feature({ name: "Bad\u0000name", city: "Town" }),
          feature({ name: "Good", city: "To\u0007wn", country: "Land" }),
        ],
      }),
    ).toEqual([
      { name: "Town", location: [], latitude: 2, longitude: 1 },
      { name: "Good", location: ["Land"], latitude: 2, longitude: 1 },
    ]);
  });

  it("gives once a place said twice in the same words, and stops at the number wanted", () => {
    const feature = (name: string, city: string, coordinates: [number, number]) => ({
      geometry: { coordinates },
      properties: { name, city, country: "Land" },
    });
    const document = {
      features: [
        feature("Stream", "Town", [1, 2]),
        feature("Stream", "Town", [1.1, 2.1]),
        // The same name in another town is another place.
        feature("Stream", "Village", [3, 4]),
        feature("Beach", "Town", [5, 6]),
      ],
    };

    expect(readPlaces(document)?.map((place) => [place.name, ...place.location])).toEqual([
      ["Stream", "Land", "Town"],
      ["Stream", "Land", "Village"],
      ["Beach", "Land", "Town"],
    ]);
    // The first of the two is kept: the service put it first.
    expect(readPlaces(document, 2)?.map((place) => place.longitude)).toEqual([1, 3]);
  });

  it.each([null, "nothing", { features: "none" }, []])("reads no list in %j", (document) => {
    expect(readPlaces(document)).toBeNull();
  });
});

describe("the search of places", () => {
  it("asks the instance's service once for a search, and keeps the answer a while", async () => {
    const { places, asked, at } = testPlaces(ANSWER, AT);

    const first = await run(places.search(wanted("  Plage  des galets "), "ana"));
    at(AT + MINUTE);
    const again = await run(places.search(wanted("Plage des galets"), "ben"));

    expect(Result.isSuccess(first) && first.success).toHaveLength(3);
    expect(again).toEqual(first);
    // Twice the five places wanted, since the service gives some of them twice.
    expect(asked).toEqual([`https://places.example.org/api?q=Plage+des+galets&limit=10${LAYERS}`]);

    at(AT + 11 * MINUTE);
    await run(places.search(wanted("Plage des galets"), "ana"));
    expect(asked).toHaveLength(2);
  });

  it("keeps an answer for the address that gave it, and for no other", async () => {
    const { places, asked } = testPlaces(ANSWER, AT);

    await run(places.search(wanted("phare"), "ana"));
    // A service may tell one case from the other, a language from the next, here from there.
    await run(places.search(wanted("Phare"), "ana"));
    await run(places.search(wanted("phare", { locale: "fr" }), "ana"));
    await run(places.search(wanted("phare", { near: { latitude: 47, longitude: -4 } }), "ana"));
    await run(places.search(wanted("phare", { limit: 3 }), "ana"));

    expect(asked).toHaveLength(5);
  });

  it("says the language, where the map is to a tenth of a degree, and how close it is", async () => {
    const { places, asked } = testPlaces(ANSWER, AT);
    const near = { latitude: 47.8372, longitude: -4.3518 };

    await run(places.search(wanted("phare", { locale: "fr", near }), "ana"));
    await run(places.search(wanted("phare", { limit: 10, near: { ...near, zoom: 9.6 } }), "ana"));

    expect(asked).toEqual([
      `https://places.example.org/api?q=phare&limit=10${LAYERS}&lang=fr&lat=47.8&lon=-4.4`,
      // Never more than twenty asked for.
      `https://places.example.org/api?q=phare&limit=20${LAYERS}&lat=47.8&lon=-4.4&zoom=10`,
    ]);
  });

  it("gives as many places as wanted, of the more it asked for", async () => {
    const feature = (name: string) => ({
      geometry: { coordinates: [1, 2] },
      properties: { name, country: "Land" },
    });
    const { places } = testPlaces({ features: ["a", "a", "b", "c", "d"].map(feature) }, AT);

    const found = await run(places.search(wanted("anything", { limit: 3 }), "ana"));

    expect(Result.isSuccess(found) && found.success.map((place) => place.name)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps the five hundred answers it was last given", async () => {
    const { places, asked, at } = testPlaces(ANSWER, AT);
    // Three minutes of searches, by accounts enough for none to reach its own limit.
    for (let index = 0; index < 501; index += 1) {
      at(AT + Math.floor(index / 240) * MINUTE);
      await run(places.search(wanted(`plage ${index}`), `account-${index % 20}`));
    }
    expect(asked).toHaveLength(501);

    await run(places.search(wanted("plage 1"), "someone else"));
    expect(asked).toHaveLength(501);
    await run(places.search(wanted("plage 0"), "someone else"));
    expect(asked).toHaveLength(502);
  });

  it("lets an account search so many times a minute, and no other account pay for it", async () => {
    const { places, asked, at } = testPlaces(ANSWER, AT);
    for (let index = 0; index < 40; index += 1) {
      await run(places.search(wanted(`plage ${index}`), "ana"));
    }

    expect(failureOf(await run(places.search(wanted("one more"), "ana")))).toMatchObject({
      _tag: "PlacesBusy",
      byAccount: true,
      // The minute of the clock has forty seconds left.
      retryAfterSeconds: 40,
    });
    expect(asked).toHaveLength(40);
    // What is kept is given all the same, and another account searches.
    expect(tagOf(await run(places.search(wanted("plage 3"), "ana")))).toBe("answered");
    expect(tagOf(await run(places.search(wanted("another"), "ben")))).toBe("answered");
    expect(asked).toHaveLength(41);

    // The next minute starts the count again, and the service is asked.
    at(AT + 40_000);
    expect(tagOf(await run(places.search(wanted("one more"), "ana")))).toBe("answered");
    expect(asked).toHaveLength(42);
  });

  it("counts a search that failed, and starts no count again when the clock is set back", async () => {
    const { places, asked, at } = testPlaces(400, AT);
    for (let index = 0; index < 40; index += 1) {
      await run(places.search(wanted(`plage ${index}`), "ana"));
    }
    expect(asked).toHaveLength(40);

    at(AT - 5 * MINUTE);
    const refused = failureOf(await run(places.search(wanted("one more"), "ana")));
    expect(refused).toMatchObject({ _tag: "PlacesBusy", byAccount: true });
    at(AT);
    expect(tagOf(await run(places.search(wanted("one more"), "ana")))).toBe("PlacesBusy");
    expect(asked).toHaveLength(40);
  });

  it("stops asking for a minute once everyone has asked enough", async () => {
    const { places, asked } = testPlaces(ANSWER, AT);
    for (let index = 0; index < 240; index += 1) {
      await run(places.search(wanted(`plage ${index}`), `account-${index % 8}`));
    }

    expect(failureOf(await run(places.search(wanted("one more"), "someone else")))).toMatchObject({
      _tag: "PlacesBusy",
      byAccount: false,
      retryAfterSeconds: 40,
    });
    expect(asked).toHaveLength(240);
  });

  it.each([429, 403, 404, 503])(
    "leaves a service that answered %i alone for a while, and says for how long",
    async (status) => {
      const { places, asked, answers, at } = testPlaces(status, AT);

      expect(failureOf(await run(places.search(wanted("phare"), "ana")))).toMatchObject({
        _tag: "PlacesFailed",
        status,
        retryAfterSeconds: 30,
      });
      answers(ANSWER);
      at(AT + 1000);
      expect(failureOf(await run(places.search(wanted("plage"), "ben")))).toMatchObject({
        _tag: "PlacesBusy",
        byAccount: false,
        retryAfterSeconds: 29,
      });
      expect(asked).toHaveLength(1);

      at(AT + 30_000);
      expect(tagOf(await run(places.search(wanted("plage"), "ben")))).toBe("answered");
    },
  );

  it("leaves alone a service that answers something else than a list, and keeps nothing of it", async () => {
    const { places, asked, answers, at } = testPlaces({ message: "moved" }, AT);

    const unread = failureOf(await run(places.search(wanted("phare"), "ana")));
    expect(unread).toMatchObject({ _tag: "PlacesFailed", retryAfterSeconds: 30 });
    expect(unread).not.toHaveProperty("status");
    answers(ANSWER);
    expect(tagOf(await run(places.search(wanted("phare"), "ana")))).toBe("PlacesBusy");

    at(AT + 30_000);
    expect(tagOf(await run(places.search(wanted("phare"), "ana")))).toBe("answered");
    expect(asked).toHaveLength(2);
  });

  it("asks again at once after a search the service calls wrong", async () => {
    const { places, asked, answers } = testPlaces(400, AT);

    const wrong = failureOf(await run(places.search(wanted("phare"), "ana")));
    // It says no time to wait: nothing rests.
    expect(wrong).toMatchObject({
      _tag: "PlacesFailed",
      status: 400,
      retryAfterSeconds: undefined,
    });
    answers(ANSWER);

    expect(tagOf(await run(places.search(wanted("plage"), "ana")))).toBe("answered");
    expect(asked).toHaveLength(2);
  });

  it("tells an account that asked too much so, even while the service rests", async () => {
    const { places, answers } = testPlaces(ANSWER, AT);
    for (let index = 0; index < 40; index += 1) {
      await run(places.search(wanted(`plage ${index}`), "ana"));
    }
    answers(503);
    await run(places.search(wanted("phare"), "ben"));

    expect(failureOf(await run(places.search(wanted("one more"), "ana")))).toMatchObject({
      _tag: "PlacesBusy",
      byAccount: true,
    });
    expect(failureOf(await run(places.search(wanted("one more"), "ben")))).toMatchObject({
      _tag: "PlacesBusy",
      byAccount: false,
    });
  });

  it("rests from the moment the service failed, however long it took to", async () => {
    const { places, answer, at, started } = slowService();
    const slow = run(places.search(wanted("phare"), "ana"));
    await started();

    // The answer comes twenty-five seconds after the question.
    at(AT + 25_000);
    answer(503);
    expect(failureOf(await slow)).toMatchObject({ _tag: "PlacesFailed", retryAfterSeconds: 30 });

    at(AT + 54_000);
    expect(failureOf(await run(places.search(wanted("plage"), "ben")))).toMatchObject({
      _tag: "PlacesBusy",
      retryAfterSeconds: 1,
    });
  });

  it("does not shorten a rest when an older search fails after a newer one", async () => {
    const { places, answer, at, started } = slowService();
    const older = run(places.search(wanted("phare"), "ana"));
    const newer = run(places.search(wanted("plage"), "ben"));
    await started();

    at(AT + 20_000);
    answer(503, 1);
    expect(failureOf(await newer)).toMatchObject({ retryAfterSeconds: 30 });
    // The clock of this machine was set back, and the older search fails then.
    at(AT + 5_000);
    answer(503, 0);
    expect(failureOf(await older)).toMatchObject({ retryAfterSeconds: 45 });

    at(AT + 49_000);
    expect(tagOf(await run(places.search(wanted("one more"), "cleo")))).toBe("PlacesBusy");
  });

  it("asks no more of a service that keeps eight searches waiting", async () => {
    const { places, answer, started } = slowService();
    const waiting = Array.from({ length: 8 }, (_, index) =>
      run(places.search(wanted(`plage ${index}`), `account-${index}`)),
    );
    await started();

    expect(failureOf(await run(places.search(wanted("one more"), "someone else")))).toMatchObject({
      _tag: "PlacesBusy",
      byAccount: false,
      retryAfterSeconds: 1,
    });

    for (let index = 0; index < 8; index += 1) answer(ANSWER);
    expect((await Promise.all(waiting)).map(tagOf)).toEqual(Array(8).fill("answered"));
    const ninth = run(places.search(wanted("one more"), "someone else"));
    await started();
    answer(ANSWER);
    expect(tagOf(await ninth)).toBe("answered");
  });
});
