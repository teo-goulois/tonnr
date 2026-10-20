// The Worker of updates: what the app for phones asks at each start, answered from the bucket of
// the updates, which it reads and never writes. It holds no key and logs nothing: the stack
// turns its logs off too (`packages/infra/alchemy.run.ts`). The files of an update are served by
// the bucket's own domain, not here. Decision 075.
import { SIGNATURE_METADATA } from "./bucket.ts";
import { type Store, answer } from "./protocol.ts";

export type Env = { BUCKET: R2Bucket };

/** The bucket, read as the protocol reads a store. */
export const bucketStore = (bucket: R2Bucket): Store => ({
  async get(key) {
    const object = await bucket.get(key);
    if (!object) return null;
    return {
      body: new Uint8Array(await object.arrayBuffer()),
      signature: object.customMetadata?.[SIGNATURE_METADATA] ?? null,
    };
  },
});

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return answer(request, bucketStore(env.BUCKET));
  },
};
