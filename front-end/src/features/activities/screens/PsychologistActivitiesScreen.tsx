import { StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../shared/ui/typography";

export function PsychologistActivitiesScreen() {
  return (
    <View style={styles.screen}> 
      <View style={styles.content}> 
        <View style={styles.card}> 
          <Text style={styles.title}>Modulo em refatoracao</Text>
          <Text style={styles.description}>
            O fluxo antigo de atividades, formularios e documentos foi removido.
          </Text>
          <Text style={styles.description}>
            Nesta etapa vamos reconstruir a atribuicao de documentos do zero,
            com aprovacao/rejeicao e notificacoes em tempo real.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  content: {
    flex: 1,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D0D7E2",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 10,
  },
  title: {
    color: "#0F172A",
    fontSize: 22,
    lineHeight: 28,
    fontFamily: typographyContract.fontFamily,
    fontWeight: "700",
  },
  description: {
    color: "#475467",
    fontSize: 15,
    lineHeight: 21,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
});
