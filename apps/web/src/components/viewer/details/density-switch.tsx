import { Button } from "@repo/ui/components/ui/button";

import { type Density, lessDense, moreDense } from "@/lib/density";
import { m } from "@/paraglide/messages.js";

/**
 * Where a panel's reader asks for less of the forecast or more, in place: one step down or up
 * among the densities, which the account then keeps. Decision 061.
 */
export function DensitySwitch({
  density,
  onChange,
}: {
  density: Density;
  onChange: (next: Density) => void;
}) {
  const less = lessDense(density);
  const more = moreDense(density);
  return (
    <div className="flex justify-center gap-xs">
      {less && (
        <Button variant="ghost" size="xs" className="text-neutral-7" onClick={() => onChange(less)}>
          {m.density_less()}
        </Button>
      )}
      {more && (
        <Button variant="ghost" size="xs" className="text-neutral-7" onClick={() => onChange(more)}>
          {m.density_more()}
        </Button>
      )}
    </div>
  );
}
