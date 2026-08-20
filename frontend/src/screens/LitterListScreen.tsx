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
import type { HousingContext, Litter } from "../api/kits";
import { COLORS, MOTION, RADIUS } from "../theme";

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

/** Local date as YYYY-MM-DD. toISOString() would shift by the UTC offset,
 *  which in Sri Lanka (UTC+5:30) reports yesterday's date all evening —
 *  filing a weighing a day early and skewing every derived age. */
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

function ageInDays(kindlingDate: string): number {
  const born = parseLocalDate(kindlingDate).getTime();
  const now = parseLocalDate(todayLocal()).getTime();
  return Math.round((now - born) / 86400000);
}

function describeAge(kindlingDate: string): string {
  const days = ageInDays(kindlingDate);
  if (days < 0) return "Not yet born";
  if (days === 0) return "Born today";
  if (days === 1) return "1 day old";
  if (days < 14) return `${days} days old`;
  const weeks = Math.floor(days / 7);
  const spare = days % 7;
  if (spare === 0) return `${weeks} weeks old`;
  return `${weeks} wk ${spare}d old`;
}

/**
 * Life stage, keyed to the rearing milestones in the published sources.
 * Palka et al. weaned at 35 days; kits begin taking solid food from around
 * day 18. Showing the stage tells an owner what to expect right now, which
 * a date alone does not.
 */
function litterStage(kindlingDate: string): {
  label: string;
  colour: string;
  soft: string;
} {
  const days = ageInDays(kindlingDate);
  if (days < 18) {
    return { label: "In the nest", colour: COLORS.stageNursing, soft: COLORS.stageNursingSoft };
  }
  if (days < 35) {
    return { label: "Starting solids", colour: COLORS.stageSolids, soft: COLORS.stageSolidsSoft };
  }
  if (days < 84) {
    return { label: "Weaned", colour: COLORS.stageWeaned, soft: COLORS.stageWeanedSoft };
  }
  return { label: "Grown on", colour: COLORS.stageGrown, soft: COLORS.stageGrownSoft };
}

const HOUSING_OPTIONS: { value: HousingContext; label: string }[] = [
  { value: "individual", label: "On their own" },
  { value: "group", label: "In a group" },
  { value: "unknown", label: "Not sure" },
];

/* ------------------------------------------------------------------ */
/* Litter card                                                         */
/* ------------------------------------------------------------------ */

