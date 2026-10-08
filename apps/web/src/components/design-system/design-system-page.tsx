import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Kbd } from "@repo/ui/components/ui/kbd";
import { Label } from "@repo/ui/components/ui/label";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@repo/ui/components/ui/menu";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { ArrowRightIcon, PlusIcon } from "@repo/ui/icon";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { ShortcutKeys } from "@/components/shared/shortcut-keys";
import { openShortcutSettings } from "@/components/shared/shortcut-settings";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useShortcuts } from "@/lib/shortcuts";

const VARIANTS = [
  "default",
  "outline",
  "secondary",
  "tertiary",
  "ghost",
  "destructive",
  "link",
] as const;
const SIZES = ["xs", "sm", "default", "lg", "xl"] as const;
const ICON_SIZES = ["icon-xs", "icon-sm", "icon", "icon-lg", "icon-xl"] as const;
const TEXT_STEPS = [
  "text-xxl",
  "text-xl",
  "text-l",
  "text-m",
  "text-s",
  "text-xs",
  "text-xxs",
] as const;
const NEUTRALS = [
  "bg-neutral-1",
  "bg-neutral-2",
  "bg-neutral-3",
  "bg-neutral-4",
  "bg-neutral-5",
  "bg-neutral-6",
  "bg-neutral-7",
  "bg-neutral-8",
  "bg-neutral-9",
  "bg-neutral-10",
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-m">
      <h2 className="text-l font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-xs">{children}</div>;
}

// Every shared component with its variants and states. Development only.
export function DesignSystemPage() {
  const bindings = useShortcuts();

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-xxl px-m py-xl">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Design system</h1>
        <ThemeToggle label="Switch between light and dark" />
      </header>

      <Section title="Colors">
        <div className="edge flex overflow-hidden rounded-xs">
          {NEUTRALS.map((neutral) => (
            <span key={neutral} className={`h-12 flex-1 ${neutral}`} />
          ))}
        </div>
        <Row>
          <span className="size-8 rounded-full bg-color-1" />
          <span className="size-8 rounded-full bg-success" />
          <span className="size-8 rounded-full bg-warning" />
          <span className="size-8 rounded-full bg-error" />
        </Row>
      </Section>

      <Section title="Type">
        <div className="grid gap-xs">
          {TEXT_STEPS.map((step) => (
            <p key={step} className={step}>
              {step} · Swell 1.8 m at 12 s
            </p>
          ))}
          <p className="font-mono">font-mono · 1.8 m · 12 s · WNW</p>
        </div>
      </Section>

      <Section title="Button">
        {VARIANTS.map((variant) => (
          <Row key={variant}>
            <Button variant={variant}>{variant}</Button>
            <Button variant={variant}>
              <PlusIcon data-slot="icon" aria-hidden />
              With icon
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} isPending>
              Pending
            </Button>
          </Row>
        ))}
        <Row>
          {SIZES.map((size) => (
            <Button key={size} size={size}>
              {size}
              <ArrowRightIcon data-slot="icon" aria-hidden />
            </Button>
          ))}
        </Row>
        <Row>
          {ICON_SIZES.map((size) => (
            <Button key={size} size={size} variant="secondary" aria-label={size}>
              <PlusIcon data-slot="icon" aria-hidden />
            </Button>
          ))}
        </Row>
      </Section>

      <Section title="Field">
        <div className="grid max-w-sm gap-m">
          <div className="grid gap-xs">
            <Label htmlFor="ds-name">Spot name</Label>
            <Input id="ds-name" placeholder="La Torche" />
          </div>
          <Input aria-label="Invalid" aria-invalid defaultValue="Invalid value" />
          <Input aria-label="Disabled" disabled defaultValue="Disabled" />
          <Input aria-label="Small" size="sm" placeholder="Small" />
          <Input aria-label="Large" size="lg" placeholder="Large" />
          <Textarea aria-label="Notes" placeholder="Notes" />
        </div>
      </Section>

      <Section title="Menu">
        <Row>
          <Menu>
            <MenuTrigger render={<Button variant="outline" />}>Open menu</MenuTrigger>
            <MenuPopup align="start">
              <MenuGroup>
                <MenuGroupLabel>Spot</MenuGroupLabel>
                <MenuItem>Edit</MenuItem>
                <MenuItem>Share</MenuItem>
                <MenuItem disabled>Duplicate</MenuItem>
                <MenuSeparator />
                <MenuItem variant="destructive">Delete</MenuItem>
              </MenuGroup>
            </MenuPopup>
          </Menu>
        </Row>
      </Section>

      <Section title="Overlays">
        <Row>
          <Button variant="outline" onClick={openShortcutSettings}>
            Open a dialog
          </Button>
          <Button
            variant="outline"
            onClick={() => toast("Spot saved", { description: "La Torche is in your spots." })}
          >
            Show a toast
          </Button>
          <span className="flex items-center gap-xs text-neutral-7">
            Command palette
            <ShortcutKeys hotkey={bindings["command-palette"]} />
          </span>
        </Row>
      </Section>

      <Section title="Feedback">
        <Row>
          <Spinner />
          <Kbd>D</Kbd>
          <Skeleton className="h-9 w-40" />
        </Row>
      </Section>
    </main>
  );
}
