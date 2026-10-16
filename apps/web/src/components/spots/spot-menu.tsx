import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { Label } from "@repo/ui/components/ui/label";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@repo/ui/components/ui/menu";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { MoreHorizontalIcon } from "@repo/ui/icon";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useId, useState } from "react";

import { m } from "@/paraglide/messages.js";

import type { Spot } from "../viewer/types";

// A word for the moderator, as long as the API takes it.
const NOTE_MOST = 280;

type SpotActionsProps = {
  spot: Spot;
  // Opens what renames the spot and moves its marker.
  onEdit: () => void;
  // Asks that the spot be made public, with a word for the moderator. `done` once it is asked.
  onPublish: (note: string, done: () => void) => void;
  onCancelPublication: () => void;
  // True while the API is asked about the spot's publication: it is not asked twice.
  isAsking: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  // What a phone does there too, which a wide screen has buttons for: the menu shows it first.
  children?: ReactNode;
};

/**
 * What the owner of a spot does with it from its panel: rename or move it, ask that it be made
 * public, and delete it. The last two are confirmed in a dialog.
 */
export function SpotActions({
  spot,
  onEdit,
  onPublish,
  onCancelPublication,
  isAsking,
  isDeleting,
  onDelete,
  children,
}: SpotActionsProps) {
  const [dialog, setDialog] = useState<"publish" | "delete" | null>(null);
  const [note, setNote] = useState("");
  const noteId = useId();
  const status = spot.publication?.status;

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={m.spot_menu({ name: spot.name })}
              isPending={isDeleting}
              disabled={isDeleting}
            />
          }
        >
          <MoreHorizontalIcon data-slot="icon" aria-hidden />
        </MenuTrigger>
        <MenuPopup align="end" className="min-w-56">
          {children && (
            <>
              {children}
              <MenuSeparator />
            </>
          )}
          <MenuItem onClick={onEdit}>{m.spot_edit()}</MenuItem>
          {status === "pending" ? (
            <MenuItem disabled={isAsking} onClick={onCancelPublication}>
              {m.spot_publish_cancel()}
            </MenuItem>
          ) : (
            // A spot that is public already is not asked for again.
            status !== "accepted" && (
              <MenuItem onClick={() => setDialog("publish")}>{m.spot_publish()}</MenuItem>
            )
          )}
          <MenuSeparator />
          <MenuItem variant="destructive" onClick={() => setDialog("delete")}>
            {m.action_delete()}
          </MenuItem>
        </MenuPopup>
      </Menu>

      <Dialog open={dialog === "publish"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogPopup className="w-full max-w-md gap-l p-l">
          <div className="grid gap-xs">
            <DialogTitle>{m.spot_publish_title({ name: spot.name })}</DialogTitle>
            <DialogDescription>{m.spot_publish_what()}</DialogDescription>
          </div>
          <form
            className="grid gap-l"
            onSubmit={(event) => {
              event.preventDefault();
              if (isAsking) return;
              onPublish(note.trim(), () => {
                setDialog(null);
                setNote("");
              });
            }}
          >
            <p className="text-s text-neutral-7">{m.spot_publish_then()}</p>
            <div className="grid gap-xs">
              <Label htmlFor={noteId}>{m.spot_publish_note()}</Label>
              <Textarea
                id={noteId}
                value={note}
                maxLength={NOTE_MOST}
                rows={2}
                placeholder={m.spot_publish_note_placeholder()}
                disabled={isAsking}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <p className="text-s text-neutral-7">
              {m.spot_publish_license()}{" "}
              <Link
                to="/terms"
                target="_blank"
                className="focus-ring rounded-xs underline underline-offset-2 hover:text-neutral-10"
              >
                {m.terms_title()}
              </Link>
            </p>
            <div className="flex flex-wrap justify-end gap-xs">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                {m.action_cancel()}
              </Button>
              <Button type="submit" isPending={isAsking}>
                {m.spot_publish_send()}
              </Button>
            </div>
          </form>
        </DialogPopup>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogPopup className="w-full max-w-md gap-l p-l">
          <div className="grid gap-xs">
            <DialogTitle>{m.spot_delete_title({ name: spot.name })}</DialogTitle>
            <DialogDescription>
              {status === "accepted" ? m.spot_delete_text_public() : m.spot_delete_text()}
            </DialogDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-xs">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {m.action_cancel()}
            </Button>
            <Button
              variant="destructive"
              aria-label={m.spot_delete({ name: spot.name })}
              onClick={() => {
                setDialog(null);
                onDelete();
              }}
            >
              {m.action_delete()}
            </Button>
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
}
