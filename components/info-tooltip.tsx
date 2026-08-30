"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover } from "@base-ui/react/popover";

/**
 * InfoTooltip renders an (i) control that opens an explanation on click.
 * The popup is portal-positioned so it is not clipped by card overflow.
 */
export function InfoTooltip({
  content,
  label = "More information",
}: {
  content: ReactNode;
  label?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-cyan-400/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={label}
      >
        <Info className="size-3.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={8} className="z-[200]">
          <Popover.Popup className="w-[min(20rem,calc(100vw-2rem))] origin-[var(--transform-origin)] rounded-lg border border-border bg-popover px-4 py-3 text-sm leading-6 text-popover-foreground shadow-xl outline-none">
            {content}
            <Popover.Arrow className="fill-popover" />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
