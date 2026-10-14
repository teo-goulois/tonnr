import { Dialog, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useState } from "react";

import type { Candidate } from "@/lib/api";
import { m } from "@/paraglide/messages.js";
import { client } from "@/utils/orpc";

type Figure = Candidate["figures"][number];
type Box = [number, number, number, number];

const WHOLE: Box = [0, 0, 1, 1];
// How much of the page shows around a label, in fractions of the page: enough to see the coast
// it stands on.
const AROUND = { x: 0.2, y: 0.14 };

/** The part of a picture to show first: around the label when there is one, within the crop. */
function focusOf(crop: Box, mark: Box | undefined): Box {
  if (!mark) return crop;
  return [
    Math.max(crop[0], mark[0] - AROUND.x),
    Math.max(crop[1], mark[1] - AROUND.y),
    Math.min(crop[2], mark[2] + AROUND.x),
    Math.min(crop[3], mark[3] + AROUND.y),
  ];
}

/** A picture of a list's, as an address the page can show, for as long as the page shows it. */
function usePicture(list: string, name: string) {
  const file = useQuery({
    queryKey: ["candidate-image", list, name],
    queryFn: () => client.v1.candidates.image({ list, name }),
    staleTime: Number.POSITIVE_INFINITY,
    meta: { quiet: true },
  });
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    if (!file.data) return;
    const made = URL.createObjectURL(file.data);
    setAddress(made);
    return () => URL.revokeObjectURL(made);
  }, [file.data]);
  return { address, isError: file.isError };
}

// A part of a box, in fractions of another: where the label stands in the part shown.
function within(box: Box, part: Box): CSSProperties {
  const width = box[2] - box[0];
  const height = box[3] - box[1];
  return {
    left: `${((part[0] - box[0]) / width) * 100}%`,
    top: `${((part[1] - box[1]) / height) * 100}%`,
    width: `${((part[2] - part[0]) / width) * 100}%`,
    height: `${((part[3] - part[1]) / height) * 100}%`,
  };
}

/** The part of a picture that a box says, with its mark. */
function Cropped({
  address,
  size,
  crop,
  mark,
  alt,
}: {
  address: string;
  size: { width: number; height: number };
  crop: Box;
  mark: Box | undefined;
  alt: string;
}) {
  const width = crop[2] - crop[0];
  const height = crop[3] - crop[1];
  return (
    <div
      className="relative w-full overflow-hidden rounded-xs bg-neutral-3"
      style={{ aspectRatio: `${width * size.width} / ${height * size.height}` }}
    >
      <img
        src={address}
        alt={alt}
        className="absolute max-w-none"
        style={{
          width: `${100 / width}%`,
          left: `${(-crop[0] / width) * 100}%`,
          top: `${(-crop[1] / height) * 100}%`,
        }}
      />
      {mark && (
        <span
          aria-hidden
          className="absolute bg-warning-transparent shadow-[0_0_0_var(--border-l)_var(--warning)]"
          style={within(crop, mark)}
        />
      )}
    </div>
  );
}

/**
 * A picture of the list's own, such as the page of a guide's map where the break is drawn: the
 * part around it, with its label marked. A press shows the whole page.
 */
export function ListFigure({ list, figure, alt }: { list: string; figure: Figure; alt: string }) {
  const { address, isError } = usePicture(list, figure.image);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [isOpen, setOpen] = useState(false);

  if (isError) return <p className="text-neutral-7">{m.catalogue_figure_missing()}</p>;
  if (!address) return <Skeleton className="aspect-[4/3] w-full rounded-xs" />;

  return (
    <figure className="grid gap-xxs">
      {/* The picture is measured once, then shown as its box says. */}
      {!size && (
        <img
          src={address}
          alt=""
          className="hidden"
          onLoad={(event) =>
            setSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
        />
      )}
      {size ? (
        <button
          type="button"
          className="focus-ring cursor-zoom-in rounded-xs"
          aria-label={m.catalogue_figure_open()}
          onClick={() => setOpen(true)}
        >
          <Cropped
            address={address}
            size={size}
            crop={focusOf(
              (figure.crop as Box | undefined) ?? WHOLE,
              figure.mark as Box | undefined,
            )}
            mark={figure.mark as Box | undefined}
            alt={alt}
          />
        </button>
      ) : (
        <Skeleton className="aspect-[4/3] w-full rounded-xs" />
      )}
      {figure.caption && (
        <figcaption className="text-s text-neutral-7">{figure.caption}</figcaption>
      )}
      {size && (
        <Dialog open={isOpen} onOpenChange={setOpen}>
          <DialogPopup className="w-full max-w-5xl gap-s p-m">
            <DialogTitle>{figure.caption ?? alt}</DialogTitle>
            <div className="max-h-[80svh] overflow-auto">
              <Cropped
                address={address}
                size={size}
                crop={WHOLE}
                mark={figure.mark as Box | undefined}
                alt={alt}
              />
            </div>
          </DialogPopup>
        </Dialog>
      )}
    </figure>
  );
}
