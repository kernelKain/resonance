import { cn } from "@/lib/utils";
import { CountUp } from "@/components/count-up";
import { motion } from "framer-motion";
import { CSSProperties } from "react";

export function Metric({
  label,
  value,
  accent,
  className,
  style,
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.div
      style={style}
      whileHover={{ y: -2 }}
      className={cn(
        "rounded-xl border bg-card/70 px-4 py-3.5 transition-shadow hover:shadow-[0_8px_40px_rgba(34,211,238,0.12)]",
        accent
          ? "border-orange-400/30 shadow-[0_0_24px_rgba(251,146,60,0.12)]"
          : "border-cyan-400/15",
        className,
      )}
    >
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 truncate font-mono text-sm tabular-nums",
          accent ? "text-orange-100" : "text-cyan-100",
        )}
      >
        {Number.isNaN(Number(value)) || value === "—" ? (
          value
        ) : (
          <CountUp value={Number(value)} />
        )}
      </p>
    </motion.div>
  );
}
