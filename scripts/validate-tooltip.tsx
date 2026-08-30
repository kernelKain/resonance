import React from "react";
import { renderToString } from "react-dom/server";
import { Popover } from "@base-ui/react/popover";

const Test = () => (
  <Popover.Root>
    <Popover.Trigger>Test</Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner>
        <Popover.Popup>Explanation</Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
);

const html = renderToString(<Test />);
if (!html.includes("Test")) {
  throw new Error("popover trigger did not render");
}
console.log(html);
