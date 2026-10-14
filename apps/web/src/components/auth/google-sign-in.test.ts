import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ providers: vi.fn(), social: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { $fetch: auth.providers, signIn: { social: auth.social } },
}));
vi.mock("sonner", () => ({ toast: { error: auth.error } }));

import { GoogleSignIn } from "./google-sign-in";

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  auth.providers.mockResolvedValue({ data: { google: true }, error: null });
  auth.social.mockResolvedValue({ data: { redirect: true }, error: null });
});

function show(disabled = false) {
  const pending = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(GoogleSignIn, {
        disabled,
        invitation: "made-up-invitation",
        returnTo: "/fr/app?break=one&shared=list",
        onPendingChange: pending,
      }),
    ),
  );
  return pending;
}

describe("Google sign-in button", () => {
  it("is absent when the instance offers no Google provider or its answer is unavailable", async () => {
    auth.providers.mockResolvedValue({ data: { google: false }, error: null });
    show();
    await waitFor(() => expect(auth.providers).toHaveBeenCalled());
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    auth.providers.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    show();
    await waitFor(() => expect(auth.providers).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sends the place, language and invitation once and waits during the redirect", async () => {
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
    expect(pending).toHaveBeenCalledWith(true);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(["refused", "network"])("allows another attempt after a %s failure", async (failure) => {
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
    show(true);
    const button = await screen.findByRole("button", { name: "Continue with Google" });
    fireEvent.click(button);
    expect(auth.social).not.toHaveBeenCalled();
  });
});
