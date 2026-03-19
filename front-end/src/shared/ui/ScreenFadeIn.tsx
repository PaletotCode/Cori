import { NavigationContext } from "@react-navigation/native";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Animated, Easing, StyleSheet, View, ViewStyle } from "react-native";

import { screenMotionContract } from "./screenMotionContract";

interface ScreenFadeInProps {
  children: ReactNode;
  style?: ViewStyle;
}

const ScreenFadeInContext = createContext<boolean>(false);

export function ScreenFadeIn({ children, style }: ScreenFadeInProps) {
  const hasParentTransition = useContext(ScreenFadeInContext);
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState<boolean>(navigation?.isFocused() ?? true);
  const animatedApi = Animated as
    | {
        Value?: typeof Animated.Value;
        timing?: typeof Animated.timing;
      }
    | undefined;
  const canAnimate =
    typeof animatedApi?.Value === "function" &&
    typeof animatedApi?.timing === "function";
  const progressRef = useRef<Animated.Value | null>(
    canAnimate ? new Animated.Value(0) : null,
  );
  const progress = progressRef.current;

  useEffect(() => {
    if (navigation == null) {
      setFocused(true);
      return undefined;
    }

    setFocused(navigation.isFocused());
    const unsubscribeFocus = navigation.addListener("focus", () => {
      setFocused(true);
    });
    const unsubscribeBlur = navigation.addListener("blur", () => {
      setFocused(false);
    });

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  useEffect(() => {
    if (!canAnimate || progress === null || hasParentTransition) {
      return undefined;
    }
    if (!focused) {
      progress.setValue(0);
      return undefined;
    }

    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: screenMotionContract.screenEnterDurationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();

    return () => {
      animation.stop();
    };
  }, [canAnimate, focused, hasParentTransition, progress]);

  if (!canAnimate || progress === null || hasParentTransition) {
    return (
      <ScreenFadeInContext.Provider value={true}>
        <View style={[styles.container, style]}>{children}</View>
      </ScreenFadeInContext.Provider>
    );
  }

  return (
    <ScreenFadeInContext.Provider value={true}>
      <Animated.View
        style={[
          styles.container,
          style,
          {
            opacity: progress,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [screenMotionContract.screenEnterTranslateY, 0],
                }),
              },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
    </ScreenFadeInContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
