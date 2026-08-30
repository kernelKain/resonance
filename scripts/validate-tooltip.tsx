import React from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { Window } from "happy-dom";

import { InfoTooltip } from "../components/info-tooltip";

const LABEL = "Test info label";
const CONTENT = "Explanation text for the popover";

function setupDom() {
  const dom = new Window();
  const globals = globalThis as Record<string, unknown>;

  globals.document = dom.document;
  globals.window = dom;
  globals.HTMLElement = dom.HTMLElement;
  globals.HTMLButtonElement = dom.HTMLButtonElement;
  globals.customElements = dom.customElements;

  return dom;
}

function assertClosedTrigger(trigger: HTMLButtonElement) {
  if (trigger.tagName !== "BUTTON") {
    throw new Error("InfoTooltip trigger must be a button element");
  }
  if (trigger.getAttribute("type") !== "button") {
    throw new Error("InfoTooltip trigger must be type=\"button\"");
  }
  if (trigger.getAttribute("aria-haspopup") !== "dialog") {
    throw new Error("InfoTooltip trigger must expose aria-haspopup=\"dialog\"");
  }
  if (trigger.getAttribute("aria-expanded") !== "false") {
    throw new Error("InfoTooltip popover must be closed by default");
  }
  if (trigger.getAttribute("aria-label") !== LABEL) {
    throw new Error("InfoTooltip trigger must use the provided aria-label");
  }
  if (!trigger.hasAttribute("data-base-ui-click-trigger")) {
    throw new Error("InfoTooltip trigger must use click activation, not hover");
  }
}

async function waitForUpdate() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 50);
  });
}

async function renderInfoTooltip() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(<InfoTooltip label={LABEL} content={CONTENT} />);
  await waitForUpdate();

  const trigger = container.querySelector('button[aria-haspopup="dialog"]');
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error("InfoTooltip trigger button not found");
  }

  return { container, root, trigger };
}

async function main() {
  setupDom();

  const ssrHtml = renderToString(<InfoTooltip label={LABEL} content={CONTENT} />);
  if (ssrHtml.includes(CONTENT)) {
    throw new Error("InfoTooltip content must not render in closed SSR output");
  }
  if (!ssrHtml.includes('aria-label="Test info label"')) {
    throw new Error("InfoTooltip trigger aria-label missing from SSR output");
  }
  if (!ssrHtml.includes('aria-haspopup="dialog"')) {
    throw new Error("InfoTooltip trigger aria-haspopup missing from SSR output");
  }
  if (!ssrHtml.includes('aria-expanded="false"')) {
    throw new Error("InfoTooltip must render closed in SSR output");
  }
  if (!ssrHtml.includes("data-base-ui-click-trigger")) {
    throw new Error("InfoTooltip must use click activation semantics");
  }

  const { trigger } = await renderInfoTooltip();
  assertClosedTrigger(trigger);

  trigger.click();
  await waitForUpdate();
  if (trigger.getAttribute("aria-expanded") !== "true") {
    throw new Error("InfoTooltip popover must open on trigger click");
  }

  console.log("TOOLTIP_PASS click-popover semantics validated");
}

void main();
