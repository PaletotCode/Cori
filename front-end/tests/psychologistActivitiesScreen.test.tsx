import React from "react";
import { create } from "react-test-renderer";

import { PsychologistActivitiesScreen } from "../src/features/activities/screens/PsychologistActivitiesScreen";

jest.mock("react-native", () => {
  const makeComponent = (name: string) =>
    function MockComponent(props: Record<string, unknown>) {
      return React.createElement(name, props, props.children as React.ReactNode);
    };

  return {
    Text: makeComponent("Text"),
    View: makeComponent("View"),
    StyleSheet: {
      create: (styles: unknown) => styles,
    },
  };
});

describe("psychologist activities workspace", () => {
  it("renders static refactor mock", () => {
    const tree = create(React.createElement(PsychologistActivitiesScreen));
    expect(tree).toBeDefined();
  });
});
