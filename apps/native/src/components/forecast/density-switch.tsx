import { lessDense, moreDense } from "@repo/client/density";
import { View } from "react-native";

import type { Density } from "@/components/account/display";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/**
 * Where a panel's reader asks for less of the forecast or more, in place: one step down or up
 * among the densities, which the account then keeps. Decision 061. The web's `DensitySwitch`.
 */
export function DensitySwitch({
  density,
  onChange,
}: {
  density: Density;
  onChange: (next: Density) => void;
}) {
  const { space } = useTheme();
  const less = lessDense(density);
  const more = moreDense(density);
  const change = (next: Density) => {
    feel("select");
    onChange(next);
  };
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: space.xs }}>
      {less && (
        <Button variant="ghost" onPress={() => change(less)}>
          {m.density_less()}
        </Button>
      )}
      {more && (
        <Button variant="ghost" onPress={() => change(more)}>
          {m.density_more()}
        </Button>
      )}
    </View>
  );
}
