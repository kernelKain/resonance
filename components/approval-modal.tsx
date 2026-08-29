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
      <DialogContent className="border border-cyan-400/25 bg-zinc-950/95 p-5 shadow-[0_0_90px_rgba(8,145,178,0.22)] sm:max-w-lg">
        <DialogHeader className="gap-3">
          <p className="font-mono text-[11px] tracking-[0.32em] text-cyan-300 uppercase">
            Human in the loop
          </p>
          <DialogTitle className="flex items-center gap-2 text-2xl tracking-tight">
            <ShieldAlert className="size-5 text-orange-300" />
            Approve recommendations?
          </DialogTitle>
          <DialogDescription className="text-left text-[0.95rem] leading-7 text-zinc-300">
            {message ||
              `I found ${hiddenAskCount} Hidden Asks. Generating product-roadmap recommendations will change what we propose to ship.`}
          </DialogDescription>
        </DialogHeader>

        {hiddenAskTitles.length ? (
          <ul className="space-y-2.5 rounded-xl border border-orange-400/25 bg-orange-400/8 px-4 py-3.5">
            {hiddenAskTitles.map((title) => (
              <li key={title} className="flex gap-2 text-sm leading-6 text-orange-50">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.8)]" />
                {title}
              </li>
            ))}
          </ul>
        ) : null}

        {!ready ? (
          <p className="text-xs leading-5 text-amber-200">
            Waiting for TrueForge to pause on ask_user_question. Approve stays disabled until
            the harness sends tool.response_required.
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="lg" disabled={busy || !ready} onClick={() => onDecline()}>
            Decline
          </Button>
          <Button size="lg" disabled={busy || !ready} onClick={() => onApprove()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Approved
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}