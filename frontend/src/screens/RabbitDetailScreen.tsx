import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as rabbitsApi from "../api/rabbits";
import { COLORS, MOTION, RADIUS } from "../theme";
import type { Rabbit } from "../types";

const BREEDS = [
  "Dutch",
  "Lionhead",
  "New Zealand White",
  "Rex",
  "Angora",
  "Himalayan",
  "Mixed",
  "Unknown",
];

const SEXES = [
  { value: "female", label: "Female", colour: COLORS.female },
  { value: "male", label: "Male", colour: COLORS.male },
  { value: "unknown", label: "Unknown", colour: COLORS.unknown },
];

const AVATAR_COLORS = ["#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316"];

function avatarColour(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function describeAge(dateOfBirth: string | null): string {
  if (!dateOfBirth) return "Unknown";
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return "Unknown";

  const days = Math.floor((Date.now() - born.getTime()) / 86400000);
  if (days < 0) return "Unknown";
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"}`;

  const weeks = Math.floor(days / 7);
  if (weeks < 52) return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;

  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months === 0 ? `${years}y` : `${years}y ${months}m`;
}

function formatWeight(grams: number | null): string {
  if (grams === null) return "Not recorded";
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams} g`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Chip({
  label,
  selected,
  onPress,
  activeColour = COLORS.primary,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  activeColour?: string;
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
        onPress={onPress}
        onPressIn={() => animate(0.94)}
        onPressOut={() => animate(1)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={[
          styles.chip,
          selected && { backgroundColor: activeColour, borderColor: activeColour },
        ]}
      >
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function RabbitDetailScreen({ route, navigation }: any) {
  const { rabbitId } = route.params;
  const insets = useSafeAreaInsets();

  const [rabbit, setRabbit] = useState<Rabbit | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draft state, only populated when entering edit mode.
  const [name, setName] = useState("");
  const [breed, setBreed] = useState<string | null>(null);
  const [sex, setSex] = useState("unknown");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [weight, setWeight] = useState("");
  const [colour, setColour] = useState("");
  const [notes, setNotes] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const entrance = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await rabbitsApi.getRabbit(rabbitId);
      setRabbit(data);
      navigation.setOptions({ title: data.name });
      Animated.timing(entrance, {
        toValue: 1,
        duration: MOTION.base,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this rabbit");
    } finally {
      setLoading(false);
    }
  }, [rabbitId, navigation, entrance]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function beginEditing() {
    if (!rabbit) return;
    setName(rabbit.name);
    setBreed(rabbit.breed);
    setSex(rabbit.sex);
    setDateOfBirth(rabbit.date_of_birth ?? "");
    setWeight(rabbit.weight_grams !== null ? String(rabbit.weight_grams) : "");
    setColour(rabbit.colour ?? "");
    setNotes(rabbit.notes ?? "");
    setError(null);
    setEditing(true);
  }

  function validate(): string | null {
    if (name.trim().length < 1) return "Please enter a name.";

    if (dateOfBirth) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
        return "Date of birth must be in YYYY-MM-DD format.";
      }
      const parsed = new Date(dateOfBirth);
      if (Number.isNaN(parsed.getTime())) return "That date is not valid.";
      if (parsed.getTime() > Date.now()) return "Date of birth cannot be in the future.";
    }

    if (weight) {
      const grams = Number(weight);
      if (!Number.isFinite(grams) || grams <= 0) {
        return "Weight must be a positive number of grams.";
      }
      if (grams > 15000) return "Weight seems too high. Please check the value.";
    }

    return null;
  }

  /**
   * Build a PATCH body containing only fields the user actually changed.
   * Sending unchanged values would work, but a minimal diff makes the
   * request self-documenting and matches the semantics of PATCH.
   */
  function buildDiff(): Record<string, unknown> {
    if (!rabbit) return {};
    const diff: Record<string, unknown> = {};

    if (name.trim() !== rabbit.name) diff.name = name.trim();
    if (breed !== rabbit.breed) diff.breed = breed;
    if (sex !== rabbit.sex) diff.sex = sex;

    const dob = dateOfBirth || null;
    if (dob !== rabbit.date_of_birth) diff.date_of_birth = dob;

    const grams = weight ? Number(weight) : null;
    if (grams !== rabbit.weight_grams) diff.weight_grams = grams;

    const col = colour.trim() || null;
    if (col !== rabbit.colour) diff.colour = col;

    const nts = notes.trim() || null;
    if (nts !== rabbit.notes) diff.notes = nts;

    return diff;
  }

  async function handleSave() {
    if (saving || !rabbit) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const diff = buildDiff();
    if (Object.keys(diff).length === 0) {
      setEditing(false);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const updated = await rabbitsApi.updateRabbit(rabbit.id, diff as any);
      setRabbit(updated);
      navigation.setOptions({ title: updated.name });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!rabbit) return;
    Alert.alert(
      `Delete ${rabbit.name}?`,
      "This permanently removes the record and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: handleDelete },
      ],
    );
  }

  async function handleDelete() {
    if (deleting || !rabbit) return;

    setDeleting(true);
    try {
      await rabbitsApi.deleteRabbit(rabbit.id);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this rabbit");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!rabbit) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Rabbit not found</Text>
        <Text style={styles.emptyBody}>
          {error ?? "This record may have been deleted."}
        </Text>
      </View>
    );
  }

  /* ---------------------------- edit mode ---------------------------- */

  if (editing) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basics</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={[styles.input, focusedField === "name" && styles.inputFocused]}
              value={name}
              onChangeText={setName}
              onFocus={() => setFocusedField("name")}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="words"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.label}>Sex</Text>
            <View style={styles.chipRow}>
              {SEXES.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={sex === option.value}
                  activeColour={option.colour}
                  onPress={() => setSex(option.value)}
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Breed</Text>
            <Text style={styles.hint}>Tap again to clear.</Text>
            <View style={styles.chipRow}>
              {BREEDS.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  selected={breed === option}
                  onPress={() => setBreed(breed === option ? null : option)}
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>

            <Text style={styles.label}>Date of birth</Text>
            <TextInput
              style={[styles.input, focusedField === "dob" && styles.inputFocused]}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              onFocus={() => setFocusedField("dob")}
              onBlur={() => setFocusedField(null)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.label}>Weight in grams</Text>
            <TextInput
              style={[styles.input, focusedField === "weight" && styles.inputFocused]}
              value={weight}
              onChangeText={setWeight}
              onFocus={() => setFocusedField("weight")}
              onBlur={() => setFocusedField(null)}
              keyboardType="number-pad"
              placeholder="e.g. 1450"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.label}>Colour</Text>
            <TextInput
              style={[styles.input, focusedField === "colour" && styles.inputFocused]}
              value={colour}
              onChangeText={setColour}
              onFocus={() => setFocusedField("colour")}
              onBlur={() => setFocusedField(null)}
              placeholder="e.g. Chestnut"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                focusedField === "notes" && styles.inputFocused,
              ]}
              value={notes}
              onChangeText={setNotes}
              onFocus={() => setFocusedField("notes")}
              onBlur={() => setFocusedField(null)}
              multiline
              textAlignVertical="top"
              maxLength={500}
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.counter}>{notes.length}/500</Text>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save changes</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.buttonGhost}
            onPress={() => {
              setEditing(false);
              setError(null);
            }}
            disabled={saving}
          >
            <Text style={styles.buttonGhostText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  /* ---------------------------- view mode ---------------------------- */

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View
        style={{
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
          ],
        }}
      >
        <View style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: avatarColour(rabbit.id) }]}>
            <Text style={styles.avatarText}>{initials(rabbit.name)}</Text>
          </View>
          <Text style={styles.heroName}>{rabbit.name}</Text>
          <View style={styles.heroTags}>
            {rabbit.breed && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{rabbit.breed}</Text>
              </View>
            )}
            <View
              style={[
                styles.badgeSex,
                {
                  backgroundColor:
                    rabbit.sex === "female"
                      ? "#fce7f3"
                      : rabbit.sex === "male"
                        ? "#dbeafe"
                        : "#f1f5f9",
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeSexText,
                  {
                    color:
                      rabbit.sex === "female"
                        ? COLORS.female
                        : rabbit.sex === "male"
                          ? COLORS.male
                          : COLORS.textSecondary,
                  },
                ]}
              >
                {rabbit.sex}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statRow}>
          <StatTile label="Age" value={describeAge(rabbit.date_of_birth)} />
          <StatTile label="Weight" value={formatWeight(rabbit.weight_grams)} />
          <StatTile label="Colour" value={rabbit.colour ?? "—"} />
        </View>

        {rabbit.predicted_breed && (
          <View style={styles.aiCard}>
            <Text style={styles.aiLabel}>AI breed prediction</Text>
            <Text style={styles.aiValue}>{rabbit.predicted_breed}</Text>
            {rabbit.breed_confidence !== null && (
              <Text style={styles.aiMeta}>
                {(rabbit.breed_confidence * 100).toFixed(1)}% confidence
              </Text>
            )}
          </View>
        )}

        {rabbit.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesText}>{rabbit.notes}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Record</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Date of birth</Text>
            <Text style={styles.metaValue}>
              {rabbit.date_of_birth ? formatDate(rabbit.date_of_birth) : "Not recorded"}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Added</Text>
            <Text style={styles.metaValue}>{formatDate(rabbit.created_at)}</Text>
          </View>
          <View style={[styles.metaRow, styles.metaRowLast]}>
            <Text style={styles.metaLabel}>Last updated</Text>
            <Text style={styles.metaValue}>{formatDate(rabbit.updated_at)}</Text>
          </View>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={styles.buttonSecondary}
          onPress={() => navigation.navigate("IllnessCheck", { rabbitId: rabbit.id })}
          accessibilityRole="button"
          accessibilityLabel={`Run a health check for ${rabbit.name}`}
        >
          <Text style={styles.buttonSecondaryText}>Run a health check</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={beginEditing}
          accessibilityRole="button"
          accessibilityLabel="Edit rabbit"
        >
          <Text style={styles.buttonText}>Edit details</Text>
        </Pressable>

        <Pressable
          style={[styles.buttonDanger, deleting && styles.buttonDisabled]}
          onPress={confirmDelete}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel="Delete rabbit"
        >
          {deleting ? (
            <ActivityIndicator color={COLORS.danger} />
          ) : (
            <Text style={styles.buttonDangerText}>Delete rabbit</Text>
          )}
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 18 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
    padding: 32,
  },

  hero: { alignItems: "center", paddingVertical: 18 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarText: { color: "#fff", fontSize: 28, fontWeight: "700", letterSpacing: 0.5 },
  heroName: {
    fontSize: 26,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  heroTags: { flexDirection: "row", gap: 8, marginTop: 10 },

  badge: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: { color: COLORS.primary, fontSize: 12.5, fontWeight: "700" },
  badgeSex: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeSexText: { fontSize: 12.5, fontWeight: "700", textTransform: "capitalize" },

  statRow: { flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 14 },
  statTile: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  statLabel: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 3 },

  aiCard: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  aiLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: COLORS.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  aiValue: {
    fontSize: 19,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginTop: 5,
  },
  aiMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 3 },

  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  hint: { fontSize: 12.5, color: COLORS.textMuted, marginTop: -6, marginBottom: 10 },
  notesText: {
    fontSize: 14.5,
    color: COLORS.textSecondary,
    lineHeight: 21,
    marginTop: -4,
  },

  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  metaRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  metaLabel: { fontSize: 13.5, color: COLORS.textSecondary },
  metaValue: { fontSize: 13.5, color: COLORS.textPrimary, fontWeight: "600" },

  label: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
  },
  inputFocused: { borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  textArea: { height: 100, paddingTop: 12 },
  counter: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    textAlign: "right",
    marginTop: 5,
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.background,
  },
  chipText: { fontSize: 13.5, color: COLORS.textSecondary, fontWeight: "600" },
  chipTextSelected: { color: "#fff", fontWeight: "700" },

  errorBanner: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
  },
  errorText: { color: COLORS.danger, fontSize: 13.5, lineHeight: 19 },

  buttonSecondary: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.sm,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  buttonSecondaryText: { color: COLORS.primary, fontSize: 15, fontWeight: "700" },

  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
    elevation: 3,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  buttonGhost: { paddingVertical: 14, alignItems: "center", marginTop: 6 },
  buttonGhostText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: "600" },

  buttonDanger: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.sm,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  buttonDangerText: { color: COLORS.danger, fontSize: 15, fontWeight: "700" },

  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  emptyBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
});