import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "../../api/supabase";

type Mode = "sign-in" | "create-account";

export function AuthScreen() {
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
      setMessage(result.error.message);
      return;
    }

    if (mode === "create-account" && !result.data.session) {
      setMessage("Account created. Sign in with that email and password.");
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>GrailHaus</Text>
      <Text style={styles.lead}>
        {mode === "sign-in" ? "Sign in to your wallet." : "Create an account. It starts at $0.00."}
      </Text>
      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="Email"
        placeholderTextColor="#8d8478"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        autoComplete="password"
        placeholder="Password"
        placeholderTextColor="#8d8478"
        secureTextEntry
        style={styles.input}
        value={password}
        onChangeText={setPassword}
      />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Pressable disabled={submitting} style={styles.primary} onPress={() => void submit()}>
        {submitting ? (
          <ActivityIndicator color="#1a140c" />
        ) : (
          <Text style={styles.primaryLabel}>{mode === "sign-in" ? "Sign in" : "Create account"}</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => {
          setMode(mode === "sign-in" ? "create-account" : "sign-in");
          setMessage(null);
        }}
      >
        <Text style={styles.switch}>
          {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#12110f",
    padding: 24,
    justifyContent: "center",
  },
  brand: {
    color: "#f4efe6",
    fontSize: 36,
    fontWeight: "600",
  },
  lead: {
    color: "#c9bfb2",
    fontSize: 16,
    marginTop: 8,
    marginBottom: 24,
  },
  input: {
    backgroundColor: "#1d1b18",
    color: "#f4efe6",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  message: {
    color: "#e4c07a",
    marginBottom: 12,
  },
  primary: {
    backgroundColor: "#e4c07a",
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: {
    color: "#1a140c",
    fontSize: 16,
    fontWeight: "600",
  },
  switch: {
    color: "#e4c07a",
    textAlign: "center",
    marginTop: 20,
  },
});
