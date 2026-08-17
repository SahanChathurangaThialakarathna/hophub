import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as rabbitsApi from "../api/rabbits";
import { COLORS, MOTION, RADIUS } from "../theme";

/** The six classes the CNN is trained on, plus fallbacks. Mirrors the API enum. */
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

export default function AddRabbitScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [breed, setBreed] = useState<string | null>(null);
  const [sex, setSex] = useState("unknown");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [weight, setWeight] = useState("");
  const [colour, setColour] = useState("");
  const [notes, setNotes] = useState("");

  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const entrance = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: MOTION.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

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

  async function handleSubmit() {
    if (submitting) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await rabbitsApi.createRabbit({
        name: name.trim(),
        breed: breed ?? undefined,
        sex,
        date_of_birth: dateOfBirth || undefined,
        weight_grams: weight ? Number(weight) : undefined,
        colour: colour.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save rabbit");
    } finally {
      setSubmitting(false);
    }
  }

  function animateButton(value: number) {
    Animated.spring(buttonScale, {
      toValue: value,
      useNativeDriver: true,
      speed: 50,
      bounciness: 5,
    }).start();
  }

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
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basics</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={[styles.input, focused === "name" && styles.inputFocused]}
              placeholder="e.g. Coco"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              onFocus={() => setFocused("name")}
              onBlur={() => setFocused(null)}
              autoCapitalize="words"
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
            <Text style={styles.hint}>Tap again to clear your choice.</Text>
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
              style={[styles.input, focused === "dob" && styles.inputFocused]}
              placeholder="YYYY-MM-DD (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              onFocus={() => setFocused("dob")}
              onBlur={() => setFocused(null)}
              keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
            />

            <Text style={styles.label}>Weight in grams</Text>
            <TextInput
              style={[styles.input, focused === "weight" && styles.inputFocused]}
              placeholder="e.g. 1450 (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={weight}
              onChangeText={setWeight}
              onFocus={() => setFocused("weight")}
              onBlur={() => setFocused(null)}
              keyboardType="number-pad"
            />

            <Text style={styles.label}>Colour</Text>
            <TextInput
              style={[styles.input, focused === "colour" && styles.inputFocused]}
              placeholder="e.g. Chestnut (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={colour}
              onChangeText={setColour}
              onFocus={() => setFocused("colour")}
              onBlur={() => setFocused(null)}
            />

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                focused === "notes" && styles.inputFocused,
              ]}
              placeholder="Temperament, habits, anything worth remembering"
              placeholderTextColor={COLORS.textMuted}
              value={notes}
              onChangeText={setNotes}
              onFocus={() => setFocused("notes")}
              onBlur={() => setFocused(null)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.counter}>{notes.length}/500</Text>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <Pressable
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleSubmit}
              onPressIn={() => animateButton(0.97)}
              onPressOut={() => animateButton(1)}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Save rabbit"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Save rabbit</Text>
              )}
            </Pressable>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 18, paddingTop: 14 },

  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 1,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  hint: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    marginTop: -6,
    marginBottom: 10,
  },

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
  inputFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
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

  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 16,
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
});