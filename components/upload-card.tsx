import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ResonancePhase } from "@/lib/resonance-parse";
import type { ProductIdentity } from "@/lib/product-identity";
import { asProductUrl, brandNameFrom } from "@/lib/product-identity";
import { isCsvUploadCandidate, validateCsvUploadText } from "@/lib/csv";
import { copyCsvGeneratorPrompt } from "@/lib/csv-prompt";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

type UploadCardProps = {
  productName: string;
  setProductName: (name: string) => void;
  productIdentity: ProductIdentity | null;
  file: File | null;
  setFile: (file: File | null) => void;
  phase: ResonancePhase;
  error: string | null;
  harnessReady: boolean;
  devMode: boolean;
  canRun: boolean;
  onRunExcavation: () => void;
  onLoadSample: () => void;
  onLoadScoringFixture: () => void;
  onReplayFixture: () => void;
  onReplayHitlFixture: () => void;
  onRunHitlSmoke: () => void;
};

export function UploadCard({
  productName,
  setProductName,
  productIdentity,
  file,
  setFile,
  phase,
  error,
  harnessReady,
  devMode,
  canRun,
  onRunExcavation,
  onLoadSample,
  onLoadScoringFixture,
  onReplayFixture,
  onReplayHitlFixture,
  onRunHitlSmoke,
}: UploadCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  async function selectFile(candidate: File | null) {
    if (!candidate) {
      setFile(null);
      setFileError(null);
      return;
    }
    if (!isCsvUploadCandidate(candidate)) {
      setFile(null);
      setFileError("Choose a CSV file.");
      return;
    }
    if (candidate.size > MAX_CSV_BYTES) {
      setFile(null);
      setFileError("CSV files must be 5 MB or smaller.");
      return;
    }
    const parseError = validateCsvUploadText(await candidate.text());
    if (parseError) {
      setFile(null);
      setFileError(parseError);
      return;
    }
    setFileError(null);
    setFile(candidate);
  }

  return (
    <Card className="noise-texture glass-surface mx-auto max-w-xl border-cyan-400/20 bg-card/85 shadow-[0_0_90px_rgba(8,145,178,0.12)] ring-1 ring-white/[0.04] ring-inset transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_40px_rgba(34,211,238,0.12)]">
      <CardHeader className="gap-3 px-6 pt-6">
        <CardTitle className="text-3xl tracking-tight">
          Analyze Customer Reviews
        </CardTitle>
        <CardDescription className="text-[0.95rem] leading-7">
          Go beyond simple sentiment. Resonance uncovers the emotional subtext, hidden
          needs, and conflicting feelings in your customer reviews.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-6 pb-6">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="product">
            Product name or live URL
          </label>
          <Input
            id="product"
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
            placeholder="Linear · https://linear.app"
            className="h-11 bg-background/60 text-base"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Enter the product name or paste its public link — helps the AI interpret reviews in the right context.
          </p>
          {asProductUrl(productName) && productIdentity?.name ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Analyzing as{" "}
              <span className="font-semibold text-orange-300">
                {brandNameFrom(productIdentity, productName)}
              </span>
              {productIdentity.fromPage ? "" : " — fetching brand name…"}
            </p>
          ) : null}
        </div>

        <motion.label
          htmlFor="review-csv"
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const dropped = event.dataTransfer.files[0];
            void selectFile(dropped ?? null);
          }}
          animate={dragOver ? { scale: 1.02 } : { scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className={cn(
            "block cursor-pointer rounded-xl border-2 border-dashed px-4 py-10 text-center transition-all duration-300 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background sm:py-12",
            dragOver
              ? "border-cyan-300 bg-cyan-400/10 shadow-[inset_0_0_40px_rgba(34,211,238,0.12),0_0_30px_rgba(34,211,238,0.1)]"
              : file
                ? "border-cyan-400/40 bg-cyan-400/5"
                : "border-cyan-400/25 bg-background/40 hover:border-cyan-400/40 hover:bg-background/60",
          )}
        >
          {file ? (
            <CheckCircle2 className="mx-auto mb-3 size-8 text-cyan-300" />
          ) : (
            <UploadCloud className="mx-auto mb-3 size-8 text-cyan-300" />
          )}
          <p className="text-sm font-medium">{file ? "File selected" : "Drop a CSV or click to select"}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Required column: <code className="font-mono text-primary">review_text</code>.
            Optional: rating, date, author.
          </p>
          <input
            id="review-csv"
            className="sr-only"
            type="file"
            accept=".csv,text/csv"
            aria-describedby="csv-requirements"
            onChange={(event) => {
              void selectFile(event.target.files?.[0] ?? null);
            }}
          />
          <span className="mx-auto mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm">
            {file ? "Choose a different CSV" : "Choose CSV file"}
          </span>
          {file ? (
            <p className="mt-4 flex items-center justify-center gap-2 break-all text-xs text-foreground">
              <FileSpreadsheet className="size-3.5" />
              {file.name}
            </p>
          ) : null}
          <p id="csv-requirements" className="mt-3 text-xs text-muted-foreground">
            Maximum 5 MB. Up to 100 concise reviews are analyzed per run.
          </p>
          {fileError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">{fileError}</p>
          ) : null}
        </motion.label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            size="lg"
            className="flex-1"
            disabled={!canRun || !harnessReady || phase === "uploading"}
            onClick={onRunExcavation}
          >
            {phase === "uploading" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Run Analysis
          </Button>
          <Button size="lg" variant="outline" className="flex-1" onClick={onLoadSample}>
            Load demo dataset
          </Button>
        </div>
        <Button
          size="lg"
          variant="outline"
          className="w-full"
          onClick={() => {
            void copyCsvGeneratorPrompt().then((ok) => {
              if (!ok) return;
              setPromptCopied(true);
              window.setTimeout(() => setPromptCopied(false), 2000);
            });
          }}
        >
          {promptCopied ? <CheckCircle2 className="size-4" /> : <ClipboardCopy className="size-4" />}
          {promptCopied ? "Copied — paste into ChatGPT" : "Copy CSV generator prompt"}
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          No reviews yet? Copy the prompt, paste it into ChatGPT with any product URL, then upload the CSV it generates.
        </p>

        {devMode && (
          <details className="group">
            <summary className="cursor-pointer font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-cyan-200">
              Developer Tools
            </summary>
            <div className="mt-3 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button size="lg" variant="outline" className="flex-1" onClick={onLoadScoringFixture}>
                  Use scoring fixture
                </Button>
                <Button size="lg" variant="outline" className="flex-1" onClick={onReplayFixture}>
                  Replay parsed fixture
                </Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button size="lg" variant="outline" className="flex-1" onClick={onReplayHitlFixture}>
                  Replay HITL fixture
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1"
                  disabled={!harnessReady}
                  onClick={onRunHitlSmoke}
                >
                  HITL smoke (live)
                </Button>
              </div>
            </div>
          </details>
        )}

        {!harnessReady ? (
            <p className="rounded-lg border border-amber-400/25 bg-amber-400/8 px-3.5 py-3 text-xs leading-5 text-amber-900 dark:text-amber-100">
            Analysis engine is not connected. In a second terminal run{" "}
            <code className="font-mono text-cyan-200">npm run harness</code>
            {devMode ? ", then " : " and "}
            <code className="font-mono text-cyan-200">npm run bootstrap</code>
            {devMode ? ". Fixture replays still work." : "."}
          </p>
        ) : null}

        {error ? (
          <p className="flex items-start gap-2 text-sm leading-6 text-rose-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}