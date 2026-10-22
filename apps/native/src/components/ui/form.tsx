import {
  type AnyFormApi,
  createFormHook,
  createFormHookContexts,
  useStore,
} from "@tanstack/react-form";
import {
  type ComponentProps,
  type ComponentRef,
  createContext,
  type ReactNode,
  type Ref,
  type RefObject,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  AccessibilityInfo,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInput,
  View,
} from "react-native";
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from "react-native-keyboard-controller";

import { useTheme } from "@/lib/theme";

import { Button } from "./button";
import { feel } from "./haptics";
import { Field, type FieldHandle, Input, Textarea } from "./input";
import { Toggle, ToggleGroup } from "./toggle";

type ViewRef = ComponentRef<typeof View>;

// The forms of the app for phones, as the web's are made (decision 076, and decision 078 for the
// phone): TanStack Form, with adapters of the app's own kit. A form is made with `useAppForm`,
// checked by a Zod schema at `validators.onSubmit`, and says nothing before it is sent. Its
// fields are drawn by `field.Input`, `field.Textarea`, `field.Choice`, for a group of toggles,
// and `field.Control`, for a control the app draws itself, a rating, a size, the photos of a
// session, which it hands its value, its name and what is wrong. Its button is
// `form.SubmitButton`, which is never disabled to stop a wrong form and waits while it sends.
// Once sent, each wrong field says why under itself, the first takes the focus (a field typed in
// takes the keyboard, any other a screen reader) and is scrolled to when the form stands in a
// `FormScroll` and it is out of view, it shakes again when it was the first already, and the
// phone buzzes once. What the API refuses about a field is said under it with `refuseField`.

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

/** A field's fault as words, from what a schema or the API said of it. */
export function getFieldError(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return error == null ? undefined : String(error);
}

/**
 * Says under a field why the API refused what it holds, as the schema says why it is wrong: the
 * field is wrong, the form gives it the focus once sent, and the fault goes as soon as the field
 * changes. What refuses is the feature's to word (decision 076).
 */
export function refuseField(form: AnyFormApi, name: string, message: string) {
  form.setFieldMeta(name, (meta) => ({
    ...meta,
    isTouched: true,
    errorMap: { ...meta.errorMap, onSubmit: message },
  }));
}

// Where each field of a form stands, so that a send gives the first wrong one the focus. A form is
// known by its store: the form its fields are given is TanStack's own, and the one its context
// holds a copy of it with the kit's components, which share that store.
type Registered = {
  /** Gives it the focus: the keyboard to a field typed in, a screen reader to any other. */
  focus: () => void;
  handle: RefObject<FieldHandle | null>;
  order: number;
};
const fieldsOf = new WeakMap<object, Map<string, Registered>>();
let registered = 0;

function useRegistered(
  form: AnyFormApi,
  name: string,
  handle: RefObject<FieldHandle | null>,
  focus: () => void,
) {
  const focusRef = useRef(focus);
  focusRef.current = focus;
  useEffect(() => {
    let fields = fieldsOf.get(form.store);
    if (!fields) {
      fields = new Map();
      fieldsOf.set(form.store, fields);
    }
    const entry: Registered = { focus: () => focusRef.current(), handle, order: registered++ };
    fields.set(name, entry);
    return () => {
      if (fields.get(name) === entry) fields.delete(name);
    };
  }, [form.store, name, handle]);
}

/** Whether a field says something is wrong: touched, and not valid. */
function isWrong(form: AnyFormApi, name: string) {
  const meta = form.state.fieldMeta[name];
  return meta !== undefined && meta.isTouched && !meta.isValid;
}

/** Where a field stands on the screen, from the top. */
function topOf(view: ViewRef | null): Promise<number> {
  return new Promise((resolve) => {
    if (typeof view?.measureInWindow !== "function") return resolve(Number.POSITIVE_INFINITY);
    view.measureInWindow((_x, y) => resolve(Number.isFinite(y) ? y : Number.POSITIVE_INFINITY));
  });
}

/** The wrong fields of a form, the highest on the screen first. */
async function wrongFields(form: AnyFormApi) {
  const fields = fieldsOf.get(form.store);
  if (!fields) return [];
  const wrong = [...fields].filter(([name]) => isWrong(form, name));
  const placed = await Promise.all(
    wrong.map(async ([name, entry]) => ({
      name,
      entry,
      top: await topOf(entry.handle.current?.control ?? null),
    })),
  );
  return placed.sort((a, b) => a.top - b.top || a.entry.order - b.entry.order);
}

/** Moves a screen reader to `view`, which says itself. */
export function focusForReader(view: ViewRef | null) {
  if (view) AccessibilityInfo.sendAccessibilityEvent(view, "focus");
}

