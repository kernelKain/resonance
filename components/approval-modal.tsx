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
      <DialogContent className="border border-cyan-400/20 bg-zinc-950/95 shadow-[0_0_80px_rgba(8,145,178,0.18)]">
        <DialogHeader>
          <p className="font-mono text-[11px] tracking-[0.28em] text-cyan-300/80 uppercase">
            Human in the loop
          </p>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ShieldAlert className="size-5 text-orange-300" />
            Approve recommendations?
          </DialogTitle>
          <DialogDescription className="text-left leading-6 text-zinc-300">
            {message ||
              `I found ${hiddenAskCount} Hidden Asks. Generating product-roadmap recommendations will change what we propose to ship.`}
          </DialogDescription>
        </DialogHeader>

        {hiddenAskTitles.length ? (
          <ul className="space-y-2 rounded-lg border border-orange-400/15 bg-orange-400/5 px-3 py-3">
            {hiddenAskTitles.map((title) => (
              <li key={title} className="text-sm text-orange-50">
                {title}
              </li>
            ))}
          </ul>
        ) : null}

        {!ready ? (
          <p className="text-xs text-amber-200">
            Waiting for TrueForge to pause on ask_user_question. Approve stays disabled until
            the harness sends tool.response_required.
          </p>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy || !ready}
            onClick={() => onDecline()}
          >
            Decline
          </Button>
          <Button
            className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
            disabled={busy || !ready}
            onClick={() => onApprove()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Approved
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}