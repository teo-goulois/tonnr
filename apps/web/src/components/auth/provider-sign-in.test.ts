import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ providers: vi.fn(), social: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { $fetch: auth.providers, signIn: { social: auth.social } },
}));
vi.mock("sonner", () => ({ toast: { error: auth.error } }));

import { ProviderSignIn } from "./provider-sign-in";

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  auth.providers.mockResolvedValue({ data: { google: true, apple: false }, error: null });
  auth.social.mockResolvedValue({ data: { redirect: true }, error: null });
});

function show(disabled = false) {
  const pending = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ProviderSignIn, {
        disabled,
        invitation: "made-up-invitation",
        returnTo: "/fr/app?break=one&shared=list",
        onPendingChange: pending,
      }),
    ),
  );
  return pending;
}

describe("the providers' sign-in buttons", () => {
  it("are absent when the instance offers no provider or its answer is unavailable", async () => {
    auth.providers.mockResolvedValue({ data: { google: false, apple: false }, error: null });
    show();
    await waitFor(() => expect(auth.providers).toHaveBeenCalled());
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    auth.providers.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    show();
    await waitFor(() => expect(auth.providers).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("show Google's alone for an API that names Google alone", async () => {
    auth.providers.mockResolvedValue({ data: { google: true }, error: null });
    show();
    await screen.findByRole("button", { name: "Continue with Google" });
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("show Apple's first, in Apple's words, when the instance offers both", async () => {
    auth.providers.mockResolvedValue({ data: { google: true, apple: true }, error: null });
    show();
    await screen.findByRole("button", { name: "Continue with Apple" });
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Continue with Apple",
      "Continue with Google",
    ]);
  });

  it("send the place, language and invitation once and wait during the redirect", async () => {
    const pending = show();
    const button = await screen.findByRole("button", { name: "Continue with Google" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(auth.social).toHaveBeenCalledTimes(1);
    expect(auth.social).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        callbackURL: `${window.location.origin}/fr/app?break=one&shared=list`,
        additionalData: { invitation: "made-up-invitation" },
      }),
    );
    const options = auth.social.mock.calls[0]![0];
    expect(new URL(options.errorCallbackURL).pathname).toBe("/fr/login");
    expect(new URL(options.errorCallbackURL).searchParams.get("with")).toBe("google");
    expect(pending).toHaveBeenCalledWith(true);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("sign in with Apple the same way, and hold the other button while it goes", async () => {
    auth.providers.mockResolvedValue({ data: { google: true, apple: true }, error: null });
    show();
    const apple = await screen.findByRole("button", { name: "Continue with Apple" });
    fireEvent.click(apple);
    expect(auth.social).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "apple",
        callbackURL: `${window.location.origin}/fr/app?break=one&shared=list`,
        additionalData: { invitation: "made-up-invitation" },
      }),
    );
    const options = auth.social.mock.calls[0]![0];
    expect(new URL(options.errorCallbackURL).searchParams.get("with")).toBe("apple");
    const google = screen.getByRole("button", { name: "Continue with Google" });
    expect((google as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(google);
    expect(auth.social).toHaveBeenCalledTimes(1);
  });

  it.each(["refused", "network"])("allow another attempt after a %s failure", async (failure) => {
    if (failure === "network") auth.social.mockRejectedValue(new Error("Network failed"));
    else auth.social.mockResolvedValue({ error: { message: "Refused" } });
    const pending = show();
    const button = await screen.findByRole("button", { name: "Continue with Google" });
    fireEvent.click(button);
    await waitFor(() => expect(auth.error).toHaveBeenCalled());
    expect(pending).toHaveBeenLastCalledWith(false);
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(auth.social).toHaveBeenCalledTimes(2);
  });

  it("cannot start while email sign-in is pending", async () => {
    auth.providers.mockResolvedValue({ data: { google: true, apple: true }, error: null });
    show(true);
    const button = await screen.findByRole("button", { name: "Continue with Apple" });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(auth.social).not.toHaveBeenCalled();
  });
});
