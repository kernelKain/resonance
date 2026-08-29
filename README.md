# Resonance

> **Customer emotion archaeology powered by Plutchik's Wheel**

Resonance does not classify reviews as positive, negative, or neutral. It scores each review on Plutchik's eight emotions, flags cognitive dissonance, maps an unmet Maslow need, clusters the emotion vectors in a TrueForge sandbox, names psychological archetypes, writes Hidden Asks — then **pauses for a human** before any product-roadmap recommendation is emitted.

Built for [The Agent Harness Hackathon](https://wemakedevs.org/) on the TrueForge harness (filesystem MCP, Exa web search, Daytona sandbox, `ask_user_question`).

---

## Screenshots

> _Upload your CSV → watch the Plutchik wheel fill in real-time → approve the analysis → get actionable recommendations._

---

## How it works

1. Drop a CSV of customer reviews (`review_text` required; `rating`, `date`, `author` optional).
2. The TrueForge agent `resonance` reads the file through a local filesystem MCP (basename only).
3. A subagent researches the product with Exa so "I love it" is interpreted in category context.
4. Every row is scored: 8-D Plutchik vector, dissonance type, one Maslow need.
5. `scripts/cluster.py` runs **inside the Daytona sandbox** (k-means, silhouette-selected k in 3–5). The laptop filesystem is not visible to Daytona; the agent copies the script and JSON into the sandbox itself.
6. The model names one archetype per cluster and 3–5 Hidden Asks (`action_items` is JSON `null` at this stage).
7. TrueForge interrupts with `ask_user_question` (`Approved` / `Decline`).
8. Only after **Approved** does it emit roadmap `action_items`.

The Next.js UI on port **43123** streams those `resonance-data` fences into a Plutchik radar, segment cards, dissonance alerts, and an approval modal.

---

## Psychological frameworks

### Plutchik's eight emotions

Each review gets eight independent floats in `[0.0, 1.0]`: joy, trust, fear, surprise, sadness, disgust, anger, anticipation.

Politeness is not joy. `"Fine, I guess. It works."` on a 4-star rating is low joy, some trust, elevated sadness. Star rating is a weak prior only.

### Cognitive dissonance

Literal words and the emotion profile can disagree. `dissonance.type` is exactly one of:

| Type | Meaning |
| --- | --- |
| `positive_words_negative_emotions` | Affirming language while sadness / anger / fear dominate. |
| `negative_words_positive_emotions` | Complaint sitting on residual trust or joy. |
| `mixed_signals` | The review argues with itself ("I love it but I probably won't renew"). |
| `none` | Words and affect agree. |

### Maslow (unmet need)

One primary unmet need per review. Physiological is out of scope.

| Need | Typical tell |
| --- | --- |
| `safety` | Outages, crashes, export-as-backup, permissions panic. |
| `belonging` | Lonely onboarding, empty assignee, no one to ask a naive question. |
| `esteem` | Years of loyalty ignored, 4-star "fine", power users unseen. |
| `self_actualization` | "I wish it did more", frozen roadmap, mastery ceiling. |

A Hidden Ask is the need the pattern implies that **no review filed as a ticket**. Roadmap language is forbidden there. Recommendations wait for the human.

---

## Architecture

Three processes. Do not collapse them.

```text
Browser  :43123  Next.js UI (upload, SSE parse, radar, HITL modal)
                |  /api/upload  /api/session  /api/turn  /api/health
                v
TrueForge :8790  Agent "resonance"  (OpenRouter model, HITL, subagents)
                |-- remote MCP filesystem  :8792  uploads/, demo_data/, analysis/, scripts/
                |-- remote MCP Exa         https://mcp.exa.ai/mcp
                +-- Daytona sandbox        /home/trueforge/  (cluster.py + sklearn)
```

---

## Setup

### Prerequisites

- **Node.js** ≥ 20
- **Python** ≥ 3.10 (for `scripts/cluster.py` validation only; execution happens in the Daytona sandbox)
- A running **TrueForge** instance at `http://127.0.0.1:8790` with the `resonance` agent loaded
- A running **TrueForge filesystem MCP** at `http://127.0.0.1:8792`

### 1. Clone and install

```bash
git clone https://github.com/kernelKain/resonance.git
cd resonance
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:

| Variable | Required | Description |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | ✅ | Your OpenRouter API key — used by TrueForge for the agent model |
| `DAYTONA_API_KEY` | ✅ | Daytona API key for sandbox execution |
| `TRUEFORGE_BASE_URL` | optional | Default: `http://127.0.0.1:8790` |
| `TRUEFORGE_AGENT_NAME` | optional | Default: `resonance` |
| `TRUEFORGE_MODEL` | optional | Default: `openrouter/minimax-minimax-m-3-free` |
| `MCP_URL` | optional | Default: `http://127.0.0.1:8792/mcp` |
| `TRUEFORGE_SANDBOX_EXEC_TIMEOUT_MS` | optional | Default: `300000` (5 min — needed for pip + sklearn install) |

### 3. Start the UI

```bash
npm run dev
```

Open [http://localhost:43123](http://localhost:43123).

### 4. Start TrueForge and the filesystem MCP

Follow the TrueForge documentation to start both services with the `resonance` agent configuration from `agent.json`.

---

## Usage

1. **Enter a product name or URL** in the upload card — this gives the Exa subagent context.
2. **Upload a CSV** with at least a `review_text` column (UTF-8, any line endings).
3. Watch the **Live Analysis** stepper — each stage shows a contextual hint explaining what the AI is doing.
4. When the agent reaches **Approval**, review the archetypes and Hidden Asks in the panel.
5. Click **Approve** (or **Decline** to abort). Recommendations are only generated after Approve.
6. Use **Export PDF** to print the results via the browser print dialog.
7. Use **Share** to copy a base64-encoded summary link to the clipboard.

### Keyboard shortcut

| Key | Action |
| --- | --- |
| `Ctrl + D` | Toggle Developer mode — shows raw agent output and health status dots |

The **Dev** button in the header provides the same toggle for mouse users.

---

## CSV format

```csv
review_text,rating,date,author
"Great product, works as expected.",5,2024-01-15,Alice
"Fine I guess. It works but support was slow.",3,2024-01-16,Bob
```

- `review_text` — **required**, the full review body
- `rating` — optional integer 1–5
- `date` — optional ISO date
- `author` — optional display name

A sample dataset ships at `public/demo/hero_reviews.csv`. Click **Load sample** on the upload card to try it without your own data.

---

## Project structure

```text
resonance/
├── app/                    # Next.js App Router
│   ├── api/                # Route handlers: upload, session, turn, health
│   ├── globals.css         # Tailwind base, keyframes, @media print
│   └── layout.tsx          # Root layout (Geist font, dark theme)
├── components/
│   ├── resonance-app.tsx   # Root app shell — state wiring + layout
│   ├── upload-card.tsx     # File drop / URL input card
│   ├── plutchik-wheel.tsx  # Radar chart + emotion list (bidirectional hover)
│   ├── insight-panel.tsx   # Tabbed panel: Segments / Needs / Red Flags / Recs
│   ├── agent-output.tsx    # Live Analysis card — stepper + activity log
│   ├── analysis-progress.tsx # 6-step progress stepper with contextual hints
│   ├── results-summary.tsx # Executive Summary + Export PDF + Share
│   ├── transcript-sidebar.tsx # Dev-mode raw transcript
│   ├── plutchik-mark.tsx   # Animated SVG logo (dual-ring Plutchik wheel)
│   ├── approval-modal.tsx  # HITL Approve / Decline dialog
│   ├── info-tooltip.tsx    # Portal-based tooltip (z-index safe)
│   └── ...
├── hooks/
│   ├── use-resonance-state.ts # Central state + streaming + session persistence
│   └── use-health-polling.ts  # Background health-check poller
├── lib/
│   ├── resonance-parse.ts  # SSE stream parser → structured ResonanceStreamState
│   ├── plutchik.ts         # Emotion utilities (scores, colours, labels, radar points)
│   ├── csv.ts              # RFC-4180 CSV parser + column validator
│   └── ...
├── scripts/
│   └── cluster.py          # k-means clustering (runs in Daytona sandbox)
├── agent.json              # TrueForge agent configuration (do not commit secrets)
└── .env.example            # Environment variable template
```

---

## Development

```bash
# Type-check without emitting
npx tsc --noEmit

# Lint (ESLint + react-hooks + typescript-eslint)
npm run lint

# Format (Prettier via ESLint)
npm run lint -- --fix
```

---

## Acknowledgements

- [TrueForge](https://trueforge.dev) — agent harness with HITL, MCP, and Daytona sandboxing
- [Robert Plutchik](https://en.wikipedia.org/wiki/Plutchik%27s_wheel_of_emotions) — the emotion taxonomy
- [OpenRouter](https://openrouter.ai) — model routing
- [Exa](https://exa.ai) — semantic web search MCP

---

## Licence

MIT
