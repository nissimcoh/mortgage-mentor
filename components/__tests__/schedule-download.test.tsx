// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import ExportScheduleCsvButton from "../ExportScheduleCsvButton";
import en from "@/app/[locale]/dictionaries/en.json";
import { mount, unmount, click, button } from "./dom-helpers";

afterEach(async () => { await unmount(); vi.restoreAllMocks(); vi.useRealTimers(); });
const schedule = [{ month: 1, payment: 100, principalPayment: 90, interestPayment: 10, remainingBalance: 0 }];
it("downloads the selected schedule, removes its temporary anchor, and releases its object URL", async () => {
  vi.useFakeTimers();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe("MortgageMentor-Track 2.csv");
    expect(this.href).toBe("blob:test");
  });
  await mount(<ExportScheduleCsvButton schedule={schedule} rowBases={["rate"]} labels={en.calculator} title="Track 2" />);
  await click(button(en.calculator.csvButton));
  expect(anchorClick).toHaveBeenCalledOnce();
  expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  expect(document.querySelector("a[download]")).toBeNull();
  vi.runAllTimers();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
});
it("disables downloads of stale results and reports download failures", async () => {
  await mount(<ExportScheduleCsvButton schedule={schedule} rowBases={["rate"]} labels={en.calculator} title="Combined" disabled />);
  expect(button(en.calculator.csvButton).disabled).toBe(true);
  await unmount();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => { throw new Error("blocked"); }) });
  await mount(<ExportScheduleCsvButton schedule={schedule} rowBases={["rate"]} labels={en.calculator} title="Combined" />);
  await click(button(en.calculator.csvButton));
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(en.calculator.csvError);
});

it("cleans up a failed browser download even after an object URL was allocated", async () => {
  vi.useFakeTimers();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:failed-download") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { throw new Error("download blocked"); });
  await mount(<ExportScheduleCsvButton schedule={schedule} rowBases={["index"]} labels={en.calculator} title="Track 1" />);
  await click(button(en.calculator.csvButton));
  expect(document.querySelector("a[download]")).toBeNull();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(en.calculator.csvError);
  await unmount();
  vi.runAllTimers();
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:failed-download");
});
