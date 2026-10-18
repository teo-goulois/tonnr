import type { Analysis } from "@repo/db/schema/reports";

import { MODELS } from "./models";

// What the worker sees in a photo of a report: whether it is the sea, a wave or a beach, and
// whether it shows nudity. Two open models run in the worker itself, and nothing is sent
// anywhere: CLIP, which says how near an image is to each of a few sentences, and a classifier
// of nudity. Decision 067.

// What a report shows, said as CLIP reads a sentence best.
const SEA = [
  "a photo of ocean waves",
  "a photo of a surfer riding a wave",
  "a photo of surfers in the sea",
  "a photo of a beach and the sea",
  "a photo of the sea seen from the shore",
  "a photo of waves breaking on rocks",
  "a photo of a calm sea",
];
// What a report must not be. Each takes its share of the scores, so that the sea's is only
// high when nothing else is near.
const OTHER = [
  "a selfie",
  "a close-up photo of a person's face",
  "a screenshot of a phone",
  "a screenshot of a map",
  "a weather map or a chart",
  "a photo of a computer screen",
  "a photo of a document with text",
  "a photo of food",
  "a photo of a room indoors",
  "a photo of a city street",
  "a photo of a car",
  "a photo of a dog or a cat",
  "a photo of a forest",
  "a photo of mountains",
  "a photo of a swimming pool",
  "a photo of a lake or a river",
  "a drawing or an illustration",
  "a photo of a crowd at a party",
];

/** What looks at the images of a medium and says what they show. */
export type Analyser = { analyse(images: readonly Uint8Array[]): Promise<Analysis> };

type Scored = { label: string; score: number };
type Classify = (image: unknown, labels?: string[]) => Promise<Scored[] | Scored[][]>;

/**
 * The analyser of the worker, which loads the two models the first time it is asked, from
 * `folder`, where `fetchModels` put them: the worker's image as it was built, or a program of
 * development. It downloads nothing itself.
 */
export function createAnalyser(options: { folder: string }): Analyser {
  let loaded: Promise<{
    clip: Classify;
    nudity: Classify;
    read: (image: Uint8Array) => Promise<unknown>;
  }> | null = null;
  const load = async () => {
    const { env, pipeline, RawImage } = await import("@huggingface/transformers");
    env.localModelPath = options.folder;
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.useBrowserCache = false;
    env.useFSCache = false;
    const clip = (await pipeline("zero-shot-image-classification", MODELS.clip.id, {
      dtype: "q8",
    })) as unknown as Classify;
    const nudity = (await pipeline("image-classification", MODELS.nudity.id, {
      dtype: "q8",
    })) as unknown as Classify;
    const read = (image: Uint8Array) => RawImage.fromBlob(new Blob([Buffer.from(image)]));
    return { clip, nudity, read };
  };

  return {
    async analyse(images) {
      loaded ??= load().catch((error: unknown) => {
        // A load that failed is tried again by the next medium.
        loaded = null;
        throw error;
      });
      const { clip, nudity, read } = await loaded;
      let sea = 1;
      let naked = 0;
      let top: Scored[] = [];
      for (const bytes of images) {
        const image = await read(bytes);
        const scored = (await clip(image, [...SEA, ...OTHER])) as Scored[];
        const seaScore = scored
          .filter((one) => SEA.includes(one.label))
          .reduce((sum, one) => sum + one.score, 0);
        const flagged = (await nudity(image)) as Scored[];
        const nudityScore = flagged.find((one) => one.label.toLowerCase() === "nsfw")?.score ?? 0;
        // The worst frame speaks for the medium.
        if (seaScore < sea) {
          sea = seaScore;
          top = scored.slice(0, 3);
        }
        naked = Math.max(naked, nudityScore);
      }
      const round = (value: number) => Math.round(value * 1000) / 1000;
      return {
        sea: round(sea),
        nudity: round(naked),
        frames: images.length,
        top: top.map((one) => ({ label: one.label, score: round(one.score) })),
      };
    },
  };
}

/** An analyser for a test, which says what it is given to say and looks at nothing. */
export function testAnalyser(answer: Partial<Analysis> = {}): Analyser & { seen: number } {
  const analyser = {
    seen: 0,
    async analyse(images: readonly Uint8Array[]) {
      analyser.seen += images.length;
      return { sea: 0.9, nudity: 0.01, frames: images.length, top: [], ...answer };
    },
  };
  return analyser;
}
