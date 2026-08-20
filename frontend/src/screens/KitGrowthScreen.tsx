import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Text as SvgText,
} from "react-native-svg";

import * as kitsApi from "../api/kits";
import type {
  Assessment,
  GrowthAnalysis,
  KitWeight,
  ReferenceCurve,
} from "../api/kits";
import { COLORS, MOTION, RADIUS } from "../theme";

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

function assessmentStyle(assessment: Assessment): {
  label: string;
  colour: string;
  soft: string;
  glyph: string;
} {
  switch (assessment) {
    case "on_track":
      return {
        label: "On track",
        colour: COLORS.growthOnTrack,
        soft: COLORS.growthOnTrackSoft,
        glyph: "✓",
      };
    case "above_reference":
      return {
        label: "Ahead of reference",
        colour: COLORS.growthAbove,
        soft: COLORS.growthAboveSoft,
        glyph: "↑",
      };
    case "below_reference":
      return {
        label: "Below reference",
        colour: COLORS.growthBelow,
        soft: COLORS.growthBelowSoft,
        glyph: "•",
      };
    case "falling_behind":
      return {
        label: "Falling behind",
        colour: COLORS.growthBehind,
        soft: COLORS.growthBehindSoft,
        glyph: "!",
      };
    default:
      return {
        label: "Not enough weighings",
        colour: COLORS.growthUnknown,
        soft: COLORS.growthUnknownSoft,
        glyph: "?",
      };
  }
}

/* ------------------------------------------------------------------ */
/* Chart                                                               */
/* ------------------------------------------------------------------ */

const CHART_HEIGHT = 240;
const PAD_LEFT = 44;
const PAD_RIGHT = 14;
const PAD_TOP = 14;
const PAD_BOTTOM = 30;

/**
 * Growth chart.
 *
 * Two series on one pair of axes: the published Gompertz reference curve as a
 * dashed grey line, and this kit's actual weighings as a solid coloured line
 * with points. Plotting both together is the whole point — a weight in grams
 * means nothing to an owner without the expected value beside it.
 *
 * Drawn with react-native-svg rather than a charting library: the shapes are
 * two polylines and some axis text, and a chart dependency would add build
 * weight for no capability we need.
 */
