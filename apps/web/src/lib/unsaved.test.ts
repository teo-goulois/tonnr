import { beforeEach, describe, expect, it, vi } from "vitest";

import { answerLeaving, hasUnsaved, holdUnsaved, leaveWith } from "./unsaved";

describe("what is written and not saved", () => {
  beforeEach(() => {
    holdUnsaved(false);
  });

  it("lets whatever leaves go at once when nothing would be lost", () => {
    const leave = vi.fn();
    leaveWith(leave);
    expect(leave).toHaveBeenCalledOnce();
  });

  it("asks first when something would be lost, and leaves or stays by the answer", () => {
    holdUnsaved(true);
    const leave = vi.fn();
    const stay = vi.fn();

    leaveWith(leave, stay);
    expect([leave.mock.calls.length, stay.mock.calls.length]).toEqual([0, 0]);
    answerLeaving("stay");
    expect([leave.mock.calls.length, stay.mock.calls.length]).toEqual([0, 1]);
    // What was written is still held: the next one to leave is asked too.
    expect(hasUnsaved()).toBe(true);

    leaveWith(leave, stay);
    answerLeaving("leave");
    expect([leave.mock.calls.length, stay.mock.calls.length]).toEqual([1, 1]);
  });

  it("gives up what was written once the answer is to leave: nothing asks again on the way out", () => {
    holdUnsaved(true);
    const signOut = vi.fn();
    const navigate = vi.fn();
    // Signing out leaves, and then goes to another page, which leaves too.
    leaveWith(() => {
      signOut();
      leaveWith(navigate);
    });
    answerLeaving("leave");

    expect([signOut.mock.calls.length, navigate.mock.calls.length]).toEqual([1, 1]);
    expect(hasUnsaved()).toBe(false);
  });

  it("asks one question at a time: a new one answers the one before it to stay", () => {
    holdUnsaved(true);
    const back = { leave: vi.fn(), stay: vi.fn() };
    const elsewhere = { leave: vi.fn(), stay: vi.fn() };

    leaveWith(back.leave, back.stay);
    leaveWith(elsewhere.leave, elsewhere.stay);
    expect(back.stay).toHaveBeenCalledOnce();
    // The answer is to the question that is on screen: the last one.
    answerLeaving("leave");
    expect(elsewhere.leave).toHaveBeenCalledOnce();
    expect(back.leave).not.toHaveBeenCalled();
  });

  it("answers a question to stay once nothing is held any more, and lets the next one pass", () => {
    holdUnsaved(true);
    const leave = vi.fn();
    const stay = vi.fn();
    leaveWith(leave, stay);

    // What was written was saved, or its editor is gone: the question no longer stands.
    holdUnsaved(false);
    expect([leave.mock.calls.length, stay.mock.calls.length]).toEqual([0, 1]);
    answerLeaving("leave");
    expect(leave).not.toHaveBeenCalled();

    leaveWith(leave, stay);
    expect(leave).toHaveBeenCalledOnce();
  });

  it("does nothing with an answer when no question is asked", () => {
    holdUnsaved(true);
    answerLeaving("leave");
    expect(hasUnsaved()).toBe(true);
  });
});
