import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton, TertiaryButton } from "../../components/buttons";
import { supabase } from "../../api/supabase";
import { colors, layout, maxFontScale, radius, spacing, typography } from "../../theme";

type Mode = "sign-in" | "create-account";

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 6) {
      setMessage("Use an email and a password of at least 6 characters.");
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
        : await supabase.auth.signUp({ email: trimmedEmail, password });
    setSubmitting(false);

    if (result.error) {
      setMessage(authNotice(result.error.message, mode));
      return;
    }

    if (mode === "create-account" && !result.data.session) {
      setMessage("Account created. Sign in with that email and password.");
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        style={styles.flex}
      >
        <View style={styles.form}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.display} style={styles.brand}>
            GrailHaus
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.lead}>
            {mode === "sign-in" ? "Sign in to your wallet." : "Create an account. It starts at $0.00."}
          </Text>
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            accessibilityLabel="Password"
            autoComplete="password"
            placeholder="Password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />
          {message ? (
            <Text
              accessibilityLiveRegion="polite"
              maxFontSizeMultiplier={maxFontScale.body}
              style={styles.message}
            >
              {message}
            </Text>
          ) : null}
          <PrimaryButton
            fullWidth
            label={mode === "sign-in" ? "Sign in" : "Create account"}
            loading={submitting}
            loadingLabel={mode === "sign-in" ? "Signing in…" : "Creating account…"}
            onPress={() => void submit()}
          />
          <TertiaryButton
            fullWidth
            label={mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
            onPress={() => {
              setMode(mode === "sign-in" ? "create-account" : "sign-in");
              setMessage(null);
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function authNotice(message: string, mode: Mode): string {
  if (message === "Invalid login credentials") {
    return "That email or password is wrong. Try again.";
  }
  if (message.toLowerCase().includes("already registered")) {
    return "An account with that email already exists. Sign in instead.";
  }
  if (message === "Something went wrong" || message === "Error") {
    return mode === "sign-in"
      ? "Sign-in didn't finish. Check the connection and try again."
      : "The account was not created. Check the connection and try again.";
  }
  return message;
}

const styles = StyleSheet.create({
  flex: {
    backgroundColor: colors.backgroundPrimary,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: layout.screenPadding,
  },
  form: {
    gap: spacing.md,
  },
  brand: {
    ...typography.displayXL,
    color: colors.textPrimary,
  },
  lead: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.button,
    borderWidth: 1,
    color: colors.textPrimary,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  message: {
    ...typography.bodySmall,
    color: colors.status.warning.solid,
  },
});
