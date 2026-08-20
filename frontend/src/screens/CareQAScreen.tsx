import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as careApi from "../api/care";
import type { CareAnswer, CareAnswerResponse, CareTopic, OwnerLevel } from "../api/care";
import { COLORS, MOTION, RADIUS } from "../theme";

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

const TOPIC_LABELS: Record<string, string> = {
  diet: "Food",
  housing: "Housing",
  health: "Health",
  behaviour: "Behaviour",
  handling: "Handling",
  grooming: "Grooming",
  climate: "Hot weather",
  senior: "Older rabbits",
  post_operative: "After surgery",
  dental: "Teeth",
  breeding: "Kits",
};

const TOPIC_COLOURS: Record<string, string> = {
  diet: COLORS.stageNursing,
  housing: COLORS.stageSolids,
  health: COLORS.growthBehind,
  behaviour: COLORS.stageWeaned,
  handling: COLORS.primary,
  grooming: COLORS.female,
  climate: COLORS.growthBelow,
  senior: COLORS.stageGrown,
  post_operative: COLORS.growthAbove,
  dental: COLORS.male,
  breeding: COLORS.stageNursing,
};

function topicLabel(topic: string): string {
  return TOPIC_LABELS[topic] ?? topic.replace(/_/g, " ");
}

function topicColour(topic: string): string {
  return TOPIC_COLOURS[topic] ?? COLORS.primary;
}

const LEVEL_OPTIONS: { value: OwnerLevel | null; label: string }[] = [
  { value: null, label: "Everything" },
  { value: "beginner", label: "New owner" },
  { value: "experienced", label: "Experienced" },
];

/* ------------------------------------------------------------------ */
/* Answer card                                                         */
/* ------------------------------------------------------------------ */

