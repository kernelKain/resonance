# Resonance

Customer emotion archaeology. Resonance does not classify reviews as positive, negative, or neutral. It scores each review on Plutchik’s eight emotions, flags cognitive dissonance, maps an unmet Maslow need, clusters the emotion vectors in a TrueForge sandbox, names psychological archetypes, writes Hidden Asks, then **pauses for a human** before any product-roadmap recommendation.

Built for [The Agent Harness Hackathon](https://wemakedevs.org/) on the TrueForge harness (filesystem MCP, Exa web search, Daytona sandbox, `ask_user_question`).

## What it does

1. You drop a CSV of customer reviews (`review_text` required; `rating`, `date`, `author` optional).
2. The TrueForge agent `resonance` reads the file through a local filesystem MCP (basename only).
3. A subagent researches the product with Exa so “I love it” is interpreted in category context.
4. Every row is scored: 8-D Plutchik vector, dissonance type, one Maslow need.
5. `scripts/cluster.py` runs **inside the Daytona sandbox** (k-means, silhouette-selected k in 3–5). The laptop filesystem is not visible to Daytona; the agent copies `cluster.py` and the scored JSON in itself.
6. The model names one archetype per cluster and 3–5 Hidden Asks (`action_items` is JSON `null`).
7. TrueForge interrupts with `ask_user_question` (`Approved` / `Decline`).
8. Only after **Approved** does it emit roadmap `action_items`.

The Next.js UI on port **43123** streams those `resonance-data` fences into a Plutchik radar, segment cards, dissonance alerts, and an approval modal.

## Psychological frameworks

### Plutchik’s eight emotions

Each review gets eight independent floats in `[0.0, 1.0]`: joy, trust, fear, surprise, sadness, disgust, anger, anticipation.

Politeness is not joy. “Fine, I guess. It works.” on a 4-star rating is low joy, some trust, elevated sadness. Star rating is a weak prior only.

### Cognitive dissonance

Literal words and the emotion profile can disagree. `dissonance.type` is exactly one of:

| Type | Meaning |
| --- | --- |
| `positive_words_negative_emotions` | Affirming language (fine, works, love, great) while sadness/anger/fear dominate. |
| `negative_words_positive_emotions` | Complaint sitting on residual trust or joy. |
| `mixed_signals` | The review argues with itself (“I love it but I probably won’t renew”). |
| `none` | Words and affect agree. |

`dissonance.detected` is true unless type is `none`.

### Maslow (unmet need)

One primary unmet need per review. Physiological is out of scope.

| Need | Typical tell |
| --- | --- |
| `safety` | Outages, crashes, export-as-backup, permissions panic. |
| `belonging` | Lonely onboarding, empty assignee, no one to ask a naive question. |
| `esteem` | Years of loyalty ignored, 4-star “fine”, power users unseen. |
| `self_actualization` | “I wish it did more”, frozen roadmap, mastery ceiling. |

A Hidden Ask is the need the pattern implies that **no review filed as a ticket**. Roadmap language is forbidden there. Recommendations wait for the human.

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