import { Button, type ButtonProps } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { Toggle } from "@repo/ui/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@repo/ui/components/ui/tabs";
import {
  Popover,
  PopoverTrigger,
  PopoverPopup,
  PopoverTitle,
  PopoverDescription,
} from "@repo/ui/components/ui/popover";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerPanel,
} from "@repo/ui/components/ui/drawer";
import { Slider } from "@repo/ui/components/ui/slider";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "@repo/ui/components/ui/menu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
  TooltipProvider,
} from "@repo/ui/components/ui/tooltip-popup";
import { PlusIcon } from "@repo/ui/icon";
import type { ReactNode } from "react";

// Records make a new public named variant a type error until its example is added.
export const BUTTON_VARIANTS = {
  default: true,
  outline: true,
  secondary: true,
  tertiary: true,
  ghost: true,
  destructive: true,
  link: true,
} satisfies Record<NonNullable<ButtonProps["variant"]>, true>;
export const BUTTON_SIZES = {
  xs: true,
  sm: true,
  default: true,
  lg: true,
  xl: true,
  "icon-xs": true,
  "icon-sm": true,
  icon: true,
  "icon-lg": true,
  "icon-xl": true,
} satisfies Record<NonNullable<ButtonProps["size"]>, true>;
export const FIELD_SIZES = ["sm", "default", "lg"] as const;
export const SIDES = ["top", "right", "bottom", "left"] as const;
export const ALIGNMENTS = ["start", "center", "end"] as const;
export const OMISSIONS = [
  "Account panel, BottomNav and shortcut settings: nested account hooks lack an isolated fixture API.",
  "Responsive cases use the real viewport; the canvas does not simulate component breakpoints.",
  "Inherited fixtures show useful product compositions, not every possible data or prop combination.",
  "Raw unstyled/native-input escape hatches, numeric HTML field sizes, custom render slots and arbitrary icon artwork are not design variants.",
  "Drawer snap-point combinations, nested menus and every overlay collision fallback are not exhaustively enumerated.",
] as const;

