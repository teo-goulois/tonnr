import type { ReactNode } from "react";

import Header from "@/components/header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-svh grid-rows-[auto_1fr]">
      <Header />
      {children}
    </div>
  );
}
