import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// The files of the two models the worker analyses a report with, each at the revision it was
// checked at, with its size and its SHA-256: what the worker's image downloads as it is built, and
// a program of development once. Nothing downloads a model while the worker runs. Decision 067.

type ModelFile = { path: string; bytes: number; sha256: string };
export type Model = { id: string; revision: string; licence: string; files: ModelFile[] };

export const MODELS = {
  // OpenAI's CLIP ViT-B/32, MIT, as ONNX for transformers.js.
  clip: {
    id: "Xenova/clip-vit-base-patch32",
    revision: "d15189d7028b43f1d3e65039190477f6af591c2a",
    licence: "MIT",
    files: [
      {
        path: "config.json",
        bytes: 4524,
        sha256: "493ef57ff783e42d1530c91b53469b7fdf8db8a9c1408e86998fcb7899a4f495",
      },
      {
        path: "preprocessor_config.json",
        bytes: 520,
        sha256: "6f638fb9401a6d6296feff533ee7efe657b787c49f954f82f5906b36ef2a1b1f",
      },
      {
        path: "tokenizer.json",
        bytes: 2_224_119,
        sha256: "f7f3b7af117d467b58374797691a6438d3e6b9e9cef800dfd5dced7f697a90cd",
      },
      {
        path: "tokenizer_config.json",
        bytes: 775,
        sha256: "60ba2912bc6344c94bc16bbdec27fa1209409167b6f2fdf3cfe9e65462ea3967",
      },
      {
        path: "onnx/model_quantized.onnx",
        bytes: 153_695_702,
        sha256: "0898a3facfdb27f0a041e57649b4989cfd094e4a0040d6ae75ed69917dfc7328",
      },
    ],
  },
  // A ViT fine-tuned to tell nudity, Apache-2.0.
  nudity: {
    id: "AdamCodd/vit-base-nsfw-detector",
    revision: "8587de998f441aac03fdd57a85d2e4cb808c7d64",
    licence: "Apache-2.0",
    files: [
      {
        path: "config.json",
        bytes: 715,
        sha256: "604d1da5e3cc8b6dc3f2768a911ed61a44a331cfcee9ecde2ce2cba9a1e7972b",
      },
      {
        path: "preprocessor_config.json",
        bytes: 232,
        sha256: "f2ca775909d2237bd31440280cefcaceb3ac66753c19f7a344e385e68982a9b2",
      },
      {
        path: "onnx/model_quantized.onnx",
        bytes: 88_500_985,
        sha256: "432763a6899ebc418c55f784b98f90565e5fc694c778d2ffcb0294b12f6a7404",
      },
    ],
  },
} as const satisfies Record<string, Model>;

const sha256 = (body: Uint8Array) => createHash("sha256").update(body).digest("hex");

/** Whether a file of a model is in the folder as it was checked. */
async function isKept(folder: string, model: Model, file: ModelFile) {
  try {
    const body = await readFile(join(folder, model.id, file.path));
    return body.byteLength === file.bytes && sha256(body) === file.sha256;
  } catch {
    return false;
  }
}

/**
 * Puts the files of both models in the folder, as `<folder>/<model>/<file>`, which is where the
 * analyser reads them: each downloaded from Hugging Face at its revision, and refused unless its
 * size and its SHA-256 are the ones above. A file already there as it should be is kept.
 */
export async function fetchModels(folder: string, log: (line: string) => void = () => {}) {
  for (const model of Object.values(MODELS) as Model[]) {
    for (const file of model.files) {
      if (await isKept(folder, model, file)) continue;
      const url = `https://huggingface.co/${model.id}/resolve/${model.revision}/${file.path}`;
      log(`Downloading ${model.id}/${file.path}`);
      const answer = await fetch(url, { headers: { "user-agent": "tonnr-worker" } });
      if (!answer.ok) throw new Error(`${url} answered ${answer.status}`);
      const body = new Uint8Array(await answer.arrayBuffer());
      if (body.byteLength !== file.bytes || sha256(body) !== file.sha256) {
        throw new Error(`${model.id}/${file.path} is not the file that was checked`);
      }
      const target = join(folder, model.id, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(`${target}.part`, body);
      await rename(`${target}.part`, target);
    }
  }
}

/** Whether every file of both models is in the folder as it was checked. */
export async function hasModels(folder: string) {
  for (const model of Object.values(MODELS) as Model[]) {
    for (const file of model.files) {
      if (!(await isKept(folder, model, file))) return false;
    }
  }
  return true;
}
