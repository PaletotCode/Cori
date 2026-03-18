import { Link, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuthStore } from "../hooks/useAuthStore";
import { authStore } from "../store/authStore";
import { psychologistRoutes } from "../../navigation/guards";
import { sessionStore } from "../../session/store/sessionStore";

export function PsychologistLoginScreen() {
  const router = useRouter();
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const [email, setEmail] = useState("dr.aurora@cori.dev");
  const [password, setPassword] = useState("dev123456");
  const [localError, setLocalError] = useState<string | null>(null);

  const hasValidInput = useMemo(
    () => email.trim().length >= 5 && password.trim().length >= 8,
    [email, password],
  );

  const displayError = localError ?? error;

  const handleLogin = async () => {
    if (!hasValidInput) {
      setLocalError("Informe email e senha validos.");
      return;
    }

    setLocalError(null);
    authStore.actions.clearError();

    try {
      await authStore.actions.loginPsychologist({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      sessionStore.actions.setActiveArea("psychologist");
      const shouldGoToSession = authStore.getState().profile?.onboardingCompleted === true;
      router.replace(
        shouldGoToSession ? psychologistRoutes.session : psychologistRoutes.onboarding,
      );
    } catch {
      // erro tratado no estado global da auth
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(
        onboardingCompleted ? psychologistRoutes.session : psychologistRoutes.onboarding,
      );
    }
  }, [status, onboardingCompleted, router]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>Auth Psicologo</Text>
        <Text style={styles.title}>Entrar no Cori V2</Text>
        <Text style={styles.subtitle}>Use as credenciais de seed para validar o fluxo real.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="email@clinica.com"
          placeholderTextColor="#6A6A66"
          style={styles.input}
          value={email}
        />

        <Text style={styles.label}>Senha</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setPassword}
          placeholder="********"
          placeholderTextColor="#6A6A66"
          secureTextEntry
          style={styles.input}
          value={password}
        />

        {displayError ? <Text style={styles.error}>{displayError}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={handleLogin}
          style={[styles.primaryButton, !hasValidInput || loading ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryButtonText}>{loading ? "Entrando..." : "Entrar como Psicologo"}</Text>
        </Pressable>

        <Link href="/paciente/convite" style={styles.link}>
          <Text style={styles.link}>Entrada do paciente via convite</Text>
        </Link>

        <Link href="/paciente/sessoes" style={styles.link}>
          <Text style={styles.link}>Paciente: lista e confirmacao de sessoes</Text>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#F3EFE4",
    paddingHorizontal: 18,
  },
  card: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 20,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: 8,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: "#1E3A8A",
    fontWeight: "700",
    fontSize: 12,
  },
  title: {
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: "#334155",
    fontSize: 14,
    marginBottom: 8,
  },
  label: {
    marginTop: 2,
    color: "#1E293B",
    fontWeight: "600",
    fontSize: 13,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  error: {
    marginTop: 4,
    color: "#B91C1C",
    fontWeight: "600",
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: "#0F766E",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.55,
  },
  link: {
    marginTop: 10,
    color: "#0F766E",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
