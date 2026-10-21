"use client";

// The one TanStack Form setup of the apps, from the teogoulois registry (`form`) and the
// handbook's page on forms (teogoulois.com/code/web/ui/forms): a form is made with `useAppForm`,
// sent through `form.Form`, and each of its fields is drawn by an adapter, `field.Input` and the
// others below. An app that draws controls of its own adds their adapters with `extendForm`, in
// one file of its own. Decision 076.
//
// The registry's date and time picker and its code field are left out: no form here asks for
// them. Add them from the registry the day one does.

import { createFormHook } from "@tanstack/react-form";

import { FormChoice } from "../../components/form/form-choice";
import { FormControl } from "../../components/form/form-control";
import { FormForm } from "../../components/form/form-form";
import { FormInput } from "../../components/form/form-input";
import { FormTextarea } from "../../components/form/form-textarea";
import { SubmitButton } from "../../components/form/submit-button";
import { fieldContext, formContext } from "./form-context";

export const { useAppForm, withForm, extendForm } = createFormHook({
  fieldComponents: {
    Choice: FormChoice,
    Control: FormControl,
    Input: FormInput,
    Textarea: FormTextarea,
  },
  formComponents: {
    Form: FormForm,
    SubmitButton,
  },
  fieldContext,
  formContext,
});

export type AppForm = ReturnType<typeof useAppForm>;
