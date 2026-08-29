"use client";

import { Info } from "lucide-react";
import { Tooltip } from "@base-ui/react";

/**
 * InfoTooltip renders an (i) icon that shows a floating tooltip on hover/focus.
 * The popup is portal-rendered at the document root so it is never clipped by
 * ancestor overflow or stacking-context boundaries (e.g. sticky headers, Cards).
 */
export function InfoTooltip({ content }: { content: string }) {
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={<button type="button" />}
          className="inline-flex items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-cyan-400/10 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300"
          aria-label="More information"
        >
          <Info className="size-3.5" />
        </Tooltip.Trigger>

        <Tooltip.Portal>
          <Tooltip.Popup className="z-[200] w-64 rounded-lg border border-cyan-400/20 bg-slate-900 px-3 py-2 text-sm leading-6 text-slate-200 shadow-xl">
            {content}
            <Tooltip.Arrow>
              <svg width="8" height="4" viewBox="0 0 8 4" aria-hidden>
                <path
                  d="M0 4L4 0L8 4"
                  fill="rgb(15 23 42)"
                  stroke="rgba(34,211,238,0.2)"
                  strokeWidth="1"
                />
              </svg>
            </Tooltip.Arrow>
          </Tooltip.Popup>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