function GrowthChart({
  analysis,
  curve,
  colour,
}: {
  analysis: GrowthAnalysis;
  curve: ReferenceCurve | null;
  colour: string;
}) {
  const width = Dimensions.get("window").width - 32 - 32;
  const plotW = width - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const kitPoints = analysis.points;

  // Axis ranges. The x axis always covers at least the reference range so the
  // curve is never clipped, and stretches if the kit is older than that.
  const maxKitWeeks = kitPoints.length
    ? kitPoints[kitPoints.length - 1].age_weeks
    : 0;
  const maxWeeks = Math.max(12, Math.ceil(maxKitWeeks));

  const maxKitWeight = kitPoints.reduce((m, p) => Math.max(m, p.weight_g), 0);
  const maxRefWeight = curve
    ? curve.points.reduce((m, p) => Math.max(m, p.reference_g), 0)
    : 0;
  const maxWeight = Math.max(maxKitWeight, maxRefWeight, 100) * 1.08;

  const x = (weeks: number) => PAD_LEFT + (weeks / maxWeeks) * plotW;
  const y = (grams: number) => PAD_TOP + plotH - (grams / maxWeight) * plotH;

  function polyline(pts: { wk: number; g: number }[]): string {
    if (!pts.length) return "";
    return pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.wk).toFixed(1)} ${y(p.g).toFixed(1)}`)
      .join(" ");
  }

  const refPath = curve
    ? polyline(curve.points.map((p) => ({ wk: p.age_weeks, g: p.reference_g })))
    : "";
  const kitPath = polyline(
    kitPoints.map((p) => ({ wk: p.age_weeks, g: p.weight_g })),
  );

  // Four horizontal gridlines, rounded to a readable step.
  const step = Math.ceil(maxWeight / 4 / 250) * 250;
  const gridValues: number[] = [];
  for (let v = 0; v <= maxWeight; v += step) gridValues.push(v);

  const weekTicks: number[] = [];
  const tickEvery = maxWeeks > 14 ? 4 : 2;
  for (let w = 0; w <= maxWeeks; w += tickEvery) weekTicks.push(w);

  return (
    <View style={styles.chartCard}>
      <Svg width={width} height={CHART_HEIGHT}>
        {gridValues.map((v) => (
          <React.Fragment key={`g${v}`}>
            <Line
              x1={PAD_LEFT}
              y1={y(v)}
              x2={width - PAD_RIGHT}
              y2={y(v)}
              stroke={COLORS.chartGrid}
              strokeWidth={1}
            />
            <SvgText
              x={PAD_LEFT - 7}
              y={y(v) + 4}
              fontSize={10}
              fill={COLORS.textMuted}
              textAnchor="end"
            >
              {v >= 1000 ? `${(v / 1000).toFixed(1)}kg` : `${v}g`}
            </SvgText>
          </React.Fragment>
        ))}

        {weekTicks.map((w) => (
          <SvgText
            key={`t${w}`}
            x={x(w)}
            y={CHART_HEIGHT - 10}
            fontSize={10}
            fill={COLORS.textMuted}
            textAnchor="middle"
          >
            {w}
          </SvgText>
        ))}

        {/* Published reference, dashed to read as a guide rather than data. */}
        {refPath ? (
          <Path
            d={refPath}
            stroke={COLORS.chartReference}
            strokeWidth={2}
            strokeDasharray="5,4"
            fill="none"
          />
        ) : null}

        {/* This kit's actual weighings. */}
        {kitPath ? (
          <Path d={kitPath} stroke={colour} strokeWidth={2.5} fill="none" />
        ) : null}

        {kitPoints.map((p) => (
          <Circle
            key={p.measured_on}
            cx={x(p.age_weeks)}
            cy={y(p.weight_g)}
            r={4}
            fill={colour}
            stroke={COLORS.surface}
            strokeWidth={1.5}
          />
        ))}
      </Svg>

      <Text style={styles.chartAxisLabel}>Age in weeks</Text>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDash, { backgroundColor: COLORS.chartReference }]} />
          <Text style={styles.legendText}>Published reference</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colour }]} />
          <Text style={styles.legendText}>{analysis.identifier}</Text>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function KitGrowthScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const kitId: string = route?.params?.kitId;

  const [analysis, setAnalysis] = useState<GrowthAnalysis | null>(null);
  const [curve, setCurve] = useState<ReferenceCurve | null>(null);
  const [weights, setWeights] = useState<KitWeight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entrance = useRef(new Animated.Value(0)).current;

  const load = useCallback(
    async (isRefresh = false) => {
      if (!kitId) {
        setError("No kit was selected.");
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      try {
        const growth = await kitsApi.kitGrowth(kitId);
        setAnalysis(growth);

        // Fetch the curve for the group the server actually used, and extend
        // it to cover this kit if it is older than the reference range.
        const weeksNeeded = Math.max(
          12,
          Math.ceil((growth.latest_age_days ?? 0) / 7),
        );
        const [ref, history] = await Promise.all([
          kitsApi.referenceCurve(growth.reference_group, weeksNeeded),
          kitsApi.listWeights(kitId),
        ]);
        setCurve(ref);
        setWeights(history);
        setError(null);
      } catch (err) {
        setError(kitsApi.kitError(err, "Could not load growth data"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [kitId],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!cancelled) await load();
      })();
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  useEffect(() => {
    if (!loading) {
      Animated.timing(entrance, {
        toValue: 1,
        duration: MOTION.base,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [loading, entrance]);

  function confirmDelete(weight: KitWeight) {
    Alert.alert(
      "Remove this weighing?",
      `${weight.weight_g} g on ${weight.measured_on}. This cannot be undone.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await kitsApi.deleteWeight(weight.id);
              await load();
            } catch (err) {
              setError(kitsApi.kitError(err, "Could not remove the weighing"));
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const style = assessmentStyle(analysis?.assessment ?? "unknown");
  const trend = analysis?.trend ?? null;
  const latest = analysis?.points.length
    ? analysis.points[analysis.points.length - 1]
    : null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>‹ Litter</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{analysis?.identifier ?? "Kit"}</Text>
        <Text style={styles.headerSubtitle}>
          Born {analysis?.kindling_date}
          {analysis?.latest_age_days != null
            ? ` · ${Math.floor(analysis.latest_age_days / 7)} weeks at last weighing`
            : ""}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={COLORS.primary}
          />
        }
      >
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {analysis && (
          <Animated.View
            style={{
              opacity: entrance,
              transform: [
                {
                  translateY: entrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
              ],
            }}
          >
            <View style={[styles.verdictCard, { backgroundColor: style.soft }]}>
              <View style={[styles.verdictBadge, { backgroundColor: style.colour }]}>
                <Text style={styles.verdictBadgeText}>{style.glyph}</Text>
              </View>
              <Text style={[styles.verdictTitle, { color: style.colour }]}>
                {style.label}
              </Text>
              <Text style={styles.verdictMessage}>{analysis.message}</Text>
            </View>

            <GrowthChart analysis={analysis} curve={curve} colour={style.colour} />

            {latest && (
              <View style={styles.statRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{latest.weight_g} g</Text>
                  <Text style={styles.statLabel}>Latest weight</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>
                    {Math.round(latest.reference_g)} g
                  </Text>
                  <Text style={styles.statLabel}>Expected</Text>
                </View>
                <View style={styles.statBox}>
                  <Text
                    style={[
                      styles.statValue,
                      {
                        color:
                          latest.deviation_g >= 0
                            ? COLORS.growthOnTrack
                            : COLORS.growthBelow,
                      },
                    ]}
                  >
                    {latest.deviation_g >= 0 ? "+" : ""}
                    {Math.round(latest.deviation_g)} g
                  </Text>
                  <Text style={styles.statLabel}>Difference</Text>
                </View>
              </View>
            )}

            {trend && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Trend</Text>
                <Text style={styles.trendHeadline}>
                  {trend.slope_g_per_week >= 0 ? "+" : ""}
                  {trend.slope_g_per_week.toFixed(1)} g per week
                </Text>
                <Text style={styles.trendBody}>
                  This is the change in the gap between {analysis.identifier} and
                  the reference, not weight gain. Near zero means keeping pace
                  with the curve, whatever the absolute weight.
                </Text>
                <View style={styles.trendMetaRow}>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>
                      {trend.n_points} weighings
                    </Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>
                      R² {trend.r_squared.toFixed(2)}
                    </Text>
                  </View>
                  {analysis.confidence_state === "provisional" && (
                    <View style={[styles.metaChip, styles.metaChipWarn]}>
                      <Text style={[styles.metaChipText, styles.metaChipWarnText]}>
                        Provisional
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Weighings</Text>
              {weights.length === 0 ? (
                <Text style={styles.trendBody}>
                  No weighings recorded yet. Go back and use Weigh on this kit.
                </Text>
              ) : (
                [...weights].reverse().map((w) => {
                  const point = analysis.points.find(
                    (p) => p.measured_on === w.measured_on,
                  );
                  return (
                    <Pressable
                      key={w.id}
                      onLongPress={() => confirmDelete(w)}
                      style={styles.weightRow}
                      accessibilityRole="button"
                      accessibilityLabel={`${w.weight_g} grams on ${w.measured_on}. Long press to remove.`}
                    >
                      <Text style={styles.weightDate}>{w.measured_on}</Text>
                      <Text style={styles.weightGrams}>{w.weight_g} g</Text>
                      {point && (
                        <Text
                          style={[
                            styles.weightDelta,
                            {
                              color:
                                point.deviation_g >= 0
                                  ? COLORS.growthOnTrack
                                  : COLORS.growthBelow,
                            },
                          ]}
                        >
                          {point.deviation_g >= 0 ? "+" : ""}
                          {Math.round(point.deviation_g)}
                        </Text>
                      )}
                    </Pressable>
                  );
                })
              )}
              {weights.length > 0 && (
                <Text style={styles.hint}>Press and hold a row to remove it.</Text>
              )}
            </View>

            <View style={styles.sourceCard}>
              <Text style={styles.sourceTitle}>Where the reference comes from</Text>
              <Text style={styles.sourceText}>
                {curve?.source_citation ??
                  "Published rabbit growth data (see project documentation)."}
              </Text>
              <Text style={styles.sourceMeta}>
                {analysis.reference_label} · model {analysis.model_version}
              </Text>
            </View>

            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerText}>{analysis.disclaimer}</Text>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 16, paddingTop: 14 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: { paddingVertical: 4, marginBottom: 6, alignSelf: "flex-start" },
  backText: { fontSize: 15, color: COLORS.primary, fontWeight: "700" },
  headerTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.6,
  },
  headerSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },

  verdictCard: {
    borderRadius: RADIUS.lg,
    padding: 20,
    alignItems: "center",
    marginBottom: 14,
  },
  verdictBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  verdictBadgeText: { color: "#fff", fontSize: 23, fontWeight: "800" },
  verdictTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  verdictMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
       textAlign: "center",
    marginTop: 9,
    lineHeight: 20,
    alignSelf: "stretch",
  },

  chartCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartAxisLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 2,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
    marginTop: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDash: { width: 16, height: 2.5, borderRadius: 2 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },

  statRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
     paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
    statLabel: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 3,
    textAlign: "center",
    alignSelf: "stretch",
  },

  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  trendHeadline: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.6,
  },
  trendBody: {
    fontSize: 13.5,
    color: COLORS.textSecondary,
    marginTop: 7,
    lineHeight: 19,
  },
  trendMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  metaChip: {
    backgroundColor: "#f1f5f9",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  metaChipText: { fontSize: 11.5, color: COLORS.textSecondary, fontWeight: "700" },
  metaChipWarn: { backgroundColor: COLORS.growthBelowSoft },
  metaChipWarnText: { color: COLORS.growthBelow },

  weightRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.chartGrid,
  },
  weightDate: { flex: 1, fontSize: 13.5, color: COLORS.textSecondary },
  weightGrams: {
    fontSize: 14.5,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginRight: 14,
  },
  weightDelta: { fontSize: 13, fontWeight: "700", width: 52, textAlign: "right" },
  hint: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 10 },

  sourceCard: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 12,
  },
  sourceTitle: {
    fontSize: 12.5,
    fontWeight: "800",
    color: COLORS.primaryDark,
    marginBottom: 6,
  },
  sourceText: { fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 17 },
  sourceMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 7 },

  disclaimer: {
    backgroundColor: "#f1f5f9",
    borderRadius: RADIUS.md,
    padding: 13,
    marginBottom: 10,
  },
  disclaimerText: {
    fontSize: 12.5,
    color: COLORS.textSecondary,
    lineHeight: 18,
    textAlign: "center",
  },

  errorBanner: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
  },
  errorText: { color: COLORS.danger, fontSize: 13.5 },
});
