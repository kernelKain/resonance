"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip } from "@base-ui/react";

/**
 * InfoTooltip renders an (i) icon that shows a floating tooltip on hover/focus.
 * The popup is portal-rendered at the document root so it is never clipped by
 * ancestor overflow or stacking-context boundaries (e.g. sticky headers, Cards).
 */
export function InfoTooltip({
  content,
  label = "More information",
}: {
  content: ReactNode;
  label?: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={<button type="button" />}
        className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-cyan-400/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={label}
      >
        <Info className="size-3.5" />
      </Tooltip.Trigger>

      <Tooltip.Portal>
        <Tooltip.Popup
          sideOffset={8}
          className="z-[200] w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover px-4 py-3 text-sm leading-6 text-popover-foreground shadow-xl"
        >
          {content}
          <Tooltip.Arrow className="fill-popover" />
        </Tooltip.Popup>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
