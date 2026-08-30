"use client";

import { Fragment } from "react";
import {
  Circle,
  Document,
  Image,
  Line,
  Page,
  Polygon,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";

import {
  archetypesWithCentroids,
  dissonanceAlerts,
  hiddenAskCards,
  MASLOW_LABELS,
} from "@/lib/insight-views";
import { dominantEmotion, EMOTION_LABELS, resolveAverageScores } from "@/lib/plutchik";
import type { ProductIdentity } from "@/lib/product-identity";
import type { ResonanceStreamState } from "@/lib/resonance-parse";
import { EMOTION_KEYS } from "@/lib/resonance-types";

const colors = {
  page: "#071018",
  panel: "#101d2b",
  panelAlt: "#132536",
  text: "#e7f4f7",
  muted: "#92aeb8",
  cyan: "#67e8f9",
  cyanDark: "#164e63",
  orange: "#fb923c",
  rose: "#fb7185",
  border: "#254254",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.page,
    color: colors.text,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.55,
    paddingTop: 48,
    paddingBottom: 52,
    paddingHorizontal: 44,
  },
  cover: {
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
  },
  logo: {
    width: 84,
    height: 84,
    objectFit: "contain",
    marginBottom: 28,
  },
  logoFallback: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: colors.cyan,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  logoLetter: { color: colors.cyan, fontSize: 34, fontFamily: "Helvetica-Bold" },
  eyebrow: {
    color: colors.cyan,
    fontSize: 9,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  coverTitle: { fontSize: 31, fontFamily: "Helvetica-Bold", marginBottom: 12 },
  coverSubtitle: { color: colors.muted, fontSize: 13, maxWidth: 380 },
  title: { fontSize: 23, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  subtitle: { color: colors.muted, fontSize: 11, marginBottom: 22 },
  sectionTitle: {
    color: colors.cyan,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  panel: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 11,
  },
  panelAlt: {
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 11,
  },
  cardTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  body: { color: colors.text },
  muted: { color: colors.muted },
  small: { color: colors.muted, fontSize: 8 },
  row: { flexDirection: "row" },
  metrics: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  metric: {
    width: "50%",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  metricInner: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 7,
    padding: 12,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 7,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  metricValue: { color: colors.cyan, fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 4 },
  tag: {
    color: colors.cyan,
    borderWidth: 1,
    borderColor: colors.cyanDark,
    borderRadius: 8,
    fontSize: 7,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginRight: 5,
  },
  quote: {
    color: colors.muted,
    borderLeftWidth: 2,
    borderLeftColor: colors.cyanDark,
    paddingLeft: 9,
    marginTop: 6,
  },
  warning: { borderColor: "#71394a", backgroundColor: "#241721" },
  recommendation: { borderColor: colors.cyanDark },
  scoreRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  scoreLabel: { color: colors.muted },
  scoreValue: { color: colors.cyan, fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 44,
    right: 44,
    color: colors.muted,
    fontSize: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 7,
  },
});

function Footer({ productName }: { productName: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{productName} · Resonance</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Header({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function RadarGraphic({ stream }: { stream: ResonanceStreamState }) {
  const scores = resolveAverageScores(stream);
  if (!scores) return <Text style={styles.muted}>No emotion profile was produced.</Text>;
  const cx = 260;
  const cy = 165;
  const radius = 105;
  const coordinate = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / EMOTION_KEYS.length;
    return [cx + Math.cos(angle) * radius * value, cy + Math.sin(angle) * radius * value];
  };
  const polygon = EMOTION_KEYS.map((key, index) => coordinate(index, scores[key]).join(",")).join(" ");

  return (
    <Svg viewBox="0 0 520 340" style={{ width: "100%", height: 250 }}>
      {[0.25, 0.5, 0.75, 1].map((level) => (
        <Polygon
          key={level}
          points={EMOTION_KEYS.map((_, index) => coordinate(index, level).join(",")).join(" ")}
          fill="none"
          stroke={colors.border}
          strokeWidth={1}
        />
      ))}
      {EMOTION_KEYS.map((key, index) => {
        const [x, y] = coordinate(index, 1);
        const [labelX, labelY] = coordinate(index, 1.24);
        return (
          <Fragment key={key}>
            <Line x1={cx} y1={cy} x2={x} y2={y} stroke={colors.border} strokeWidth={1} />
            <Text
              x={labelX}
              y={labelY}
              style={{ fill: colors.muted, fontSize: 8, textAnchor: "middle" }}
            >
              {EMOTION_LABELS[key].toUpperCase()}
            </Text>
          </Fragment>
        );
      })}
      <Polygon points={polygon} fill="#22d3ee" fillOpacity={0.28} stroke={colors.cyan} strokeWidth={2} />
      {EMOTION_KEYS.map((key, index) => {
        const [x, y] = coordinate(index, scores[key]);
        return <Circle key={key} cx={x} cy={y} r={3} fill={colors.cyan} />;
      })}
    </Svg>
  );
}

function ProductLogo({ product }: { product: ProductIdentity }) {
  if (product.logoUrl) {
    return <Image src={product.logoUrl} style={styles.logo} />;
  }
  return (
    <View style={styles.logoFallback}>
      <Text style={styles.logoLetter}>{product.name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function ResonanceDocument({
  stream,
  product,
  modelProvider,
}: {
  stream: ResonanceStreamState;
  product: ProductIdentity;
  modelProvider?: "minimax" | "deepseek" | null;
}) {
  const scores = resolveAverageScores(stream);
  const dominant = scores ? dominantEmotion(scores) : null;
  const archetypes = archetypesWithCentroids(stream);
  const asks = hiddenAskCards(stream);
  const alerts = dissonanceAlerts(stream);
  const actions = stream.actionItems?.items ?? [];
  const totalReviews = stream.scored?.total_reviews ?? stream.analysis?.total_reviews ?? 0;
  const generatedAt = stream.analysis?.timestamp
    ? new Date(stream.analysis.timestamp).toLocaleString()
    : new Date().toLocaleString();

  return (
    <Document
      title={`${product.name} — Resonance analysis`}
      author="Resonance"
      subject="Customer emotion archaeology report"
    >
      <Page size="A4" style={[styles.page, styles.cover]}>
        <ProductLogo product={product} />
        <Text style={styles.eyebrow}>Resonance · Customer Emotion Archaeology</Text>
        <Text style={styles.coverTitle}>{product.name}</Text>
        <Text style={styles.coverSubtitle}>
          A complete analysis of emotional signals, customer segments, unspoken needs,
          cognitive dissonance, and approved recommendations.
        </Text>
        <Text style={[styles.small, { marginTop: 24 }]}>{generatedAt}</Text>
      </Page>

      <Page size="A4" style={styles.page}>
        <Header
          eyebrow="Page 1 · Live Analysis"
          title={`${product.name} analysis`}
          subtitle={stream.analysis?.product_context ?? "Customer review analysis completed by Resonance."}
        />
        <View style={styles.metrics}>
          {[
            ["Reviews analyzed", totalReviews],
            ["Customer segments", archetypes.length],
            ["Unspoken needs", asks.length],
            ["Red flags", alerts.length],
          ].map(([label, value]) => (
            <View style={styles.metric} key={String(label)}>
              <View style={styles.metricInner}>
                <Text style={styles.metricLabel}>{label}</Text>
                <Text style={styles.metricValue}>{String(value)}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Pipeline completed</Text>
          {["CSV validation", "Emotion scoring", "Customer clustering", "Needs analysis", "Human approval", "Recommendations"].map(
            (stage, index) => (
              <View key={stage} style={[styles.row, { marginBottom: 7 }]}>
                <Text style={{ color: colors.cyan, width: 22 }}>{index + 1}</Text>
                <Text>{stage}</Text>
              </View>
            ),
          )}
        </View>
        <Text style={styles.muted}>
          Model: {modelProvider === "deepseek" ? "DeepSeek V4 Flash 0731" : "MiniMax M3"}
        </Text>
        <Footer productName={product.name} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Header
          eyebrow="Page 2 · Emotion Profile"
          title="Complete emotional footprint"
          subtitle="Average intensity across Plutchik’s eight independent emotional dimensions."
        />
        <RadarGraphic stream={stream} />
        <View style={styles.panel}>
          {scores
            ? EMOTION_KEYS.map((key) => (
                <View key={key} style={styles.scoreRow}>
                  <Text style={styles.scoreLabel}>{EMOTION_LABELS[key]}</Text>
                  <Text style={styles.scoreValue}>{scores[key].toFixed(2)} / 1.00</Text>
                </View>
              ))
            : null}
        </View>
        <Footer productName={product.name} />
      </Page>

      <Page size="A4" style={styles.page} wrap>
        <Header
          eyebrow="Analysis Result · Section 1"
          title={`Segments (${archetypes.length})`}
          subtitle="Complete customer archetypes derived from emotional clustering."
        />
        {archetypes.map((item) => (
          <View key={item.cluster_id} style={styles.panel} wrap={false}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.small}>
              {item.size} reviews · {item.percentage.toFixed(1)}% · {MASLOW_LABELS[item.dominant_maslow_need]}
            </Text>
            <Text style={[styles.body, { marginTop: 7 }]}>{item.profile}</Text>
            <Text style={[styles.sectionTitle, { marginTop: 9 }]}>Dominant emotions</Text>
            <View style={styles.row}>
              {item.dominant_emotions.map((emotion) => (
                <Text key={emotion} style={styles.tag}>{EMOTION_LABELS[emotion]}</Text>
              ))}
            </View>
            {item.representative_quotes.map((quote) => (
              <Text key={quote} style={styles.quote}>“{quote}”</Text>
            ))}
          </View>
        ))}
        <Footer productName={product.name} />
      </Page>

      <Page size="A4" style={styles.page} wrap>
        <Header
          eyebrow="Analysis Result · Section 2"
          title={`Unspoken Needs (${asks.length})`}
          subtitle="Needs implied by emotional patterns rather than explicit feature requests."
        />
        {asks.map((ask) => (
          <View key={ask.id} style={styles.panelAlt} wrap={false}>
            <Text style={styles.cardTitle}>{ask.title}</Text>
            <Text style={styles.small}>
              {MASLOW_LABELS[ask.maslow_need]} · {ask.confidence} confidence · Evidence: {ask.evidence_archetype}
            </Text>
            <Text style={[styles.body, { marginTop: 7 }]}>{ask.description}</Text>
          </View>
        ))}
        <Footer productName={product.name} />
      </Page>

      <Page size="A4" style={styles.page} wrap>
        <Header
          eyebrow="Analysis Result · Section 3"
          title={`Red Flags (${alerts.length})`}
          subtitle="Complete set of reviews where the literal wording conflicts with the emotional profile."
        />
        {alerts.length ? alerts.map((alert) => (
          <View key={alert.id} style={[styles.panel, styles.warning]} wrap={false}>
            <Text style={styles.cardTitle}>Review {alert.id}{alert.rating ? ` · ${alert.rating}★` : ""}</Text>
            <Text style={styles.small}>{alert.type.replaceAll("_", " ")} · {MASLOW_LABELS[alert.maslow_need]}</Text>
            <Text style={[styles.body, { marginTop: 7 }]}>“{alert.text}”</Text>
            <Text style={[styles.muted, { marginTop: 7 }]}>{alert.explanation}</Text>
          </View>
        )) : <Text style={styles.muted}>No cognitive-dissonance red flags were detected.</Text>}
        <Footer productName={product.name} />
      </Page>

      <Page size="A4" style={styles.page} wrap>
        <Header
          eyebrow="Analysis Result · Section 4"
          title={`Recommendations (${actions.length})`}
          subtitle="The complete set of recommendations generated after human approval."
        />
        {actions.length ? actions.map((item) => (
          <View key={item.hidden_ask} style={[styles.panel, styles.recommendation]} wrap={false}>
            <Text style={styles.cardTitle}>{item.hidden_ask}</Text>
            <Text style={styles.small}>{item.priority} priority · Effort {item.effort}</Text>
            <Text style={[styles.body, { marginTop: 7 }]}>{item.recommendation}</Text>
          </View>
        )) : <Text style={styles.muted}>Recommendations were not generated or were declined.</Text>}
        <Footer productName={product.name} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Header
          eyebrow="Executive Summary"
          title={`${product.name}: what customers are really saying`}
          subtitle="A concise synthesis of the complete Resonance analysis."
        />
        <View style={styles.panelAlt}>
          <Text style={styles.body}>
            Across {totalReviews} analyzed reviews, the primary emotional driver is{" "}
            {dominant ? EMOTION_LABELS[dominant].toLowerCase() : "not available"}. Resonance
            identified {archetypes.length} customer segments, {asks.length} unspoken needs,
            and {alerts.length} cognitive-dissonance red flags.
          </Text>
        </View>
        {actions.slice(0, 3).map((item, index) => (
          <View key={item.hidden_ask} style={styles.panel} wrap={false}>
            <Text style={styles.sectionTitle}>Priority {index + 1}</Text>
            <Text style={styles.cardTitle}>{item.hidden_ask}</Text>
            <Text>{item.recommendation}</Text>
          </View>
        ))}
        <Footer productName={product.name} />
      </Page>
    </Document>
  );
}
