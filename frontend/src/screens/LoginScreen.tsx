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

export default function LoginScreen({ navigation }: any) {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const entrance = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: MOTION.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  /** Horizontal shake on failure — a familiar signal that input was rejected. */
  function shakeForm() {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.6, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  async function handleSubmit() {
    if (submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      await signIn({ email: email.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      shakeForm();
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
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 },
        ]}
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
                  outputRange: [24, 0],
                }),
              },
              {
                translateX: shake.interpolate({
                  inputRange: [-1, 1],
                  outputRange: [-9, 9],
                }),
              },
            ],
          }}
        >
          <View style={styles.logoCircle}>
            <Text style={styles.logoGlyph}>🐇</Text>
          </View>

          <Text style={styles.title}>HopHub</Text>
          <Text style={styles.subtitle}>Care for your rabbits, intelligently</Text>

          <View style={styles.card}>
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
              textContentType="emailAddress"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={[styles.input, focused === "password" && styles.inputFocused]}
              placeholder="••••••••"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
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
                accessibilityLabel="Sign in"
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Sign in</Text>
                )}
              </Pressable>
            </Animated.View>
          </View>

          <Pressable
            onPress={() => navigation.navigate("Register")}
            style={({ pressed }) => [styles.linkWrap, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.linkMuted}>No account? </Text>
            <Text style={styles.link}>Create one</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundWarm },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22 },

  logoCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: COLORS.primarySoft,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoGlyph: { fontSize: 38 },

  title: {
    fontSize: 34,
    fontWeight: "800",
    textAlign: "center",
    color: COLORS.textPrimary,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 14.5,
    textAlign: "center",
    color: COLORS.textSecondary,
    marginTop: 6,
    marginBottom: 26,
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

  linkWrap: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 22,
  },
  linkMuted: { color: COLORS.textSecondary, fontSize: 14.5 },
  link: { color: COLORS.primary, fontSize: 14.5, fontWeight: "700" },
});