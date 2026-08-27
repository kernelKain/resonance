export const EMOTION_KEYS = [
  "joy",
  "trust",
  "fear",
  "surprise",
  "sadness",
  "disgust",
  "anger",
  "anticipation",
] as const;

export type EmotionKey = (typeof EMOTION_KEYS)[number];

export type PlutchikScores = Record<EmotionKey, number>;

export type DissonanceType =
  | "positive_words_negative_emotions"
  | "negative_words_positive_emotions"
  | "mixed_signals"
  | "none";

export type MaslowNeed = "safety" | "belonging" | "esteem" | "self_actualization";

export type Dissonance = {
  detected: boolean;
  type: DissonanceType;
  explanation: string;
};

export type ScoredReview = {
  id: number;
  text: string;
  rating: number | null;
  plutchik: PlutchikScores;
  dissonance: Dissonance;
  maslow_need: MaslowNeed;
  emotion_summary: string;
};

export type ScoredReviewsPayload = {
  type: "scored_reviews";
  product_name: string;
  product_context: string;
  total_reviews: number;
  reviews: ScoredReview[];
};

export type ClusterCentroid = PlutchikScores;

export type Cluster = {
  id: number;
  size: number;
  centroid: ClusterCentroid;
  member_ids: number[];
  representative_review_ids: number[];
};

export type ClusterAssignment = {
  id: number;
  cluster_id: number;
};

export type ClusterResultsPayload = {
  type: "cluster_results";
  algorithm: "kmeans";
  feature_order: EmotionKey[];
  num_clusters: number;
  silhouette_score: number;
  k_candidates: Record<string, number>;
  random_state: number;
  total_reviews: number;
  clusters: Cluster[];
  assignments: ClusterAssignment[];
};

export type Archetype = {
  cluster_id: number;
  name: string;
  profile: string;
  dominant_emotions: EmotionKey[];
  dominant_maslow_need: MaslowNeed;
  representative_quotes: string[];
  size: number;
  percentage: number;
};

export type HiddenAsk = {
  id: number;
  title: string;
  description: string;
  evidence_archetype: string;
  maslow_need: MaslowNeed;
  confidence: "high" | "medium" | "low";
  action_items: null | unknown;
};

export type AnalysisResultPayload = {
  type: "analysis_result";
  product_name: string;
  product_context: string;
  total_reviews: number;
  timestamp?: string;
  emotion_summary: {
    dominant_emotion: EmotionKey;
    average_scores: PlutchikScores;
  };
  maslow_distribution: Record<MaslowNeed, number>;
  dissonance_stats: {
    count: number;
    percentage: number;
    flagged_review_ids: number[];
  };
  archetypes: Archetype[];
  hidden_asks: HiddenAsk[];
  scored_reviews?: ScoredReview[] | [];
  cluster_results?: ClusterResultsPayload | Record<string, never>;
};

export type ApprovalRequestPayload = {
  type: "approval_request";
  message: string;
  hidden_ask_count?: number;
};

export type ActionItemsPayload = {
  type: "action_items";
  items: Array<{
    hidden_ask: string;
    recommendation: string;
    priority: string;
    effort: string;
  }>;
};

export type ResonancePayload =
  | ScoredReviewsPayload
  | ClusterResultsPayload
  | AnalysisResultPayload
  | ApprovalRequestPayload
  | ActionItemsPayload;