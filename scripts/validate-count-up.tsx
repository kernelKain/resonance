import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";

import { CountUp } from "../components/count-up";

function setupDom() {
  const dom = new Window();
  const globals = globalThis as Record<string, unknown>;

  globals.document = dom.document;
  globals.window = dom;
  globals.HTMLElement = dom.HTMLElement;
  globals.customElements = dom.customElements;
  globals.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    Number(setTimeout(() => callback(performance.now()), 8));
  globals.cancelAnimationFrame = (id: number) => {
    clearTimeout(id);
  };

  return dom;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function renderUnderStrictMode(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(<StrictMode>{node}</StrictMode>);
  await wait(80);
  return { container, root };
}

async function main() {
  setupDom();

  const { container: countContainer } = await renderUnderStrictMode(
    <CountUp value={50} duration={16} />,
  );
  if (countContainer.textContent !== "50") {
    throw new Error(
      `CountUp stayed at ${JSON.stringify(countContainer.textContent)} under Strict Mode; expected "50"`,
    );
  }

  console.log("COUNT_UP_PASS Strict Mode remount settles on the target value");
}

void main();
