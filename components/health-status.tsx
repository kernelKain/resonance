import { cn } from "@/lib/utils";

export function HealthDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          ok ? "bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.95)]" : "bg-zinc-600",
        )}
      />
      <span className={ok ? "text-cyan-100" : undefined}>{label}</span>
    </div>
  );
}
