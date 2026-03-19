import React from "react";
import { Text, TextInput } from "react-native";

export const typographyContract = {
  fontFamily: "Lora_400Regular",
  fontWeight: "400" as const,
} as const;

let typographyApplied = false;

function appendTypographyStyle(existingStyle: unknown) {
  return [
    existingStyle,
    {
      fontFamily: typographyContract.fontFamily,
      fontWeight: typographyContract.fontWeight,
    },
  ];
}

export function applyGlobalTypographyContract() {
  if (typographyApplied) {
    return;
  }
  typographyApplied = true;

  const TextComponent = Text as unknown as {
    render?: (...args: unknown[]) => React.ReactElement;
  };
  const TextInputComponent = TextInput as unknown as {
    render?: (...args: unknown[]) => React.ReactElement;
  };

  const originalTextRender = TextComponent.render;
  if (typeof originalTextRender === "function") {
    TextComponent.render = function patchedTextRender(...args: unknown[]) {
      const element = originalTextRender.call(this, ...args);
      return React.cloneElement(element, {
        style: appendTypographyStyle(element.props.style),
      });
    };
  }

  const originalTextInputRender = TextInputComponent.render;
  if (typeof originalTextInputRender === "function") {
    TextInputComponent.render = function patchedTextInputRender(...args: unknown[]) {
      const element = originalTextInputRender.call(this, ...args);
      return React.cloneElement(element, {
        style: appendTypographyStyle(element.props.style),
      });
    };
  }
}