// The form's scroll view, which a field that takes no keyboard asks to be scrolled to.
type Reveal = (view: ViewRef | null) => void;
const RevealContext = createContext<Reveal | null>(null);

/**
 * The scroll view of a form: the keyboard's own (react-native-keyboard-controller), which keeps
 * the field written in above the keyboard, and which scrolls to a wrong field that takes no
 * keyboard when it stands out of view, as the web scrolls to it.
 */
export function FormScroll({
  ref,
  onScroll,
  onLayout,
  children,
  ...props
}: Omit<ComponentProps<typeof KeyboardAwareScrollView>, "ref"> & {
  ref?: Ref<KeyboardAwareScrollViewRef>;
}) {
  const { space } = useTheme();
  const own = useRef<KeyboardAwareScrollViewRef>(null);
  useImperativeHandle(ref, () => own.current as KeyboardAwareScrollViewRef, []);
  const offset = useRef(0);
  const height = useRef(0);

  const reveal: Reveal = (view) => {
    const scroll = own.current;
    const inner = scroll?.getInnerViewRef?.();
    if (!view || !scroll || !inner) return;
    view.measureLayout(inner as never, (_x, y, _width, tall) => {
      const top = offset.current;
      if (y >= top && y + tall <= top + height.current) return;
      scroll.scrollTo({ y: Math.max(0, y - space.l), animated: true });
    });
  };

  return (
    <RevealContext.Provider value={reveal}>
      <KeyboardAwareScrollView
        ref={own}
        keyboardShouldPersistTaps="handled"
        bottomOffset={space.l}
        scrollEventThrottle={16}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          offset.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
        onLayout={(event: LayoutChangeEvent) => {
          height.current = event.nativeEvent.layout.height;
          onLayout?.(event);
        }}
        {...props}
      >
        {children}
      </KeyboardAwareScrollView>
    </RevealContext.Provider>
  );
}

/**
 * Sends the form as its button does: the schema checks it, then the first wrong field takes the
 * focus, and shakes again when it was the first already. For a field's return key.
 */
export function useFormSend() {
  const form = useFormContext();
  return async () => {
    const before = (await wrongFields(form))[0]?.name;
    await form.handleSubmit();
    const wrong = await wrongFields(form);
    const first = wrong[0];
    if (!first) return;
    feel("failed");
    if (first.name === before) first.entry.handle.current?.shake();
    // After the frame the faults are drawn in, as the web waits for its own.
    requestAnimationFrame(() => first.entry.focus());
  };
}

type SubmitButtonProps = Omit<ComponentProps<typeof Button>, "onPress" | "loading"> & {
  /** Waiting for what the form waits on beyond its own send, as a file still going up. */
  pending?: boolean;
};

/** The button that sends a form, which waits while it is sent. */
function SubmitButton({ pending = false, ...props }: SubmitButtonProps) {
  const form = useFormContext();
  const send = useFormSend();
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  return <Button {...props} loading={isSubmitting || pending} onPress={() => void send()} />;
}

/** A field's name, its fault and what it says, as each adapter reads them. */
function useFieldShape() {
  const field = useFieldContext<unknown>();
  const meta = useStore(field.store, (state) => state.meta);
  const wrong = meta.isTouched && !meta.isValid;
  return { field, error: wrong ? getFieldError(meta.errors[0]) : undefined };
}

type FormInputProps = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChangeText" | "invalid" | "ref"
> & {
  label?: string;
  description?: string;
  ref?: Ref<ComponentRef<typeof TextInput>>;
};

/** A line of text the form holds. */
function FormInput({ label, description, ref, onBlur, ...props }: FormInputProps) {
  const { field, error } = useFieldShape();
  const handle = useRef<FieldHandle>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  useImperativeHandle(ref, () => input.current as ComponentRef<typeof TextInput>, []);
  useRegistered(field.form, field.name, handle, () => input.current?.focus());
  return (
    <Field label={label} description={description} error={error} handle={handle}>
      <Input
        ref={input}
        value={(field.state.value as string | undefined) ?? ""}
        onChangeText={(typed) => field.handleChange(typed)}
        onBlur={(event) => {
          field.handleBlur();
          onBlur?.(event);
        }}
        {...props}
      />
    </Field>
  );
}

