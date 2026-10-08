import type { ReactNode } from "react";

// The outline of a phone, to show a screen of the mobile app at its real width.
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="edge w-full max-w-[340px] rounded-(--radius-l) bg-neutral-2 p-xs [--edge-color:var(--neutral-4)]">
      <div className="edge overflow-hidden rounded-m bg-neutral-1 [--edge-color:var(--neutral-4)]">
        {children}
      </div>
    </div>
  );
}
