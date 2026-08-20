import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as kitsApi from "../api/kits";
import type { Assessment, KitSex, KitSummary, LitterDetail } from "../api/kits";
import { COLORS, MOTION, RADIUS } from "../theme";

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

function todayLocal(): string {
  const d = new Date();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86400000,
  );
}

function describeAgeDays(days: number): string {
  if (days < 0) return "not yet born";
  if (days === 0) return "born today";
  if (days === 1) return "1 day";
  if (days < 14) return `${days} days`;
  const weeks = Math.floor(days / 7);
  const spare = days % 7;
  return spare === 0 ? `${weeks} weeks` : `${weeks} wk ${spare}d`;
}

/**
 * Assessment presentation.
 *
 * 'below_reference' and 'falling_behind' are given different colours on
 * purpose. A kit that is small but keeping pace is not a problem; one whose
 * gap is widening is. Colouring both red would make every runt look urgent
 * and train owners to ignore the warning that matters.
 */
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

const SEX_OPTIONS: { value: KitSex; label: string }[] = [
  { value: "unknown", label: "Not sure" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

function sexColour(sex: KitSex): string {
  if (sex === "female") return COLORS.female;
  if (sex === "male") return COLORS.male;
  return COLORS.unknown;
}

/* ------------------------------------------------------------------ */
/* Kit row                                                             */
/* ------------------------------------------------------------------ */

function KitRow({
  kit,
  index,
  kindlingDate,
  onOpen,
  onWeighed,
}: {
  kit: KitSummary;
  index: number;
  kindlingDate: string;
  onOpen: () => void;
  onWeighed: () => void;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  const [weighing, setWeighing] = useState(false);
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: MOTION.base,
      delay: index * MOTION.stagger,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance, index]);

  const style = assessmentStyle(kit.assessment);
  const inactive = kit.status !== "active";

  async function handleWeigh() {
    if (saving) return;

    const grams = Number(weight);
    if (!weight.trim() || Number.isNaN(grams) || grams <= 0) {
      setError("Enter the weight in grams.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Enter the date as YYYY-MM-DD.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await kitsApi.recordWeight(kit.id, {
        measured_on: date,
        weight_g: Math.round(grams),
      });
      setWeight("");
      setWeighing(false);
      onWeighed();
    } catch (err) {
      setError(kitsApi.kitError(err, "Could not save the weight"));
    } finally {
      setSaving(false);
    }
  }

  return (
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
      <View style={[styles.kitCard, inactive && styles.kitCardInactive]}>
        <Pressable
          onPress={onOpen}
          style={styles.kitMain}
          accessibilityRole="button"
          accessibilityLabel={`${kit.identifier}, ${style.label}`}
        >
          <View style={[styles.kitBadge, { backgroundColor: style.colour }]}>
            <Text style={styles.kitBadgeText}>{style.glyph}</Text>
          </View>

          <View style={styles.kitText}>
            <View style={styles.kitNameRow}>
              <Text style={styles.kitName}>{kit.identifier}</Text>
              <View style={[styles.sexDot, { backgroundColor: sexColour(kit.sex) }]} />
              {inactive && (
                <Text style={styles.kitStatusTag}>
                  {kit.status === "died" ? "died" : "rehomed"}
                </Text>
              )}
            </View>

            <Text style={[styles.kitAssessment, { color: style.colour }]}>
              {style.label}
              {kit.confidence_state === "provisional" ? " · provisional" : ""}
            </Text>

            <Text style={styles.kitMeta}>
              {kit.latest_weight_g != null
                ? `${kit.latest_weight_g} g at ${describeAgeDays(
                    kit.latest_age_days ?? 0,
                  )}`
                : "No weighings yet"}
              {kit.weight_count > 0 ? ` · ${kit.weight_count} recorded` : ""}
            </Text>
          </View>

          <Text style={styles.kitChevron}>›</Text>
        </Pressable>

        {!inactive && (
          <Pressable
            onPress={() => {
              setWeighing((v) => !v);
              setError(null);
            }}
            style={[styles.weighToggle, weighing && styles.weighToggleOpen]}
            accessibilityRole="button"
            accessibilityLabel={`Weigh ${kit.identifier}`}
          >
            <Text
              style={[styles.weighToggleText, weighing && styles.weighToggleTextOpen]}
            >
              {weighing ? "Close" : "Weigh"}
            </Text>
          </Pressable>
        )}

        {weighing && (
          <View style={styles.weighPanel}>
            <View style={styles.weighRow}>
              <View style={styles.weighField}>
                <Text style={styles.weighLabel}>Weight (g)</Text>
                <TextInput
                  style={styles.weighInput}
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                  autoFocus
                  accessibilityLabel="Weight in grams"
                />
              </View>
              <View style={styles.weighFieldWide}>
                <Text style={styles.weighLabel}>Date</Text>
                <TextInput
                  style={styles.weighInput}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  accessibilityLabel="Measurement date"
                />
              </View>
            </View>

            {date !== todayLocal() && (
              <Text style={styles.weighHint}>
                Backfilling {describeAgeDays(daysBetween(kindlingDate, date))} of age.
              </Text>
            )}

            {error && <Text style={styles.weighError}>{error}</Text>}

            <Pressable
              style={[styles.weighSave, saving && styles.buttonDisabled]}
              onPress={handleWeigh}
              disabled={saving}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.weighSaveText}>Save weight</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Add kit form                                                        */
/* ------------------------------------------------------------------ */

function AddKitForm({
  litterId,
  onAdded,
  onCancel,
}: {
  litterId: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [sex, setSex] = useState<KitSex>("unknown");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (saving) return;
    if (!identifier.trim()) {
      setError("Give the kit a name or marking so you can tell it apart.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await kitsApi.createKit(litterId, { identifier: identifier.trim(), sex });
      setIdentifier("");
      setSex("unknown");
      onAdded();
    } catch (err) {
      setError(kitsApi.kitError(err, "Could not add the kit"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.formCard}>
      <View style={styles.formHeader}>
        <View style={styles.formDot} />
        <Text style={styles.formTitle}>Add a kit</Text>
      </View>

      <Text style={styles.label}>Name or marking</Text>
      <TextInput
        style={styles.input}
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="Blue, White ear, Biggest…"
        placeholderTextColor={COLORS.textMuted}
        accessibilityLabel="Kit name or marking"
      />
      <Text style={styles.hint}>
        Kits are too small to tag, so use whatever you can recognise them by.
      </Text>

      <Text style={styles.label}>Sex</Text>
      <View style={styles.segmented}>
        {SEX_OPTIONS.map((option) => {
          const active = sex === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setSex(option.value)}
              style={[styles.segment, active && styles.segmentActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[styles.segmentText, active && styles.segmentTextActive]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>
        Hard to tell before about four weeks. Leave it as not sure and change it later.
      </Text>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.formActions}>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.buttonFlex, saving && styles.buttonDisabled]}
          onPress={handleAdd}
          disabled={saving}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Add kit</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function LitterDetailScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const litterId: string = route?.params?.litterId;

  const [detail, setDetail] = useState<LitterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!litterId) {
        setError("No litter was selected.");
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      try {
        const data = await kitsApi.getLitter(litterId);
        setDetail(data);
        setError(null);
      } catch (err) {
        setError(kitsApi.kitError(err, "Could not load this litter"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [litterId],
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const kits = detail?.kits ?? [];
  const ageDays = detail ? daysBetween(detail.kindling_date, todayLocal()) : 0;
  const needingAttention = kits.filter(
    (k) => k.status === "active" && k.assessment === "falling_behind",
  ).length;
  const unweighed = kits.filter((k) => k.status === "active" && k.weight_count === 0)
    .length;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>‹ Litters</Text>
        </Pressable>

        <Text style={styles.headerTitle}>
          {detail ? describeAgeDays(ageDays) : ""} old
        </Text>
        <Text style={styles.headerSubtitle}>
          Born {detail?.kindling_date} · {kits.length}{" "}
          {kits.length === 1 ? "kit" : "kits"} recorded
        </Text>

        {needingAttention > 0 && (
          <View style={styles.alertStrip}>
            <Text style={styles.alertStripText}>
              {needingAttention}{" "}
              {needingAttention === 1 ? "kit is" : "kits are"} falling behind
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
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

        {showForm && detail && (
          <AddKitForm
            litterId={detail.id}
            onAdded={() => {
              setShowForm(false);
              load();
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {kits.length === 0 && !showForm ? (
          <View style={styles.empty}>
            <Text style={styles.emptyGlyph}>🐇</Text>
            <Text style={styles.emptyTitle}>No kits added yet</Text>
            <Text style={styles.emptyBody}>
              Add each kit you want to follow, then weigh them once a week.
            </Text>
          </View>
        ) : (
          kits.map((kit, index) => (
            <KitRow
              key={kit.id}
              kit={kit}
              index={index}
              kindlingDate={detail?.kindling_date ?? todayLocal()}
              onOpen={() => navigation.navigate("KitGrowth", { kitId: kit.id })}
              onWeighed={() => load()}
            />
          ))
        )}

        {unweighed > 0 && kits.length > 0 && (
          <Text style={styles.footnote}>
            {unweighed} {unweighed === 1 ? "kit has" : "kits have"} no weighings
            yet. Three give a first trend; five make it reliable.
          </Text>
        )}
      </ScrollView>

      {!showForm && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            style={styles.button}
            onPress={() => setShowForm(true)}
            accessibilityRole="button"
            accessibilityLabel="Add a kit"
          >
            <Text style={styles.buttonText}>Add a kit</Text>
          </Pressable>
        </View>
      )}
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
    textTransform: "capitalize",
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  alertStrip: {
    marginTop: 12,
    backgroundColor: COLORS.growthBehindSoft,
    borderRadius: RADIUS.sm,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.growthBehind,
  },
  alertStripText: {
    fontSize: 13,
    color: COLORS.growthBehind,
    fontWeight: "700",
  },

  kitCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  kitCardInactive: { opacity: 0.6 },
  kitMain: { flexDirection: "row", alignItems: "center", padding: 14 },
  kitBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  kitBadgeText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  kitText: { flex: 1 },
  kitNameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  kitName: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
  },
  sexDot: { width: 8, height: 8, borderRadius: 4 },
  kitStatusTag: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  kitAssessment: { fontSize: 13, fontWeight: "700", marginTop: 3 },
  kitMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  kitChevron: { fontSize: 22, color: COLORS.textMuted, marginLeft: 6 },

  weighToggle: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  weighToggleOpen: { backgroundColor: COLORS.primarySoft },
  weighToggleText: { fontSize: 14, fontWeight: "800", color: COLORS.primary },
  weighToggleTextOpen: { color: COLORS.primaryDark },

  weighPanel: {
    padding: 14,
    backgroundColor: COLORS.primarySoft,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderFocus,
  },
  weighRow: { flexDirection: "row", gap: 10 },
  weighField: { flex: 1 },
  weighFieldWide: { flex: 1.5 },
  weighLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 5,
  },
  weighInput: {
    borderWidth: 1,
    borderColor: COLORS.borderFocus,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
  },
  weighHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 8,
    fontStyle: "italic",
  },
  weighError: { fontSize: 12.5, color: COLORS.danger, marginTop: 8 },
  weighSave: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  weighSaveText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  empty: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyGlyph: { fontSize: 40, marginBottom: 12 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: 7,
  },
  emptyBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: COLORS.borderFocus,
  },
  formHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  formDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    marginRight: 9,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 7,
    marginTop: 14,
  },
  hint: { fontSize: 12, color: COLORS.textMuted, marginTop: 7, lineHeight: 17 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
  },

  segmented: { flexDirection: "row", gap: 7 },
  segment: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    minHeight: 44,
  },
  segmentActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  segmentText: {
    fontSize: 12.5,
    color: COLORS.textSecondary,
    fontWeight: "600",
    textAlign: "center",
  },
  segmentTextActive: { color: COLORS.primary, fontWeight: "800" },

  formActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  buttonFlex: { flex: 1 },
  secondaryButton: {
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: "700",
  },

  footnote: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    textAlign: "center",
    paddingHorizontal: 20,
    marginTop: 8,
    lineHeight: 18,
  },

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
