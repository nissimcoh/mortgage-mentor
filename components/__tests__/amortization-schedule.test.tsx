// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import AmortizationSchedule from "../AmortizationSchedule";
import en from "@/app/[locale]/dictionaries/en.json";
import { mount, unmount } from "./dom-helpers";

afterEach(async () => { await unmount(); vi.unstubAllGlobals(); });

it.each(["viewport", "focus", "print"])("opens the entire schedule on %s", async (trigger) => {
  let enterViewport: () => void = () => { throw new Error("table is not observed"); };
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
      enterViewport = () => callback([{ isIntersecting: true }]);
    }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const schedule = Array.from({ length: 360 }, (_, i) => ({
    month: i + 1, payment: 100, principalPayment: 100, interestPayment: 0, remainingBalance: (359 - i) * 100,
  }));
  await mount(<AmortizationSchedule schedule={schedule} rowBases={schedule.map(() => "contractual")}
    locale="en" labels={en.calculator} title="Combined schedule" />);
  const rows = () => document.querySelectorAll("tbody tr");
  expect(rows().length).toBe(24);
  await act(async () => {
    if (trigger === "viewport") enterViewport();
    if (trigger === "focus") document.querySelector<HTMLElement>('[aria-label="Combined schedule"]')!.focus();
    if (trigger === "print") window.dispatchEvent(new Event("beforeprint"));
  });
  expect(rows().length).toBe(360);
  expect(rows()[359].firstElementChild?.textContent).toBe("360");
});
