import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import * as illnessApi from "../api/illness";
import { COLORS, MOTION, RADIUS } from "../theme";
import type { IllnessCheckResult, SymptomCatalogItem, TriageTier } from "../types";

function tierColour(tier: TriageTier): string {
  if (tier === "see_vet_now") return COLORS.tierUrgent;
  if (tier === "monitor") return COLORS.tierMonitor;
  return COLORS.tierNormal;
}

function tierBackground(tier: TriageTier): string {
  if (tier === "see_vet_now") return "#fef2f2";
  if (tier === "monitor") return "#fffbeb";
  return "#ecfdf5";
}

function tierGlyph(tier: TriageTier): string {
  if (tier === "see_vet_now") return "!";
  if (tier === "monitor") return "?";
  return "✓";
}

/* ------------------------------------------------------------------ */
/* Symptom row                                                         */
/* ------------------------------------------------------------------ */

function SymptomRow({
  item,
  checked,
  onToggle,
}: {
  item: SymptomCatalogItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function animate(value: number) {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 60,
      bounciness: 8,
    }).start();
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onToggle}
        onPressIn={() => animate(0.98)}
        onPressOut={() => animate(1)}
        style={[styles.row, checked && styles.rowChecked]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={item.label}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Text style={styles.checkboxTick}>✓</Text>}
        </View>
        <Text style={[styles.rowLabel, checked && styles.rowLabelChecked]}>
          {item.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Result view                                                         */
/* ------------------------------------------------------------------ */

function ResultView({
  result,
  onReset,
  insetBottom,
}: {
  result: IllnessCheckResult;
  onReset: () => void;
  insetBottom: number;
}) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: MOTION.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const colour = tierColour(result.tier);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scroll, { paddingBottom: insetBottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
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
        <View style={[styles.resultCard, { backgroundColor: tierBackground(result.tier) }]}>
          <View style={[styles.resultBadge, { backgroundColor: colour }]}>
            <Text style={styles.resultBadgeText}>{tierGlyph(result.tier)}</Text>
          </View>
          <Text style={[styles.resultTitle, { color: colour }]}>{result.title}</Text>
          <Text style={styles.resultSummary}>{result.summary}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What to do</Text>
          {result.actions.map((action, index) => (
            <View key={index} style={styles.actionRow}>
              <View style={[styles.actionDot, { backgroundColor: colour }]} />
              <Text style={styles.actionText}>{action}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            You reported {result.symptom_count}{" "}
            {result.symptom_count === 1 ? "sign" : "signs"}
          </Text>
          <View style={styles.chipWrap}>
            {result.reported_symptoms.map((key) => (
              <View key={key} style={styles.reportedChip}>
                <Text style={styles.reportedChipText}>{key.replace(/_/g, " ")}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>{result.disclaimer}</Text>
        </View>

        <Pressable style={styles.button} onPress={onReset} accessibilityRole="button">
          <Text style={styles.buttonText}>Run another check</Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function IllnessCheckScreen({ route }: any) {
  const insets = useSafeAreaInsets();
  const rabbitId: string | undefined = route?.params?.rabbitId;

  const [catalog, setCatalog] = useState<SymptomCatalogItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<IllnessCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await illnessApi.listSymptoms();
        if (!cancelled) setCatalog(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load symptoms");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  async function handleSubmit() {
    if (submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      // Send only the ticked symptoms. The server defaults the rest to false,
      // so the request stays small regardless of how the feature set grows.
      const payload: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(selected)) {
        if (value) payload[key] = true;
      }

      const outcome = await illnessApi.runCheck(payload, rabbitId);
      setResult(outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the check");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelected({});
    setResult(null);
    setError(null);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (result) {
    return (
      <ResultView result={result} onReset={handleReset} insetBottom={insets.bottom} />
    );
  }

  // Preserve the server's ordering while grouping, so clinically related
  // signs stay together in the order the backend declared them.
  const groups: { name: string; items: SymptomCatalogItem[] }[] = [];
  for (const item of catalog) {
    const existing = groups.find((g) => g.name === item.group);
    if (existing) existing.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.introTitle}>How is your rabbit today?</Text>
          <Text style={styles.introBody}>
            Tick anything you have noticed. Rabbits hide illness well, so even
            small changes are worth reporting.
          </Text>
        </View>

        {groups.map((group) => (
          <View key={group.name} style={styles.section}>
            <Text style={styles.sectionTitle}>{group.name}</Text>
            {group.items.map((item) => (
              <SymptomRow
                key={item.key}
                item={item}
                checked={!!selected[item.key]}
                onToggle={() => toggle(item.key)}
              />
            ))}
          </View>
        ))}

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.footnote}>
          This is a guidance tool, not a veterinary diagnosis. If you are
          worried about your rabbit, contact a vet.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Check symptoms"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {selectedCount === 0
                ? "Check with no signs reported"
                : `Check ${selectedCount} ${selectedCount === 1 ? "sign" : "signs"}`}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },

  intro: { paddingHorizontal: 4, paddingBottom: 14, paddingTop: 6 },
  introTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  introBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 6,
    lineHeight: 20,
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

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    marginBottom: 4,
  },
  rowChecked: { backgroundColor: COLORS.primarySoft },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: COLORS.surface,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkboxTick: { color: "#fff", fontSize: 13, fontWeight: "800" },
  rowLabel: { flex: 1, fontSize: 14.5, color: COLORS.textSecondary, lineHeight: 20 },
  rowLabelChecked: { color: COLORS.textPrimary, fontWeight: "600" },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 15,
    alignItems: "center",
    elevation: 3,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  resultCard: {
    borderRadius: RADIUS.lg,
    padding: 22,
    alignItems: "center",
    marginBottom: 14,
  },
  resultBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  resultBadgeText: { color: "#fff", fontSize: 26, fontWeight: "800" },
  resultTitle: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.4,
  },
  resultSummary: {
    fontSize: 14.5,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 21,
  },

  actionRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  actionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 7,
    marginRight: 11,
  },
  actionText: {
    flex: 1,
    fontSize: 14.5,
    color: COLORS.textSecondary,
    lineHeight: 21,
  },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reportedChip: {
    backgroundColor: "#f1f5f9",
    borderRadius: RADIUS.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  reportedChipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "600",
    textTransform: "capitalize",
  },

  disclaimer: {
    backgroundColor: "#f1f5f9",
    borderRadius: RADIUS.md,
    padding: 13,
    marginBottom: 16,
  },
  disclaimerText: {
    fontSize: 12.5,
    color: COLORS.textSecondary,
    lineHeight: 18,
    textAlign: "center",
  },

  footnote: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: "center",
    paddingHorizontal: 20,
    marginTop: 4,
    lineHeight: 17,
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