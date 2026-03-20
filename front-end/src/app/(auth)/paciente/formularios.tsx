import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";
import { StyleSheet, Text, View } from "react-native";
import { typographyContract } from "../../../shared/ui/typography";

export default function PatientFormsRoute() {
  return (
    <ScreenFadeIn>
      <View style={styles.container}>
        <Text style={styles.title}>Formularios em refatoracao</Text>
        <Text style={styles.text}>Este modulo antigo foi desativado para reconstruirmos do zero.</Text>
      </View>
    </ScreenFadeIn>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EEF2F6",
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  title: {
    color: "#0F172A",
    fontSize: 20,
    lineHeight: 26,
    fontFamily: typographyContract.fontFamily,
    fontWeight: "700",
  },
  text: {
    marginTop: 10,
    color: "#475467",
    fontSize: 15,
    lineHeight: 21,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
});
