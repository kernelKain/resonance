"use client";

import { Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ApprovalModalProps = {
  open: boolean;
  message: string;
  hiddenAskCount: number;
  hiddenAskTitles: string[];
  ready: boolean;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
};

export function ApprovalModal({
  open,
  message,
  hiddenAskCount,
  hiddenAskTitles,
  ready,
  busy,
  onApprove,
  onDecline,
}: ApprovalModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) return;
      }}
    >
      <DialogContent className="noise-texture glass-surface border border-cyan-400/25 bg-popover/95 p-5 text-popover-foreground shadow-[0_0_90px_rgba(8,145,178,0.3),inset_0_0_30px_rgba(34,211,238,0.1)] sm:max-w-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-open:slide-in-from-bottom-2 duration-300">
        <DialogHeader className="gap-3">
          <p className="font-mono text-[11px] tracking-[0.32em] text-cyan-300 uppercase">
            Your Decision Required
          </p>
          <DialogTitle className="flex items-center gap-2 text-2xl tracking-tight">
            <ShieldAlert className="size-5 text-orange-300" />
            Approve recommendations?
          </DialogTitle>
          <DialogDescription className="text-left text-[0.95rem] leading-7 text-muted-foreground">
            {message ||
              `I found ${hiddenAskCount} Hidden Asks. Generating product-roadmap recommendations will change what we propose to ship.`}
          </DialogDescription>
        </DialogHeader>

        {hiddenAskTitles.length ? (
          <ul className="space-y-2.5 rounded-xl border border-orange-400/25 bg-orange-400/8 px-4 py-3.5">
            {hiddenAskTitles.map((title) => (
              <li key={title} className="flex gap-2 text-sm leading-6 text-foreground">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.8)]" />
                {title}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-xs leading-5 text-muted-foreground">
          The analysis has identified hidden customer needs. Approve to generate specific product
          recommendations, or decline to end with just the findings.
        </p>

        {!ready ? (
          <p className="text-xs leading-5 text-amber-200">
            Connecting to analysis checkpoint…
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="lg" disabled={busy || !ready} onClick={() => onDecline()}>
            Decline
          </Button>
          <Button size="lg" disabled={busy || !ready} onClick={() => onApprove()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}