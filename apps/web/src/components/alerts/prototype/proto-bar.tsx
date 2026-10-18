// PROTOTYPE, throwaway: the switch between the variants, at the top of the alert sheet. It is
// drawn apart from the design on purpose: a dashed edge, and small type.

import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";

import type { OrVariant, TideVariant } from "./rules";
import { setProto, useProto } from "./state";

const TIDES: { value: TideVariant; label: string }[] = [
  { value: "a", label: "A Hauteur" },
  { value: "b", label: "B Moment" },
  { value: "c", label: "C Coef" },
  { value: "d", label: "D Cycle" },
];
const ORS: { value: OrVariant; label: string }[] = [
  { value: "1", label: "1 À la suite" },
  { value: "2", label: "2 Onglets" },
  { value: "3", label: "3 + par valeur" },
];

export function ProtoBar() {
  const proto = useProto();
  if (!proto.on) return null;
  return (
    <div className="mb-s grid gap-xs rounded-(--radius-s) p-xs text-xs outline-1 outline-neutral-6 outline-dashed">
      <div className="flex flex-wrap items-center gap-xs">
        <span className="text-neutral-7">Prototype</span>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="Éditeur"
          value={[proto.editor]}
          onValueChange={([pressed]) =>
            pressed && setProto({ editor: pressed as "proto" | "current" })
          }
        >
          <ToggleGroupItem value="proto">Nouveau</ToggleGroupItem>
          <ToggleGroupItem value="current">Actuel</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {proto.editor === "proto" && (
        <>
          <div className="flex flex-wrap items-center gap-xs">
            <span className="w-12 text-neutral-7">Marée</span>
            <ToggleGroup
              variant="outline"
              size="sm"
              aria-label="Variante de la marée"
              value={[proto.tide]}
              onValueChange={([pressed]) => pressed && setProto({ tide: pressed as TideVariant })}
            >
              {TIDES.map((one) => (
                <ToggleGroupItem key={one.value} value={one.value}>
                  {one.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex flex-wrap items-center gap-xs">
            <span className="w-12 text-neutral-7">Ou</span>
            <ToggleGroup
              variant="outline"
              size="sm"
              aria-label="Variante du ou"
              value={[proto.or]}
              onValueChange={([pressed]) => pressed && setProto({ or: pressed as OrVariant })}
            >
              {ORS.map((one) => (
                <ToggleGroupItem key={one.value} value={one.value}>
                  {one.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </>
      )}
    </div>
  );
}