function AnswerCard({
  answer,
  isPrimary,
  onOpenSource,
}: {
  answer: CareAnswer;
  isPrimary: boolean;
  onOpenSource: (url: string) => void;
}) {
  const colour = topicColour(answer.topic);

  return (
    <View style={[styles.answerCard, !isPrimary && styles.relatedCard]}>
      <View style={styles.answerHeader}>
        <View style={[styles.topicPill, { backgroundColor: colour }]}>
          <Text style={styles.topicPillText}>{topicLabel(answer.topic)}</Text>
        </View>
        {answer.level === "experienced" && (
          <View style={styles.levelPill}>
            <Text style={styles.levelPillText}>Experienced</Text>
          </View>
        )}
      </View>

      <Text style={[styles.answerQuestion, isPrimary && styles.answerQuestionPrimary]}>
        {answer.question}
      </Text>
      <Text style={styles.answerBody}>{answer.answer}</Text>

      {/* The citation is part of the answer, not a footnote. Every response
          is reproduced from a source-checked entry, and the owner can go and
          read the original. */}
      <Pressable
        onPress={() => onOpenSource(answer.source_url)}
        style={styles.sourceRow}
        accessibilityRole="link"
        accessibilityLabel={`Read the original guidance at ${answer.source_name}`}
      >
        <Text style={styles.sourceLabel}>Source</Text>
        <Text style={[styles.sourceName, { color: colour }]} numberOfLines={1}>
          {answer.source_name} ›
        </Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function CareQAScreen() {
  const insets = useSafeAreaInsets();

  const [question, setQuestion] = useState("");
  const [level, setLevel] = useState<OwnerLevel | null>(null);
  const [topics, setTopics] = useState<CareTopic[]>([]);
  const [result, setResult] = useState<CareAnswerResponse | null>(null);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await careApi.listTopics();
        if (!cancelled) setTopics(data);
      } catch (err) {
        if (!cancelled) {
          setError(careApi.careError(err, "Could not load topics"));
        }
      } finally {
        if (!cancelled) setLoadingTopics(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const runSearch = useCallback(
    async (text: string, levelFilter: OwnerLevel | null) => {
      const trimmed = text.trim();
      if (trimmed.length < 2) {
        setError("Type a little more so I can find the right guidance.");
        return;
      }

      Keyboard.dismiss();
      setError(null);
      setAsking(true);
      entrance.setValue(0);

      try {
        const outcome = await careApi.ask(trimmed, levelFilter ?? undefined);
        setResult(outcome);
        Animated.timing(entrance, {
          toValue: 1,
          duration: MOTION.base,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      } catch (err) {
        setError(careApi.careError(err, "Could not answer that just now"));
      } finally {
        setAsking(false);
      }
    },
    [entrance],
  );

  function handleExample(example: string) {
    setQuestion(example);
    runSearch(example, level);
  }

  function openSource(url: string) {
    Linking.openURL(url).catch(() =>
      setError("Could not open that link on this device."),
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Care questions</Text>
        <Text style={styles.headerSubtitle}>
          Answers come from published rabbit care guidance, with a link to the
          original.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchCard}>
          <TextInput
            style={styles.input}
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask about food, housing, health…"
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={300}
            returnKeyType="search"
            onSubmitEditing={() => runSearch(question, level)}
            accessibilityLabel="Your question"
          />

          <View style={styles.segmented}>
            {LEVEL_OPTIONS.map((option) => {
              const active = level === option.value;
              return (
                <Pressable
                  key={option.label}
                  onPress={() => {
                    setLevel(option.value);
                    if (result) runSearch(question, option.value);
                  }}
                  style={[styles.segment, active && styles.segmentActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={option.label}
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

          <Pressable
            style={[styles.button, asking && styles.buttonDisabled]}
            onPress={() => runSearch(question, level)}
            disabled={asking}
            accessibilityRole="button"
            accessibilityLabel="Ask"
          >
            {asking ? (
              <ActivityIndicator color="#fff" />
            ) : (
                         <Text style={styles.buttonText}>Ask</Text>
            )}
          </Pressable>

          {result && (
            <Pressable
              style={styles.resetButton}
              onPress={() => {
                setResult(null);
                setQuestion("");
                setError(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Ask something else"
            >
              <Text style={styles.resetButtonText}>Ask something else</Text>
            </Pressable>
          )}
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Suggested questions. An empty search box tells an owner nothing
            about what the knowledge base covers, and these double as a hint
            for how to phrase a question. */}
        {!result && !loadingTopics && topics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Try asking about</Text>
            {topics.map((topic) => (
              <View key={topic.topic} style={styles.topicBlock}>
                <View style={styles.topicHeader}>
                  <View
                    style={[styles.topicDot, { backgroundColor: topicColour(topic.topic) }]}
                  />
                  <Text style={styles.topicName}>{topicLabel(topic.topic)}</Text>
                </View>
                {topic.examples.map((example) => (
                  <Pressable
                    key={example}
                    onPress={() => handleExample(example)}
                    style={styles.exampleChip}
                    accessibilityRole="button"
                    accessibilityLabel={`Ask: ${example}`}
                  >
                    <Text style={styles.exampleText}>{example}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        )}

        {loadingTopics && !result && (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 30 }}
          />
        )}

        {result && (
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
            {result.matched && result.answer ? (
              <>
                {result.ambiguous && (
                  <View style={styles.noticeBanner}>
                    <Text style={styles.noticeText}>
                      A few entries matched about equally well. The closest is
                      shown first.
                    </Text>
                  </View>
                )}

                <AnswerCard
                  answer={result.answer}
                  isPrimary
                  onOpenSource={openSource}
                />

                {result.related.length > 0 && (
                  <View style={styles.relatedSection}>
                    <Text style={styles.sectionTitle}>Related</Text>
                    {result.related.map((item) => (
                      <AnswerCard
                        key={item.id}
                        answer={item}
                        isPrimary={false}
                        onOpenSource={openSource}
                      />
                    ))}
                  </View>
                )}
              </>
            ) : (
              /* Deliberately returns nothing rather than the closest
                 available entry. Presenting a weak match with the same
                 confidence as a good one would be worse than silence. */
              <View style={styles.noMatchCard}>
                <Text style={styles.noMatchGlyph}>🔍</Text>
                <Text style={styles.noMatchTitle}>No guidance on that yet</Text>
                <Text style={styles.noMatchBody}>
                  {result.reason === "no_entries_for_level"
                    ? "Nothing in that owner mode covers this. Try switching to Everything."
                    : (result.best_score ?? 0) > 0.4
                      ? "Nothing matched closely enough to answer confidently. Try rephrasing, or pick a suggested question below."
                      : "This knowledge base only covers rabbit care. Try asking about food, housing, health or behaviour."}
                </Text>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    setResult(null);
                    setQuestion("");
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryButtonText}>Browse topics</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerText}>{result.disclaimer}</Text>
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

  searchCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15.5,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
    minHeight: 76,
    textAlignVertical: "top",
  },

  segmented: { flexDirection: "row", gap: 7, marginTop: 12 },
  segment: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    minHeight: 42,
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

  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
    elevation: 3,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  
  buttonDisabled: { opacity: 0.65 },
  resetButton: {
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 8,
  },
  resetButtonText: {
    color: COLORS.primary,
    fontSize: 14.5,
    fontWeight: "700",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },

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
    marginBottom: 12,
    letterSpacing: -0.2,
  },

  topicBlock: { marginBottom: 14 },
  topicHeader: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  topicDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  topicName: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  exampleChip: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exampleText: { fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 19 },

  answerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  relatedCard: { padding: 15, backgroundColor: COLORS.background },
  answerHeader: { flexDirection: "row", gap: 6, marginBottom: 11 },
  topicPill: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  topicPillText: { fontSize: 11.5, color: "#fff", fontWeight: "800" },
  levelPill: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  levelPillText: {
    fontSize: 11.5,
    color: COLORS.textSecondary,
    fontWeight: "700",
  },
  answerQuestion: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  answerQuestionPrimary: { fontSize: 17.5 },
  answerBody: {
    fontSize: 14.5,
    color: COLORS.textSecondary,
    lineHeight: 21.5,
  },

  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.chartGrid,
  },
  sourceLabel: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    fontWeight: "700",
    marginRight: 8,
    textTransform: "uppercase",
  },
  sourceName: { flex: 1, fontSize: 12.5, fontWeight: "700" },

  relatedSection: { marginTop: 4 },

  noticeBanner: {
    backgroundColor: COLORS.growthBelowSoft,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.growthBelow,
  },
  noticeText: { fontSize: 13, color: COLORS.growthBelow, lineHeight: 18 },

  noMatchCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  noMatchGlyph: { fontSize: 36, marginBottom: 12 },
  noMatchTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  noMatchBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14.5,
    fontWeight: "700",
  },

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
