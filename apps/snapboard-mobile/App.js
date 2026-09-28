import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";

const STORAGE_KEY = "nexa_snapboard_v2";
const TAGS = ["work", "home", "build", "learn", "creative", "health", "money", "later"];
const KINDS = ["Idea", "Insight", "Question", "Reminder"];
const ENERGIES = ["Low energy", "Medium energy", "High energy"];

const palette = {
  ink: "#152238", muted: "#667085", line: "#E4E8EF", bg: "#F4F7FB",
  card: "#FFFFFF", accent: "#5B5CE2", accentSoft: "#ECECFF", danger: "#C83E4D"
};

function uid() { return Date.now() + "-" + Math.random().toString(36).slice(2); }

export default function App() {
  const [snaps, setSnaps] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("Idea");
  const [energy, setEnergy] = useState("Medium energy");
  const [tags, setTags] = useState([]);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => setSnaps(raw ? JSON.parse(raw) : []))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snaps));
  }, [snaps, loaded]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snaps;
    return snaps.filter(s =>
      [s.title, s.body, s.kind, s.energy, ...s.tags].join(" ").toLowerCase().includes(q)
    );
  }, [snaps, query]);

  const stats = {
    total: snaps.length,
    ideas: snaps.filter(s => s.kind === "Idea").length,
    high: snaps.filter(s => s.energy === "High energy").length,
    tags: new Set(snaps.flatMap(s => s.tags)).size
  };

  const toggleTag = tag => setTags(current =>
    current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
  );

  function saveSnap() {
    const cleanBody = body.trim();
    if (!cleanBody) {
      Alert.alert("Add a thought", "Write the thought before saving your snap.");
      return;
    }
    setSnaps(current => [{
      id: uid(), title: title.trim() || "Untitled snap", body: cleanBody,
      kind, energy, tags, created: Date.now()
    }, ...current]);
    setTitle(""); setBody(""); setTags([]); setKind("Idea"); setEnergy("Medium energy");
  }

  function deleteSnap(id) {
    Alert.alert("Delete snap?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => setSnaps(current => current.filter(s => s.id !== id)) }
    ]);
  }

  async function exportSnaps() {
    const text = snaps.length
      ? snaps.map(s => "[" + new Date(s.created).toLocaleString() + "] " + s.title + "\n" +
          s.kind + " · " + s.energy + " · " + s.tags.map(t => "#" + t).join(" ") + "\n" + s.body + "\n").join("\n")
      : "No snaps yet.";
    await Share.share({ message: text, title: "Snapboard export" });
  }

  function clearAll() {
    if (!snaps.length) return;
    Alert.alert("Clear every snap?", "This will permanently remove all locally stored snaps.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear all", style: "destructive", onPress: () => setSnaps([]) }
    ]);
  }

  const renderSnap = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.meta}>{item.kind} · {item.energy} · {new Date(item.created).toLocaleString()}</Text>
        </View>
        <Pressable onPress={() => deleteSnap(item.id)} hitSlop={8}>
          <Text style={styles.delete}>Delete</Text>
        </Pressable>
      </View>
      <Text style={styles.cardBody}>{item.body}</Text>
      {!!item.tags.length && <View style={styles.chips}>
        {item.tags.map(tag => <View key={tag} style={styles.activeChip}><Text style={styles.activeChipText}>#{tag}</Text></View>)}
      </View>}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderSnap}
          contentContainerStyle={styles.content}
          ListHeaderComponent={<View>
            <View style={styles.top}>
              <View style={{ flex: 1 }}>
                <Text style={styles.brand}>Snapboard</Text>
                <Text style={styles.tagline}>Capture small ideas before they disappear.</Text>
              </View>
              <View style={styles.topActions}>
                <Pressable style={styles.secondaryButton} onPress={exportSnaps}><Text style={styles.buttonText}>Export</Text></Pressable>
                <Pressable style={[styles.secondaryButton, styles.dangerButton]} onPress={clearAll}><Text style={[styles.buttonText, { color: palette.danger }]}>Clear</Text></Pressable>
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>New snap</Text>
              <TextInput value={title} onChangeText={setTitle} placeholder="A short title" placeholderTextColor="#98A2B3" style={styles.input} maxLength={80} />
              <TextInput value={body} onChangeText={setBody} placeholder="Write the thought, not the polished version..." placeholderTextColor="#98A2B3" style={[styles.input, styles.textarea]} multiline textAlignVertical="top" />
              
              <Text style={styles.label}>Type</Text>
              <View style={styles.chips}>{KINDS.map(option =>
                <Pressable key={option} onPress={() => setKind(option)} style={[styles.chip, kind === option && styles.selectedChip]}>
                  <Text style={[styles.chipText, kind === option && styles.selectedChipText]}>{option}</Text>
                </Pressable>
              )}</View>

              <Text style={styles.label}>Energy</Text>
              <View style={styles.chips}>{ENERGIES.map(option =>
                <Pressable key={option} onPress={() => setEnergy(option)} style={[styles.chip, energy === option && styles.selectedChip]}>
                  <Text style={[styles.chipText, energy === option && styles.selectedChipText]}>{option}</Text>
                </Pressable>
              )}</View>

              <Text style={styles.label}>Tags</Text>
              <View style={styles.chips}>{TAGS.map(tag =>
                <Pressable key={tag} onPress={() => toggleTag(tag)} style={[styles.chip, tags.includes(tag) && styles.selectedChip]}>
                  <Text style={[styles.chipText, tags.includes(tag) && styles.selectedChipText]}>#{tag}</Text>
                </Pressable>
              )}</View>

              <Pressable style={styles.primaryButton} onPress={saveSnap}><Text style={styles.primaryText}>Save snap</Text></Pressable>
              <Text style={styles.hint}>Everything stays on this device. No account or server is required.</Text>
            </View>

            <View style={styles.stats}>
              {[["Total", stats.total], ["Ideas", stats.ideas], ["High energy", stats.high], ["Tags", stats.tags]].map(([label, value]) =>
                <View key={label} style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>
              )}
            </View>

            <TextInput value={query} onChangeText={setQuery} placeholder="Search titles, notes or tags" placeholderTextColor="#98A2B3" style={styles.input} />
            <Text style={styles.sectionTitle}>{query ? "Search results" : "Your snaps"}</Text>
          </View>}
          ListEmptyComponent={<Text style={styles.empty}>{query ? "No matching snaps." : "No snaps yet. Save the first thought."}</Text>}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 18, paddingBottom: 42 },
  top: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 18 },
  brand: { fontSize: 30, fontWeight: "800", letterSpacing: -0.8, color: palette.ink },
  tagline: { color: palette.muted, marginTop: 4, lineHeight: 19 },
  topActions: { flexDirection: "row", gap: 7 },
  panel: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, borderRadius: 20, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: palette.ink, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: "700", color: palette.muted, marginTop: 12, marginBottom: 7 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: palette.line, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, color: palette.ink, fontSize: 15, marginBottom: 9 },
  textarea: { minHeight: 115 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 2 },
  chip: { borderWidth: 1, borderColor: palette.line, backgroundColor: "#FFF", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  selectedChip: { backgroundColor: palette.accentSoft, borderColor: "#B8B8FF" },
  chipText: { color: palette.muted, fontSize: 12, fontWeight: "600" },
  selectedChipText: { color: palette.accent },
  primaryButton: { backgroundColor: palette.accent, borderRadius: 13, paddingVertical: 13, alignItems: "center", marginTop: 15 },
  primaryText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
  secondaryButton: { backgroundColor: "#FFF", borderWidth: 1, borderColor: palette.line, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 9 },
  dangerButton: { borderColor: "#F0D1D6" },
  buttonText: { color: palette.ink, fontWeight: "700", fontSize: 12 },
  hint: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 10 },
  stats: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, borderRadius: 18, paddingHorizontal: 14, marginBottom: 14 },
  stat: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: palette.line },
  statLabel: { color: palette.muted, fontSize: 13 },
  statValue: { color: palette.ink, fontSize: 20, fontWeight: "800" },
  card: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, borderRadius: 16, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  cardTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  meta: { color: palette.muted, fontSize: 11, marginTop: 5 },
  cardBody: { color: "#324057", fontSize: 14, lineHeight: 21, marginTop: 10 },
  delete: { color: palette.danger, fontSize: 12, fontWeight: "700" },
  activeChip: { backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: "#B8B8FF", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, marginTop: 9 },
  activeChipText: { color: palette.accent, fontSize: 11, fontWeight: "700" },
  empty: { textAlign: "center", color: palette.muted, paddingVertical: 28, fontSize: 13 }
});