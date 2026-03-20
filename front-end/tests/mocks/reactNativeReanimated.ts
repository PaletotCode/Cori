import React from "react";

function ReanimatedView(props: Record<string, unknown>) {
  return React.createElement("ReanimatedView", props, props.children as React.ReactNode);
}

const Animated = {
  View: ReanimatedView,
};

export default Animated;

export const Easing = {
  cubic: "cubic",
  out: <TValue,>(value: TValue) => value,
  bezier: () => (value: number) => value,
};

export function useSharedValue<TValue>(initialValue: TValue) {
  return {
    value: initialValue,
  };
}

export function withTiming<TValue>(
  toValue: TValue,
  _config?: unknown,
  callback?: (finished: boolean) => void,
) {
  callback?.(true);
  return toValue;
}

export function useAnimatedStyle<TStyle>(updater: () => TStyle): TStyle {
  return updater();
}

export function interpolate(
  value: number,
  inputRange: [number, number],
  outputRange: [number, number],
): number {
  const [inputStart, inputEnd] = inputRange;
  const [outputStart, outputEnd] = outputRange;
  if (inputEnd === inputStart) {
    return outputStart;
  }

  const progress = (value - inputStart) / (inputEnd - inputStart);
  return outputStart + progress * (outputEnd - outputStart);
}

export function createWorkletRuntime(name?: string) {
  return {
    runtimeId: 1,
    name: name ?? "mock-runtime",
  };
}

export function runOnRuntime(_runtime: unknown, worklet: (...args: unknown[]) => void) {
  return (...args: unknown[]) => {
    worklet(...args);
  };
}

export function runOnJS<TArgs extends unknown[]>(fn: (...args: TArgs) => void) {
  return (...args: TArgs) => {
    fn(...args);
  };
}

