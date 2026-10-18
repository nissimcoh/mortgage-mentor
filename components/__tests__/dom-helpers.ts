import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
export async function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(node); });
}
export async function unmount() {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
}
export async function rerender(node: ReactNode) {
  await act(async () => { root!.render(node); });
}
export async function click(element: HTMLElement) {
  await act(async () => { element.focus(); element.click(); });
}
export async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
export function button(text: string) {
  const found = Array.from(document.querySelectorAll("button")).find(el => el.textContent === text);
  if (!found) throw new Error(`Button missing: ${text}`);
  return found;
}
export async function submit(form = document.querySelector("dialog form")!) {
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
export async function cancelDialog() {
  await act(async () => { document.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })); });
}
