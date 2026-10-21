import { StatusBar } from "expo-status-bar";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { brand } from "./src/brand";

const { content, theme } = brand;

export default function App() {
  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      <View style={[styles.header, { backgroundColor: theme.primaryColor }]}>
        <Text style={styles.businessName}>{content.businessName}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.headline}>{content.headline}</Text>
        {content.address ? <Text style={styles.detail}>{content.address}</Text> : null}
        {content.phone ? (
          <Pressable
            style={[styles.button, { backgroundColor: theme.secondaryColor }]}
            onPress={() => Linking.openURL(`tel:${content.phone!.replace(/[^+\d]/g, "")}`)}
          >
            <Text style={styles.buttonText}>Llamar {content.phone}</Text>
          </Pressable>
        ) : null}
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 64, paddingBottom: 24, paddingHorizontal: 24 },
  businessName: { color: "#fff", fontSize: 26, fontWeight: "700" },
  body: { flex: 1, padding: 24, gap: 16 },
  headline: { fontSize: 22, fontWeight: "600" },
  detail: { fontSize: 16, color: "#444" },
  button: { marginTop: 8, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#000" },
});