/** Several lines of text the form holds. */
function FormTextarea({ label, description, ref, onBlur, ...props }: Omit<FormInputProps, "end">) {
  const { field, error } = useFieldShape();
  const handle = useRef<FieldHandle>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  useImperativeHandle(ref, () => input.current as ComponentRef<typeof TextInput>, []);
  useRegistered(field.form, field.name, handle, () => input.current?.focus());
  return (
    <Field label={label} description={description} error={error} handle={handle}>
      <Textarea
        ref={input}
        value={(field.state.value as string | undefined) ?? ""}
        onChangeText={(typed) => field.handleChange(typed)}
        onBlur={(event) => {
          field.handleBlur();
          onBlur?.(event);
        }}
        {...props}
      />
    </Field>
  );
}

type FormChoiceProps = {
  label?: string;
  /** The group's name where no label stands over it, as the line it edits names it already. */
  accessibilityLabel?: string;
  description?: string;
  /** Several toggles pressed at once: the field holds them all; else the one pressed, or none. */
  multiple?: boolean;
  disabled?: boolean;
  /** The step of the theme's type the toggles' words take, as `Toggle`'s. */
  size?: "s" | "m";
  /** The room between its name, its toggles and what it says. */
  gap?: number;
  options: readonly { value: string; label: string }[];
};

/** Words the form holds, chosen among toggles, as the web's `field.Choice`. */
function FormChoice({
  label,
  accessibilityLabel,
  description,
  multiple = false,
  disabled = false,
  size,
  gap,
  options,
}: FormChoiceProps) {
  const { field, error } = useFieldShape();
  const handle = useRef<FieldHandle>(null);
  const first = useRef<ViewRef>(null);
  const reveal = useContext(RevealContext);
  useRegistered(field.form, field.name, handle, () => {
    reveal?.(handle.current?.control ?? null);
    focusForReader(first.current);
  });
  const value = field.state.value as string[] | string | null | undefined;
  const pressed = Array.isArray(value) ? value : value == null ? [] : [value];
  return (
    <Field label={label} description={description} error={error} handle={handle} gap={gap}>
      <ToggleGroup label={label ?? accessibilityLabel ?? ""}>
        {options.map((option, index) => {
          const on = pressed.includes(option.value);
          return (
            <Toggle
              key={option.value}
              ref={index === 0 ? first : undefined}
              label={option.label}
              pressed={on}
              size={size}
              disabled={disabled}
              onPress={() => {
                const next = multiple
                  ? on
                    ? pressed.filter((word) => word !== option.value)
                    : [...pressed, option.value]
                  : on
                    ? null
                    : option.value;
                field.handleChange(next);
                field.handleBlur();
              }}
            />
          );
        })}
      </ToggleGroup>
    </Field>
  );
}

/** What a control the app draws itself is given: its value, what changes it, what names it. */
export type FormControlBinding<T> = {
  name: string;
  value: T;
  onChange: (value: T) => void;
  onBlur: () => void;
  invalid: boolean;
  /** Its name, for a screen reader. */
  label: string | undefined;
  /** What is wrong, or what it says, as a screen reader's hint. */
  hint: string | undefined;
  /** To be set on what a screen reader is moved to when the field is the first wrong one. */
  focusRef: RefObject<ViewRef | null>;
};

type FormControlProps<T> = {
  label?: string;
  description?: string;
  /** How its name stands: over the control, or beside it on one line. */
  layout?: "stacked" | "inline";
  gap?: number;
  style?: ComponentProps<typeof Field>["style"];
  children: (control: FormControlBinding<T>) => ReactNode;
};

/** Binds a control the app draws itself, as the web's `field.Control`. */
function FormControl<T>({ label, description, layout, gap, style, children }: FormControlProps<T>) {
  const { field, error } = useFieldShape();
  const handle = useRef<FieldHandle>(null);
  const focusRef = useRef<ViewRef>(null);
  const reveal = useContext(RevealContext);
  useRegistered(field.form, field.name, handle, () => {
    reveal?.(handle.current?.control ?? null);
    focusForReader(focusRef.current);
  });
  return (
    <Field
      label={label}
      description={description}
      error={error}
      layout={layout}
      gap={gap}
      style={style}
      handle={handle}
    >
      {children({
        name: field.name,
        value: field.state.value as T,
        onChange: (value) => field.handleChange(value as never),
        onBlur: field.handleBlur,
        invalid: error !== undefined,
        label,
        hint: error ?? description,
        focusRef,
      })}
    </Field>
  );
}

export const { useAppForm, withForm } = createFormHook({
  fieldComponents: {
    Choice: FormChoice,
    Control: FormControl,
    Input: FormInput,
    Textarea: FormTextarea,
  },
  formComponents: {
    SubmitButton,
  },
  fieldContext,
  formContext,
});

export type AppForm = ReturnType<typeof useAppForm>;

// What reads a form's state outside its fields, as a sheet that says whether anything changed.
export { useSelector, useStore } from "@tanstack/react-form";
