"use client";

import { Tooltip } from "@base-ui/react";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delay={350} timeout={150}>
      {children}
    </Tooltip.Provider>
  );
}
