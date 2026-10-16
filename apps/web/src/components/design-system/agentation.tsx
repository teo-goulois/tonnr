import { APP_NAME } from "@repo/config/app";
import { lazy, Suspense, useEffect, useState } from "react";

// Vite removes the import from production. These routes also retain their 404 guard.
const Toolbar = import.meta.env.DEV
  ? lazy(() => import("agentation").then(({ Agentation }) => ({ default: Agentation })))
  : null;

/** Local feedback for the two component pages, outside the canvas transform. */
export function DesignSystemAgentation() {
  const [mounted, setMounted] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    setMounted(true);

    // Use Agentation's public portal option to keep annotations usable inside a modal's
    // focus boundary. Reading the active popup leaves the preview components untouched.
    const findContainer = () => {
      const popups = document.querySelectorAll<HTMLElement>(
        '[data-slot="dialog-popup"][data-open], [data-slot="drawer-popup"][data-open]',
      );
      setContainer(popups.item(popups.length - 1));
    };
    findContainer();
    const observer = new MutationObserver(findContainer);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-open"],
    });
    return () => observer.disconnect();
  }, []);

  return mounted && Toolbar ? (
    <Suspense fallback={null}>
      <Toolbar
        // Base UI may already have hidden the former body portal from assistive technology.
        // A new host inside the modal starts with the right boundary; saved notes stay local.
        key={container?.id ?? "page"}
        appName={APP_NAME}
        enableKeyboardShortcuts={false}
        portalContainer={container}
      />
    </Suspense>
  ) : null;
}
