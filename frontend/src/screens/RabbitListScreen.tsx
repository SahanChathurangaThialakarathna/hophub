import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import * as rabbitsApi from "../api/rabbits";
import { useAuth } from "../context/AuthContext";
import type { Rabbit } from "../types";

function ageInWeeks(dateOfBirth: string | null): string {
  if (!dateOfBirth) return "Age unknown";
  const born = new Date(dateOfBirth);
  const weeks = Math.floor((Date.now() - born.getTime()) / (1000 * 60 * 60 * 24 * 7));
  if (weeks < 0) return "Age unknown";
  if (weeks < 52) return `${weeks} weeks old`;
  const years = Math.floor(weeks / 52);
  return years === 1 ? "1 year old" : `${years} years old`;
}

function RabbitCard({ rabbit }: { rabbit: Rabbit }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{rabbit.name}</Text>
        {rabbit.breed && <Text style={styles.badge}>{rabbit.breed}</Text>}
      </View>
      <Text style={styles.cardMeta}>{ageInWeeks(rabbit.date_of_birth)}</Text>
      {rabbit.weight_grams !== null && (
        <Text style={styles.cardMeta}>{rabbit.weight_grams} g</Text>
      )}
      {rabbit.notes && (
        <Text style={styles.cardNotes} numberOfLines={2}>
          {rabbit.notes}
        </Text>
      )}
    </View>
  );
}

export default function RabbitListScreen() {
  const { user, signOut } = useAuth();

  const [rabbits, setRabbits] = useState<Rabbit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.full_name.split(" ")[0]}</Text>
          <Text style={styles.headerMeta}>
            {rabbits.length} {rabbits.length === 1 ? "rabbit" : "rabbits"}
          </Text>
        </View>
        <Pressable onPress={signOut} hitSlop={8}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={rabbits}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RabbitCard rabbit={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No rabbits yet</Text>
            <Text style={styles.emptyBody}>Rabbits you add will appear here.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  greeting: { fontSize: 20, fontWeight: "700", color: "#1f2937" },
  headerMeta: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  signOut: { color: "#dc2626", fontSize: 15, fontWeight: "500" },
  listContent: { padding: 16, flexGrow: 1 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  cardName: { fontSize: 17, fontWeight: "600", color: "#1f2937", flex: 1 },
  badge: {
    backgroundColor: "#eef2ff",
    color: "#4f46e5",
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    overflow: "hidden",
  },
  cardMeta: { fontSize: 14, color: "#6b7280", marginTop: 2 },
  cardNotes: {
    fontSize: 14,
    color: "#4b5563",
    marginTop: 8,
    fontStyle: "italic",
  },
  error: {
    color: "#dc2626",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
  },
  emptyTitle: { fontSize: 17, fontWeight: "600", color: "#374151" },
  emptyBody: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 6,
    textAlign: "center",
  },
});