function LitterCard({
  litter,
  index,
  onPress,
}: {
  litter: Litter;
  index: number;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const entrance = useRef(new Animated.Value(0)).current;

  // Staggered entrance: each card follows the one above by a fixed delay,
  // so the list resolves as a sequence rather than appearing all at once.
  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: MOTION.base,
      delay: index * MOTION.stagger,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance, index]);

  function animate(value: number) {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 60,
      bounciness: 8,
    }).start();
  }

  const stage = litterStage(litter.kindling_date);
  const alive = litter.litter_size_alive;
  const born = litter.litter_size_born;

  return (
    <Animated.View
      style={{
        opacity: entrance,
        transform: [
          { scale },
          {
            translateY: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [18, 0],
            }),
          },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => animate(0.985)}
        onPressOut={() => animate(1)}
        style={[styles.card, { backgroundColor: stage.soft }]}
        accessibilityRole="button"
        accessibilityLabel={`Litter born ${litter.kindling_date}, ${describeAge(
          litter.kindling_date,
        )}, ${stage.label}`}
      >
        <View style={[styles.cardAccent, { backgroundColor: stage.colour }]} />

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: stage.colour }]}>
                {describeAge(litter.kindling_date)}
              </Text>
              <Text style={styles.cardDate}>Born {litter.kindling_date}</Text>
            </View>
            <Text style={[styles.cardChevron, { color: stage.colour }]}>›</Text>
          </View>

          <View style={styles.cardMetaRow}>
            <View style={[styles.stageChip, { backgroundColor: stage.colour }]}>
              <Text style={styles.stageChipText}>{stage.label}</Text>
            </View>
            {alive != null && (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>
                  {alive} {alive === 1 ? "kit" : "kits"}
                  {born != null && born !== alive ? ` of ${born}` : ""}
                </Text>
              </View>
            )}
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>
                {litter.housing_context === "group" ? "Group" : "Individual"}
              </Text>
            </View>
          </View>

          {litter.notes ? (
            <Text style={styles.cardNotes} numberOfLines={2}>
              {litter.notes}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Create form                                                         */
/* ------------------------------------------------------------------ */

function CreateLitterForm({
  onCreated,
  onCancel,
}: {
  onCreated: (litter: Litter) => void;
  onCancel: () => void;
}) {
  const [kindlingDate, setKindlingDate] = useState(todayLocal());
  const [born, setBorn] = useState("");
  const [alive, setAlive] = useState("");
  const [housing, setHousing] = useState<HousingContext>("individual");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: MOTION.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  async function handleSave() {
    if (saving) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(kindlingDate)) {
      setError("Enter the birth date as YYYY-MM-DD.");
      return;
    }

    const bornNum = born.trim() === "" ? null : Number(born);
    const aliveNum = alive.trim() === "" ? null : Number(alive);

    if (bornNum != null && aliveNum != null && aliveNum > bornNum) {
      setError("There cannot be more kits alive than were born.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const litter = await kitsApi.createLitter({
        kindling_date: kindlingDate,
        litter_size_born: bornNum,
        litter_size_alive: aliveNum,
        housing_context: housing,
        notes: notes.trim() === "" ? null : notes.trim(),
      });
      onCreated(litter);
    } catch (err) {
      setError(kitsApi.kitError(err, "Could not save the litter"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Animated.View
      style={[
        styles.formCard,
        {
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.formHeader}>
        <View style={styles.formDot} />
        <Text style={styles.formTitle}>New litter</Text>
      </View>

      <Text style={styles.label}>Date they were born</Text>
      <TextInput
        style={styles.input}
        value={kindlingDate}
        onChangeText={setKindlingDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={COLORS.textMuted}
        autoCapitalize="none"
        accessibilityLabel="Birth date"
      />
      <Text style={styles.hint}>
        Every kit's age is worked out from this date, so it is worth getting right.
      </Text>

      <View style={styles.fieldRow}>
        <View style={styles.fieldHalf}>
          <Text style={styles.label}>Born</Text>
          <TextInput
            style={styles.input}
            value={born}
            onChangeText={setBorn}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={COLORS.textMuted}
            accessibilityLabel="Number born"
          />
        </View>
        <View style={styles.fieldHalf}>
          <Text style={styles.label}>Still alive</Text>
          <TextInput
            style={styles.input}
            value={alive}
            onChangeText={setAlive}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={COLORS.textMuted}
            accessibilityLabel="Number alive"
          />
        </View>
      </View>

      <Text style={styles.label}>How are they housed?</Text>
      <View style={styles.segmented}>
        {HOUSING_OPTIONS.map((option) => {
          const active = housing === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setHousing(option.value)}
              style={[styles.segment, active && styles.segmentActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
            >
              <Text
                style={[styles.segmentText, active && styles.segmentTextActive]}
                numberOfLines={2}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>
        This picks the growth curve they are compared against. Published research
        found housing affects growth more than breed does.
      </Text>

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything worth remembering"
        placeholderTextColor={COLORS.textMuted}
        multiline
        accessibilityLabel="Notes"
      />

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.formActions}>
        <Pressable
          style={styles.secondaryButton}
          onPress={onCancel}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.buttonFlex, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save litter"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Save litter</Text>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function LitterListScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [litters, setLitters] = useState<Litter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await kitsApi.listLitters();
      setLitters(data);
      setError(null);
    } catch (err) {
      setError(kitsApi.kitError(err, "Could not load litters"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload on focus so returning from the detail screen picks up any kits
  // added or weights recorded while away.
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
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Own title block rather than a navigation header, matching the
          rabbit list. insets.top keeps it clear of the status bar. */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Litters</Text>
        <Text style={styles.headerSubtitle}>
          Track how each kit is growing against published reference weights.
        </Text>
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

        {showForm && (
          <CreateLitterForm
            onCreated={(litter) => {
              setShowForm(false);
              setLitters((prev) => [litter, ...prev]);
              navigation.navigate("LitterDetail", { litterId: litter.id });
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {litters.length === 0 && !showForm ? (
          <View style={styles.empty}>
            <Text style={styles.emptyGlyph}>🐰</Text>
            <Text style={styles.emptyTitle}>No litters yet</Text>
            <Text style={styles.emptyBody}>
              Add a litter, then weigh each kit once a week. Three weighings give
              a first trend; five make it reliable.
            </Text>
          </View>
        ) : (
          litters.map((litter, index) => (
            <LitterCard
              key={litter.id}
              litter={litter}
              index={index}
              onPress={() =>
                navigation.navigate("LitterDetail", { litterId: litter.id })
              }
            />
          ))
        )}
      </ScrollView>

      {!showForm && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            style={styles.button}
            onPress={() => setShowForm(true)}
            accessibilityRole="button"
            accessibilityLabel="Add a litter"
          >
            <Text style={styles.buttonText}>Add a litter</Text>
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
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.6,
  },
  headerSubtitle: {
    fontSize: 13.5,
    color: COLORS.textSecondary,
    marginTop: 5,
    lineHeight: 19,
  },

  card: {
    flexDirection: "row",
    borderRadius: RADIUS.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  cardAccent: { width: 5 },
  cardBody: { flex: 1, padding: 16 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start" },
  cardHeaderText: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  cardChevron: { fontSize: 24, fontWeight: "600", marginLeft: 8, marginTop: -2 },
  cardDate: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 3 },
  cardMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  stageChip: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  stageChipText: { fontSize: 11.5, color: "#fff", fontWeight: "800" },
  metaChip: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metaChipText: { fontSize: 11.5, color: COLORS.textSecondary, fontWeight: "700" },
  cardNotes: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 11,
    lineHeight: 18,
  },

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
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 7,
    lineHeight: 17,
  },
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
  inputMultiline: { minHeight: 72, textAlignVertical: "top", paddingTop: 12 },
  fieldRow: { flexDirection: "row", gap: 12 },
  fieldHalf: { flex: 1 },

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
    minHeight: 46,
  },
  segmentActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  segmentText: {
    fontSize: 12,
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
