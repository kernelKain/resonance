import { EMOTION_LABELS } from "@/lib/plutchik";
import type { ResonanceStreamState } from "@/lib/resonance-parse";
import type {
  Archetype,
  DissonanceType,
  EmotionKey,
  HiddenAsk,
  MaslowNeed,
  PlutchikScores,
  ScoredReview,
} from "@/lib/resonance-types";

export const DISSONANCE_LABELS: Record<DissonanceType, string> = {
  positive_words_negative_emotions: "Praise masking pain",
  negative_words_positive_emotions: "Complaint with residual trust",
  mixed_signals: "Mixed signals",
  none: "Aligned",
};

export const MASLOW_LABELS: Record<MaslowNeed, string> = {
  safety: "Safety",
  belonging: "Belonging",
  esteem: "Esteem",
  self_actualization: "Self-actualization",
};

export type ArchetypeCardModel = Archetype & {
  centroid: PlutchikScores | null;
};

export type DissonanceAlert = {
  id: number;
  text: string;
  rating: number | null;
  type: DissonanceType;
  explanation: string;
  maslow_need: MaslowNeed;
  emotion_summary: string;
};

export function archetypesWithCentroids(
  stream: ResonanceStreamState,
): ArchetypeCardModel[] {
  const archetypes = stream.analysis?.archetypes ?? [];
  const clusters = stream.clustered?.clusters ?? [];
  return archetypes.map((archetype) => {
    const cluster = clusters.find((item) => item.id === archetype.cluster_id);
    return {
      ...archetype,
      centroid: cluster?.centroid ?? null,
    };
  });
}

export function hiddenAskCards(stream: ResonanceStreamState): HiddenAsk[] {
  return stream.analysis?.hidden_asks ?? [];
}

export function dissonanceAlerts(stream: ResonanceStreamState): DissonanceAlert[] {
  const reviews = stream.scored?.reviews ?? [];
  const flaggedIds = stream.analysis?.dissonance_stats?.flagged_review_ids;
  const flagged = flaggedIds ? new Set(flaggedIds) : null;

  return reviews
    .filter((review) => {
      if (!review.dissonance?.detected || review.dissonance.type === "none") {
        return false;
      }
      if (flagged) return flagged.has(review.id);
      return true;
    })
    .map(toAlert);
}

function toAlert(review: ScoredReview): DissonanceAlert {
  return {
    id: review.id,
    text: review.text,
    rating: review.rating,
    type: review.dissonance.type,
    explanation: review.dissonance.explanation,
    maslow_need: review.maslow_need,
    emotion_summary: review.emotion_summary,
  };
}

export function emotionBarWidth(centroid: PlutchikScores | null, key: EmotionKey): number {
  const value = centroid?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return 40;
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

export function emotionListLabel(keys: EmotionKey[]): string {
  return keys.map((key) => EMOTION_LABELS[key] ?? key).join(" · ");
}