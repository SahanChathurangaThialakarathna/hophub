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

import { useAuth } from "../context/AuthContext";
import { COLORS, MOTION, RADIUS } from "../theme";

/** Simple strength signal — length-based, matching current NIST guidance. */
function passwordStrength(password: string): { label: string; ratio: number; colour: string } {
  if (password.length === 0) return { label: "", ratio: 0, colour: COLORS.border };
  if (password.length < 8) return { label: "Too short", ratio: 0.25, colour: COLORS.danger };
  if (password.length < 12) return { label: "Fair", ratio: 0.6, colour: "#f59e0b" };
  return { label: "Strong", ratio: 1, colour: COLORS.success };
}

export default function RegisterScreen({ navigation }: any) {
  const { signUp } = useAuth();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const entrance = useRef(new Animated.Value(0)).current;
  const strengthBar = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  const strength = passwordStrength(password);

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: MOTION.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  useEffect(() => {
    // Width cannot use the native driver, so this one runs on the JS thread.
    Animated.timing(strengthBar, {
      toValue: strength.ratio,
      duration: MOTION.fast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [strength.ratio, strengthBar]);

  function validate(): string | null {
    if (fullName.trim().length < 2) return "Please enter your full name.";
    if (!email.includes("@")) return "Please enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
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
      await signUp({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        location_city: locationCity.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
                  outputRange: [20, 0],
                }),
              },
            ],
          }}
        >
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>
            Track your rabbits' health, growth and care in one place.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={[styles.input, focused === "name" && styles.inputFocused]}
              placeholder="Sahan Chathuranga"
              placeholderTextColor={COLORS.textMuted}
              value={fullName}
              onChangeText={setFullName}
              onFocus={() => setFocused("name")}
              onBlur={() => setFocused(null)}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, focused === "email" && styles.inputFocused]}
              placeholder="you@example.com"
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={[styles.input, focused === "password" && styles.inputFocused]}
              placeholder="At least 8 characters"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
              secureTextEntry
              autoCapitalize="none"
            />

            {password.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthTrack}>
                  <Animated.View
                    style={[
                      styles.strengthFill,
                      {
                        backgroundColor: strength.colour,
                        width: strengthBar.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0%", "100%"],
                        }),
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.colour }]}>
                  {strength.label}
                </Text>
              </View>
            )}

            <Text style={styles.label}>City</Text>
            <TextInput
              style={[styles.input, focused === "city" && styles.inputFocused]}
              placeholder="Padukka (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={locationCity}
              onChangeText={setLocationCity}
              onFocus={() => setFocused("city")}
              onBlur={() => setFocused(null)}
            />

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
                accessibilityLabel="Create account"
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Create account</Text>
                )}
              </Pressable>
            </Animated.View>
          </View>

          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.linkWrap, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.linkMuted}>Already have an account? </Text>
            <Text style={styles.link}>Sign in</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundWarm },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 20 },

  title: {
    fontSize: 27,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14.5,
    color: COLORS.textSecondary,
    marginTop: 6,
    marginBottom: 22,
    lineHeight: 20,
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },

  label: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 4,
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
    marginBottom: 14,
  },
  inputFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },

  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: -6,
    marginBottom: 14,
  },
  strengthTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    overflow: "hidden",
    marginRight: 10,
  },
  strengthFill: { height: 5, borderRadius: 3 },
  strengthLabel: { fontSize: 12, fontWeight: "700", minWidth: 62 },

  errorBanner: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.sm,
    padding: 11,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
  },
  errorText: { color: COLORS.danger, fontSize: 13.5, lineHeight: 19 },

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

  linkWrap: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  linkMuted: { color: COLORS.textSecondary, fontSize: 14.5 },
  link: { color: COLORS.primary, fontSize: 14.5, fontWeight: "700" },
});