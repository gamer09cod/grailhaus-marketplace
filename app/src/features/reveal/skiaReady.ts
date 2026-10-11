/**
 * Skia (`@shopify/react-native-skia` 2.6.2) is installed for Phase B+ FX.
 * Native libs require a rebuild (`npm run apk` / custom dev client).
 * Runtime Canvas usage lives in later modules — this flag is for gating and scripts.
 */
export const SKIA_PACKAGE = "@shopify/react-native-skia";
export const SKIA_INSTALLED = true;
