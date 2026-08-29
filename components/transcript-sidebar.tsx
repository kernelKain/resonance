import { useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { TranscriptItem } from "@/hooks/use-resonance-state";

type TranscriptSidebarProps = {
  transcript: TranscriptItem[];
  assistant: string;
};

export function TranscriptSidebar({ transcript, assistant }: TranscriptSidebarProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, assistant]);

  return (
    <aside className="min-h-[28rem]">
      <Card className="noise-texture glass-surface flex h-full flex-col border-cyan-400/15 bg-card/85 ring-1 ring-white/[0.04] ring-inset">
        <CardHeader className="border-b border-cyan-400/10">
          <CardTitle className="text-lg tracking-tight">Activity Log</CardTitle>
          <CardDescription className="leading-6">
            Live analysis activity — tool calls, approvals, and processing steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <ScrollArea className="h-[32rem] px-4 py-4">
            <div className="space-y-3">
              {transcript.length === 0 && !assistant ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  Waiting for analysis to begin.
                </p>
              ) : null}
              {transcript.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-xs leading-5",
                    item.kind === "user" && "bg-cyan-400/10 text-cyan-50",
                    item.kind === "status" && "bg-muted/50 text-muted-foreground",
                    item.kind === "tool" && "bg-orange-400/12 text-orange-100",
                    item.kind === "subagent" && "bg-violet-400/10 text-violet-100",
                    item.kind === "error" && "bg-rose-400/10 text-rose-100",
                  )}
                >
                  <p className="mb-1 font-mono text-[11px] tracking-wide uppercase opacity-70">
                    {item.kind}
                  </p>
                  <p className="whitespace-pre-wrap">{item.text}</p>
                </div>
              ))}
              {assistant ? (
                <div className="rounded-lg bg-foreground/5 px-3 py-2.5 text-xs leading-5">
                  <p className="mb-1 font-mono text-[11px] tracking-wide text-cyan-300 uppercase">
                    assistant
                  </p>
                  <p className="whitespace-pre-wrap text-foreground/90">
                    {assistant.slice(-1200)}
                  </p>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </aside>
  );
}
