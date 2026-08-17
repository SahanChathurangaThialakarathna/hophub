import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import * as rabbitsApi from "../api/rabbits";
import { useAuth } from "../context/AuthContext";
import { COLORS, MOTION, RADIUS } from "../theme";
import type { Rabbit } from "../types";

/** Deterministic accent colour per rabbit, so each card is visually distinct. */
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
  if (!dateOfBirth) return "Age unknown";
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return "Age unknown";

  const days = Math.floor((Date.now() - born.getTime()) / 86400000);
  if (days < 0) return "Age unknown";
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} old`;

  const weeks = Math.floor(days / 7);
  if (weeks < 52) return `${weeks} ${weeks === 1 ? "week" : "weeks"} old`;

  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (months === 0) return `${years} ${years === 1 ? "year" : "years"} old`;
  return `${years}y ${months}m old`;
}

function formatWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams} g`;
}

function sexColour(sex: string): string {
  if (sex === "female") return COLORS.female;
  if (sex === "male") return COLORS.male;
  return COLORS.unknown;
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

function RabbitCard({
  rabbit,
  index,
  onPress,
}: {
  rabbit: Rabbit;
  index: number;
  onPress: () => void;
}) {
  // Each card fades and slides in, staggered by its position in the list.
  const anim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: MOTION.base,
      delay: Math.min(index, 8) * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, index]);

  function animateTo(value: number) {
    Animated.spring(pressScale, {
      toValue: value,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  }

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
            { scale: pressScale },
          ],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        style={styles.cardInner}
        accessibilityRole="button"
        accessibilityLabel={`View details for ${rabbit.name}`}
      >
        <View style={[styles.avatar, { backgroundColor: avatarColour(rabbit.id) }]}>
          <Text style={styles.avatarText}>{initials(rabbit.name)}</Text>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName} numberOfLines={1}>
              {rabbit.name}
            </Text>
            <View style={[styles.sexDot, { backgroundColor: sexColour(rabbit.sex) }]} />
          </View>

          <Text style={styles.cardMeta}>
            {describeAge(rabbit.date_of_birth)}
            {rabbit.weight_grams !== null && `  ·  ${formatWeight(rabbit.weight_grams)}`}
          </Text>

          <View style={styles.tagRow}>
            {rabbit.breed && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{rabbit.breed}</Text>
              </View>
            )}
            {rabbit.colour && (
              <View style={styles.badgeNeutral}>
                <Text style={styles.badgeNeutralText}>{rabbit.colour}</Text>
              </View>
            )}
          </View>

          {rabbit.notes && (
            <Text style={styles.cardNotes} numberOfLines={2}>
              {rabbit.notes}
            </Text>
          )}
        </View>

        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function RabbitListScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [rabbits, setRabbits] = useState<Rabbit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fabScale = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await rabbitsApi.listRabbits();
      setRabbits(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load rabbits");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function handleRefresh() {
    setRefreshing(true);
    load();
  }

  function animateFab(value: number) {
    Animated.spring(fabScale, {
      toValue: value,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }

  const firstName = user?.full_name.split(" ")[0] ?? "there";

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your rabbits…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerTextGroup}>
          <Text style={styles.greeting} numberOfLines={1}>
            Hello, {firstName}
          </Text>
          <Text style={styles.headerMeta}>
            {rabbits.length === 0
              ? "No rabbits yet"
              : `${rabbits.length} ${rabbits.length === 1 ? "rabbit" : "rabbits"} in your care`}
          </Text>
        </View>

        <Pressable
          onPress={signOut}
          hitSlop={10}
          style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={rabbits}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <RabbitCard
            rabbit={item}
            index={index}
            onPress={() => navigation.navigate("RabbitDetail", { rabbitId: item.id })}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyCircle}>
              <Text style={styles.emptyGlyph}>🐇</Text>
            </View>
            <Text style={styles.emptyTitle}>No rabbits yet</Text>
            <Text style={styles.emptyBody}>
              Tap the + button below to add your first rabbit and start tracking
              their care.
            </Text>
          </View>
        }
      />

      <Animated.View
        style={[
          styles.fabWrapper,
          { bottom: insets.bottom + 24, transform: [{ scale: fabScale }] },
        ]}
      >
        <Pressable
          onPress={() => navigation.navigate("AddRabbit")}
          onPressIn={() => animateFab(0.92)}
          onPressOut={() => animateFab(1)}
          style={styles.fab}
          accessibilityLabel="Add a rabbit"
          accessibilityRole="button"
        >
          <Text style={styles.fabIcon}>+</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTextGroup: { flex: 1, paddingRight: 12 },
  greeting: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  headerMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  signOutButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.dangerSoft,
  },
  signOutText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  pressed: { opacity: 0.6 },

  errorBanner: {
    backgroundColor: COLORS.dangerSoft,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: RADIUS.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
  },
  errorText: { color: COLORS.danger, fontSize: 13.5 },

  listContent: { padding: 16, flexGrow: 1 },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 1,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardInner: { flexDirection: "row", padding: 14, alignItems: "center" },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: "row", alignItems: "center" },
  cardName: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  sexDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  cardMeta: {
    fontSize: 13.5,
    color: COLORS.textSecondary,
    marginTop: 3,
  },

  chevron: {
    fontSize: 26,
    color: COLORS.textMuted,
    marginLeft: 8,
    fontWeight: "300",
  },

  tagRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 9 },
  badge: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 11.5,
    fontWeight: "700",
  },
  badgeNeutral: {
    backgroundColor: "#f1f5f9",
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  badgeNeutralText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: "600",
  },

  cardNotes: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 8,
    fontStyle: "italic",
    lineHeight: 18,
  },

  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 70,
    paddingHorizontal: 32,
  },
  emptyCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyGlyph: { fontSize: 40 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  emptyBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 21,
  },

  fabWrapper: { position: "absolute", right: 20 },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  fabIcon: {
    color: "#ffffff",
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "300",
  },
});