function Comparison({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-m">
      <h3 className="text-s text-neutral-7">{title}</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-start gap-l">
        {children}
      </div>
    </div>
  );
}
function Example({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 justify-items-start gap-xs">
      <span className="text-xs text-neutral-7">{label}</span>
      {children}
    </div>
  );
}
export function CanvasButtonSamples() {
  return (
    <>
      <Comparison title="Style">
        {(Object.keys(BUTTON_VARIANTS) as (keyof typeof BUTTON_VARIANTS)[]).map((variant) => (
          <Example key={variant} label={variant}>
            <Button variant={variant}>Continue</Button>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Size">
        {(Object.keys(BUTTON_SIZES) as (keyof typeof BUTTON_SIZES)[])
          .filter((size) => !size.startsWith("icon"))
          .map((size) => (
            <Example key={size} label={size}>
              <Button variant="default" size={size}>
                Continue
              </Button>
            </Example>
          ))}
      </Comparison>
      <Comparison title="Icon size">
        {(Object.keys(BUTTON_SIZES) as (keyof typeof BUTTON_SIZES)[])
          .filter((size) => size.startsWith("icon"))
          .map((size) => (
            <Example key={size} label={size}>
              <Button variant="default" size={size} aria-label="Continue">
                <PlusIcon data-slot="icon" aria-hidden />
              </Button>
            </Example>
          ))}
      </Comparison>
      <Comparison title="State">
        <Example label="Enabled">
          <Button>Continue</Button>
        </Example>
        <Example label="Disabled">
          <Button disabled>Continue</Button>
        </Example>
        <Example label="Pending">
          <Button isPending>Continue</Button>
        </Example>
        <Example label="Pending and interactive">
          <Button isPending pendingDisables={false}>
            Continue
          </Button>
        </Example>
        <Example label="Pending content">
          <Button isPending pendingContent="Saving…">
            Continue
          </Button>
        </Example>
      </Comparison>
      <Comparison title="Icon placement">
        <Example label="None">
          <Button>Continue</Button>
        </Example>
        <Example label="Leading">
          <Button>
            <PlusIcon data-slot="icon" aria-hidden />
            Continue
          </Button>
        </Example>
        <Example label="Trailing">
          <Button>
            Continue
            <PlusIcon data-slot="icon" aria-hidden />
          </Button>
        </Example>
        <Example label="Both">
          <Button>
            <PlusIcon data-slot="icon" aria-hidden />
            Continue
            <PlusIcon data-slot="icon" aria-hidden />
          </Button>
        </Example>
      </Comparison>
    </>
  );
}
export function CanvasFieldSamples() {
  return (
    <>
      <Comparison title="Input size">
        {FIELD_SIZES.map((size) => (
          <Example key={size} label={size}>
            <Input size={size} aria-label={`Spot name ${size}`} placeholder="Spot name" />
          </Example>
        ))}
      </Comparison>
      <Comparison title="Input state">
        <Example label="Default">
          <Input aria-label="Default spot" defaultValue="La Torche" />
        </Example>
        <Example label="Invalid">
          <Input aria-label="Invalid spot" defaultValue="La Torche" aria-invalid />
        </Example>
        <Example label="Disabled">
          <Input aria-label="Disabled spot" defaultValue="La Torche" disabled />
        </Example>
        <Example label="Read only">
          <Input aria-label="Read only spot" defaultValue="La Torche" readOnly />
        </Example>
      </Comparison>
      <Comparison title="Input type">
        {(["text", "search", "password", "file"] as const).map((type) => (
          <Example key={type} label={type}>
            <Input type={type} aria-label={`Spot ${type}`} />
          </Example>
        ))}
      </Comparison>
      <Comparison title="Textarea size">
        {FIELD_SIZES.map((size) => (
          <Example key={size} label={size}>
            <Textarea size={size} aria-label={`Notes ${size}`} placeholder="Session notes" />
          </Example>
        ))}
      </Comparison>
      <Comparison title="Textarea state">
        <Example label="Default">
          <Textarea aria-label="Editable notes" defaultValue="A clean morning." />
        </Example>
        <Example label="Invalid">
          <Textarea aria-label="Invalid notes" defaultValue="A clean morning." aria-invalid />
        </Example>
        <Example label="Disabled">
          <Textarea aria-label="Disabled notes" defaultValue="A clean morning." disabled />
        </Example>
        <Example label="Read only">
          <Textarea aria-label="Read only notes" defaultValue="A clean morning." readOnly />
        </Example>
      </Comparison>
    </>
  );
}
export function CanvasVariantSamples() {
  return (
    <>
      <Comparison title="Toggle style">
        {(["default", "outline"] as const).map((variant) => (
          <Example key={variant} label={variant}>
            <Toggle variant={variant}>Sand</Toggle>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Toggle size">
        {(["sm", "default"] as const).map((size) => (
          <Example key={size} label={size}>
            <Toggle variant="default" size={size}>
              Sand
            </Toggle>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Toggle group selection">
        {[false, true].map((multiple) => (
          <Example key={String(multiple)} label={multiple ? "Multiple" : "Single"}>
            <ToggleGroup
              variant="default"
              multiple={multiple}
              defaultValue={["low"]}
              aria-label={multiple ? "Multiple tides" : "Single tide"}
            >
              {["low", "mid", "high"].map((tide) => (
                <ToggleGroupItem key={tide} value={tide}>
                  {tide}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Toggle group orientation">
        {(["horizontal", "vertical"] as const).map((orientation) => (
          <Example key={orientation} label={orientation}>
            <ToggleGroup
              variant="default"
              orientation={orientation}
              defaultValue={["low"]}
              aria-label={`${orientation} tides`}
            >
              {["low", "mid", "high"].map((tide) => (
                <ToggleGroupItem key={tide} value={tide}>
                  {tide}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Tabs style">
        {(["underline", "segment"] as const).map((variant) => (
          <Example key={variant} label={variant}>
            <Tabs defaultValue="forecast">
              <TabsList variant={variant}>
                <TabsTab value="forecast">Forecast</TabsTab>
                <TabsTab value="guide">Guide</TabsTab>
              </TabsList>
              <TabsPanel value="forecast">The week ahead.</TabsPanel>
              <TabsPanel value="guide">The surf guide.</TabsPanel>
            </Tabs>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Popover placement">
        {SIDES.map((side) => (
          <Example key={side} label={side}>
            <Popover>
              <PopoverTrigger render={<Button variant="outline" />}>Open preview</PopoverTrigger>
              <PopoverPopup side={side}>
                <PopoverTitle>Forecast</PopoverTitle>
                <PopoverDescription>The week ahead.</PopoverDescription>
              </PopoverPopup>
            </Popover>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Popover alignment">
        {ALIGNMENTS.map((align) => (
          <Example key={align} label={align}>
            <Popover>
              <PopoverTrigger render={<Button variant="outline" />}>Open preview</PopoverTrigger>
              <PopoverPopup side="bottom" align={align}>
                <PopoverTitle>Forecast</PopoverTitle>
                <PopoverDescription>The week ahead.</PopoverDescription>
              </PopoverPopup>
            </Popover>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Popover modality">
        {[false, true].map((modal) => (
          <Example key={String(modal)} label={modal ? "Modal" : "Non-modal"}>
            <Popover modal={modal}>
              <PopoverTrigger render={<Button variant="outline" />}>Open preview</PopoverTrigger>
              <PopoverPopup>
                <PopoverTitle>Forecast</PopoverTitle>
                <PopoverDescription>The week ahead.</PopoverDescription>
              </PopoverPopup>
            </Popover>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Drawer direction">
        {(["up", "right", "down", "left"] as const).map((swipeDirection) => (
          <Example key={swipeDirection} label={swipeDirection}>
            <Drawer swipeDirection={swipeDirection}>
              <DrawerTrigger render={<Button variant="outline" />}>Open preview</DrawerTrigger>
              <DrawerContent showCloseButton>
                <DrawerHeader>
                  <DrawerTitle>Forecast</DrawerTitle>
                  <DrawerDescription>The week ahead.</DrawerDescription>
                </DrawerHeader>
                <DrawerPanel>
                  <Input aria-label={`${swipeDirection} drawer notes`} placeholder="Notes" />
                </DrawerPanel>
              </DrawerContent>
            </Drawer>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Drawer style">
        {(["inset", "edge"] as const).map((variant) => (
          <Example key={variant} label={variant}>
            <Drawer>
              <DrawerTrigger render={<Button variant="outline" />}>Open preview</DrawerTrigger>
              <DrawerContent variant={variant} showCloseButton>
                <DrawerHeader>
                  <DrawerTitle>Forecast</DrawerTitle>
                  <DrawerDescription>The week ahead.</DrawerDescription>
                </DrawerHeader>
                <DrawerPanel>Waves 1.8 m at 12 s.</DrawerPanel>
              </DrawerContent>
            </Drawer>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Slider orientation">
        {(["horizontal", "vertical"] as const).map((orientation) => (
          <Example key={orientation} label={orientation}>
            <div className="h-48 w-40">
              <Slider
                orientation={orientation}
                defaultValue={30}
                getAriaLabel={() => `${orientation} value`}
              />
            </div>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Tabs orientation">
        {(["horizontal", "vertical"] as const).map((orientation) => (
          <Example key={orientation} label={orientation}>
            <Tabs orientation={orientation} defaultValue="forecast">
              <TabsList variant="underline">
                <TabsTab value="forecast">Forecast</TabsTab>
                <TabsTab value="guide">Guide</TabsTab>
              </TabsList>
              <TabsPanel value="forecast">The week ahead.</TabsPanel>
              <TabsPanel value="guide">The surf guide.</TabsPanel>
            </Tabs>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Toggle group style">
        {(["default", "outline"] as const).map((variant) => (
          <Example key={variant} label={variant}>
            <ToggleGroup variant={variant} defaultValue={["low"]} aria-label={`${variant} tides`}>
              {["low", "mid"].map((tide) => (
                <ToggleGroupItem key={tide} value={tide}>
                  {tide}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Toggle group size">
        {(["sm", "default"] as const).map((size) => (
          <Example key={size} label={size}>
            <ToggleGroup
              variant="default"
              size={size}
              defaultValue={["low"]}
              aria-label={`${size} tides`}
            >
              {["low", "mid"].map((tide) => (
                <ToggleGroupItem key={tide} value={tide}>
                  {tide}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Menu placement">
        {SIDES.map((side) => (
          <Example key={side} label={side}>
            <Menu>
              <MenuTrigger render={<Button variant="outline" />}>Open preview</MenuTrigger>
              <MenuPopup side={side}>
                <MenuItem>Edit</MenuItem>
                <MenuItem disabled>Share</MenuItem>
                <MenuItem variant="destructive">Delete</MenuItem>
              </MenuPopup>
            </Menu>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Menu alignment">
        {ALIGNMENTS.map((align) => (
          <Example key={align} label={align}>
            <Menu>
              <MenuTrigger render={<Button variant="outline" />}>Open preview</MenuTrigger>
              <MenuPopup side="bottom" align={align}>
                <MenuItem>Edit</MenuItem>
                <MenuItem disabled>Share</MenuItem>
                <MenuItem variant="destructive">Delete</MenuItem>
              </MenuPopup>
            </Menu>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Menu modality">
        {[false, true].map((modal) => (
          <Example key={String(modal)} label={modal ? "Modal" : "Non-modal"}>
            <Menu modal={modal}>
              <MenuTrigger render={<Button variant="outline" />}>Open preview</MenuTrigger>
              <MenuPopup>
                <MenuItem>Edit</MenuItem>
                <MenuItem disabled>Share</MenuItem>
                <MenuItem variant="destructive">Delete</MenuItem>
              </MenuPopup>
            </Menu>
          </Example>
        ))}
      </Comparison>
      <Comparison title="Tooltip placement">
        <TooltipProvider>
          {SIDES.map((side) => (
            <Example key={side} label={side}>
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" />}>Open preview</TooltipTrigger>
                <TooltipPopup side={side}>The week ahead.</TooltipPopup>
              </Tooltip>
            </Example>
          ))}
        </TooltipProvider>
      </Comparison>
      <Comparison title="Tooltip alignment">
        <TooltipProvider>
          {ALIGNMENTS.map((align) => (
            <Example key={align} label={align}>
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" />}>Open preview</TooltipTrigger>
                <TooltipPopup side="top" align={align}>
                  The week ahead.
                </TooltipPopup>
              </Tooltip>
            </Example>
          ))}
        </TooltipProvider>
      </Comparison>
      <Comparison title="Drawer modality">
        {([true, false, "trap-focus"] as const).map((modal) => (
          <Example key={String(modal)} label={String(modal)}>
            <Drawer modal={modal}>
              <DrawerTrigger render={<Button variant="outline" />}>Open preview</DrawerTrigger>
              <DrawerContent showCloseButton>
                <DrawerHeader>
                  <DrawerTitle>Forecast</DrawerTitle>
                  <DrawerDescription>The week ahead.</DrawerDescription>
                </DrawerHeader>
                <DrawerPanel>
                  <Input aria-label={`${modal} drawer notes`} placeholder="Notes" />
                </DrawerPanel>
              </DrawerContent>
            </Drawer>
          </Example>
        ))}
      </Comparison>
      <div className="grid gap-xs text-s text-neutral-7">
        <h3>Coverage limits</h3>
        {OMISSIONS.map((omission) => (
          <p key={omission}>{omission}</p>
        ))}
      </div>
    </>
  );
}
