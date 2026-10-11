import { Canvas } from "@shopify/react-native-skia";
import { StyleSheet } from "react-native";

/**
 * Typecheck / native-link smoke for Skia. Not mounted in Phase A UI —
 * starfield/burst/foil modules will replace View particles in Phase B/C.
 */
export function SkiaProbe() {
  return <Canvas style={styles.probe} />;
}

const styles = StyleSheet.create({
  probe: { width: 1, height: 1 },
});
