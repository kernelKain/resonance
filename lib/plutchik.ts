import type { ResonanceStreamState } from "@/lib/resonance-parse";
import {
  EMOTION_KEYS,
  type EmotionKey,
  type PlutchikScores,
  type ScoredReview,
} from "@/lib/resonance-types";

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

export type RadarPoint = {
  axis: string;
  key: EmotionKey;
  value: number;
  color: string;
};

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

export function dominantEmotion(scores: PlutchikScores): EmotionKey {
  return EMOTION_KEYS.reduce((best, key) => (scores[key] > scores[best] ? key : best));
}

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

export function toRadarPoints(scores: PlutchikScores): RadarPoint[] {
  return EMOTION_KEYS.map((key) => ({
    axis: EMOTION_LABELS[key],
    key,
    value: Math.min(1, Math.max(0, scores[key] ?? 0)),
    color: EMOTION_COLORS[key],
  }));
}