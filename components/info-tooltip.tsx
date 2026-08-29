import { Info } from "lucide-react";

export function InfoTooltip({ content }: { content: string }) {
  return (
    <div className="group relative inline-flex items-center justify-center">
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-cyan-400/10 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300"
      >
        <Info className="size-3.5" />
        <span className="sr-only">More information</span>
      </button>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="rounded-lg border border-cyan-400/20 bg-slate-900 px-3 py-2 text-sm leading-6 text-slate-200 shadow-xl">
          {content}
          <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-cyan-400/20 bg-slate-900" />
        </div>
      </div>
    </div>
  );
}
