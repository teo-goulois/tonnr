# 076. Forms

Status: decided on 2026-10-21, at Téo's request, after he asked why the forms did not follow his handbook's page on them, [teogoulois.com/code/web/ui/forms](https://teogoulois.com/code/web/ui/forms). Until then six forms of the two apps used TanStack Form directly, as the sign-in of the scaffold did, and nineteen kept their state by hand: no page of this repository named the handbook's, so each new form copied the nearest one.

## Decision

- A form of the web app or of the admin is made with `useAppForm`, from `@repo/ui/hooks/form/form`: the one TanStack Form setup of the apps, taken from the teogoulois registry (`form`) and given the Tonnr theme. It is sent through `form.Form`, which focuses its first wrong field, and its button is `form.SubmitButton`, pending while the form or the route saves.
- A form has three layers. The primitive, in `packages/ui/src/components/ui/` or a control an app draws itself, knows no form library. The adapter, in `packages/ui/src/components/form/`, binds a field and owns its label, its description, its error and their ARIA links. The feature owns the schema, the words, what is sent, and what the API refuses.
- The adapters are `field.Input` and `field.Textarea`, as the registry has them, `field.Choice` for a group of toggles, and `field.Control`, which binds a control an app draws itself, a rating, sizes chosen among pictures, the photos of a session, and hands it its value and what names and describes it. Such a control knows no form: it takes `aria-labelledby`, `aria-describedby` and `aria-invalid` like any control. A control that takes many props of its app passes through `field.Control` at each form; one that would only repeat its adapter's work at each gets an adapter of its own, in its app's `useAppForm`, through `extendForm`. Neither app has one yet.
- What reads a form's state outside its fields, `form.Subscribe` or `useSelector`, comes from the kit too.
- A form is checked by a Zod schema at `validators.onSubmit`. It says nothing before it is sent. Once sent, each wrong field says why under itself, the first takes the focus and is scrolled to only when it is out of view, and a field that becomes wrong shakes lightly, unless the reader asked for no motion. A field is checked earlier only where it helps, as a username that is taken.
- A button that sends is never disabled to stop a form that is wrong: the schema says why. It may be disabled while nothing was changed, or while a file is still going up.
- What the API refuses about a field is said under it with `refuseField`, and goes as soon as the field changes. A refusal about nothing in particular stays a toast.
- The registry's date and time picker and its code field are left out until a form asks for one.
- `.oxlintrc.json` refuses a raw `<form>` and an import of `@tanstack/react-form` other than a type in `apps/web/src` and `apps/admin/src`, with this decision's number, and `apps/web/src/lib/form-kit.test.ts` holds what the kit does. The rule against a `<form>` is the `react` plugin's: the override turns on that plugin for it alone, and turns off the plugin's other rules, which judge code this decision is not about.
- The alert editor keeps its draft in the rules of `packages/client/src/alerts/alert-words.ts`, which the phone's editor reads too: a part left alone follows the alert when it changes elsewhere, and what is written while a save is on its way stays. TanStack Form keeps no such draft. The editor is a form of the kit all the same: its name is a field that writes the draft, its sentence the field of the conditions, which the form holds as the draft says them, and its schema asks for a name and a sentence that asks something.

## Consequences

- `AGENTS.md` names the handbook's page and this decision where it speaks of the interface. A form written by hand fails `pnpm run check` before anyone reads it.
- The app for phones keeps its own forms and its own kit (decision 069): the handbook's page is the web's. Its forms take TanStack Form with adapters of its own kit, by decision 078.
- A form says more than it did. A button that stayed grey says why under a field once pressed, and a field that had a placeholder for a name has a label. A form whose adapter lays its description under the control, as the profile's questions do, says its hint after its choices.
