/**
 * @file lib/plutchik.ts
 *
 * Utilities for working with Robert Plutchik's Wheel of Emotions model.
 * The model defines 8 core emotion dimensions scored 0–1 per review.
 *
 * Functions here convert raw {@link ResonanceStreamState} stream data into
 * chart-ready radar points, compute the dominant emotion, and provide the
 * canonical label and colour maps used across the UI.
 */

import type { ResonanceStreamState } from "@/lib/resonance-parse";
import {
  EMOTION_KEYS,
  type EmotionKey,
  type PlutchikScores,
  type ScoredReview,
} from "@/lib/resonance-types";

/** Human-readable display labels for each of the 8 Plutchik emotion keys. */
export const EMOTION_LABELS: Record<EmotionKey, string> = {
  joy: "Joy",
  trust: "Trust",
  fear: "Fear",
  surprise: "Surprise",
  sadness: "Sadness",
  disgust: "Disgust",
  anger: "Anger",
  anticipation: "Anticipation",
};

/**
 * Canonical CSS-variable colours for each Plutchik emotion.
 * The fallback hex value is used when the CSS variable is not defined.
 */
export const EMOTION_COLORS: Record<EmotionKey, string> = {
  joy: "var(--color-emotion-joy, #f5d76e)",
  trust: "var(--color-emotion-trust, #5ee0a0)",
  fear: "var(--color-emotion-fear, #7dffb3)",
  surprise: "var(--color-emotion-surprise, #67e8f9)",
  sadness: "var(--color-emotion-sadness, #60a5fa)",
  disgust: "var(--color-emotion-disgust, #c084fc)",
  anger: "var(--color-emotion-anger, #fb7185)",
  anticipation: "var(--color-emotion-anticipation, #fb923c)",
};

/** A single data point for the Recharts `RadarChart` component. */
export type RadarPoint = {
  axis: string;
  key: EmotionKey;
  value: number;
  color: string;
};

/**
 * Returns a zeroed-out {@link PlutchikScores} object.
 * Useful as an accumulator seed when aggregating scores.
 */
export function emptyPlutchik(): PlutchikScores {
  return {
    joy: 0,
    trust: 0,
    fear: 0,
    surprise: 0,
    sadness: 0,
    disgust: 0,
    anger: 0,
    anticipation: 0,
  };
}

/**
 * Averages the Plutchik scores across an array of scored reviews.
 *
 * Non-finite values (NaN, Infinity) are treated as 0 so one bad data point
 * does not corrupt the aggregate.
 *
 * @param reviews - Array of {@link ScoredReview} objects from the stream.
 * @returns Mean {@link PlutchikScores} rounded to 3 decimal places, or all
 *   zeros if `reviews` is empty.
 */
export function meanPlutchik(reviews: ScoredReview[]): PlutchikScores {
  const totals = emptyPlutchik();
  const n = reviews.length;
  if (n === 0) return totals;

  for (const review of reviews) {
    for (const key of EMOTION_KEYS) {
      const value = review.plutchik?.[key];
      totals[key] += typeof value === "number" && Number.isFinite(value) ? value : 0;
    }
  }

  for (const key of EMOTION_KEYS) {
    totals[key] = Number((totals[key] / n).toFixed(3));
  }
  return totals;
}

/**
 * Returns the emotion key with the highest score.
 *
 * @param scores - A {@link PlutchikScores} object.
 * @returns The {@link EmotionKey} of the dominant emotion.
 */
export function dominantEmotion(scores: PlutchikScores): EmotionKey {
  return EMOTION_KEYS.reduce((best, key) => (scores[key] > scores[best] ? key : best));
}

/**
 * Resolves the best available average Plutchik scores from the stream.
 *
 * Priority order:
 * 1. `stream.analysis.emotion_summary.average_scores` — final aggregated scores
 *    produced by the analysis agent after clustering.
 * 2. `stream.scored.reviews` — raw per-review scores averaged client-side.
 * 3. `null` — no score data available yet.
 *
 * @param stream - Current {@link ResonanceStreamState}.
 * @returns Averaged {@link PlutchikScores} or `null` if data is unavailable.
 */
export function resolveAverageScores(stream: ResonanceStreamState): PlutchikScores | null {
  const fromAnalysis = stream.analysis?.emotion_summary?.average_scores;
  if (fromAnalysis && typeof fromAnalysis.joy === "number") {
    const scores = emptyPlutchik();
    for (const key of EMOTION_KEYS) {
      const value = fromAnalysis[key];
      scores[key] = typeof value === "number" && Number.isFinite(value) ? value : 0;
    }
    return scores;
  }
  if (stream.scored?.reviews?.length) {
    return meanPlutchik(stream.scored.reviews);
  }
  return null;
}

/**
 * Converts a {@link PlutchikScores} object into an array of {@link RadarPoint}s
 * ready for use with Recharts' `RadarChart` component.
 *
 * Values are clamped to [0, 1] to guard against out-of-range model output.
 *
 * @param scores - Averaged Plutchik scores.
 * @returns Array of 8 radar points, one per emotion.
 */
export function toRadarPoints(scores: PlutchikScores): RadarPoint[] {
  return EMOTION_KEYS.map((key) => ({
    axis: EMOTION_LABELS[key],
    key,
    value: Math.min(1, Math.max(0, scores[key] ?? 0)),
    color: EMOTION_COLORS[key],
  }));
}
