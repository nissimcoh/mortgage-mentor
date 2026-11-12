// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import AnimatedNumber from "../AnimatedNumber";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const format = (value: number) => String(Math.round(value));
let root: Root | undefined;
let host: HTMLElement;

function allowMotion(reduced = false) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce") }));
}
function newHost(html = "") {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
}
const settle = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("hydrates a server-rendered figure without a mismatch and without counting from zero", async () => {
  allowMotion();
  newHost(renderToString(<AnimatedNumber value={7268} format={format} />));
  expect(host.textContent).toBe("7268");
  const recoverable = vi.fn();
  await act(async () => { root = hydrateRoot(host, <AnimatedNumber value={7268} format={format} />, { onRecoverableError: recoverable }); });
  expect(host.textContent).toBe("7268");
  await settle(60);
  expect(host.textContent).toBe("7268");
  expect(recoverable).not.toHaveBeenCalled();
});

it("counts up from zero to the value when it first appears in the browser, including under StrictMode", async () => {
  allowMotion();
  newHost();
  await act(async () => { root = createRoot(host); root.render(<StrictMode><AnimatedNumber value={500} format={format} duration={40} /></StrictMode>); });
  await settle(250);
  expect(host.textContent).toBe("500");
});

it("continues to the new value when it changes", async () => {
  allowMotion();
  newHost();
  await act(async () => { root = createRoot(host); root.render(<AnimatedNumber value={500} format={format} duration={40} />); });
  await settle(200);
  await act(async () => { root!.render(<AnimatedNumber value={120} format={format} duration={40} />); });
  await settle(200);
  expect(host.textContent).toBe("120");
});

it("shows the value at once under reduced motion or without animation support", async () => {
  allowMotion(true);
  newHost();
  await act(async () => { root = createRoot(host); root.render(<AnimatedNumber value={500} format={format} />); });
  expect(host.textContent).toBe("500");
});
