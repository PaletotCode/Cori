import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import {
  KpiDeckCard,
  type KpiDeckCardDefinition,
  type KpiDeckPreferences,
} from "../../../../shared/ui/KpiStackDeck";

interface PatientOverviewKpiCarouselProps<CardId extends string = string> {
  primaryDefinition: KpiDeckCardDefinition<CardId>;
  secondaryDefinition: KpiDeckCardDefinition<CardId>;
  primaryPreferences: KpiDeckPreferences;
  secondaryPreferences: KpiDeckPreferences;
  loading: boolean;
  comparisonError: string | null;
  deckHeight: number;
  autoSwapMs?: number;
}

export function PatientOverviewKpiCarousel<CardId extends string = string>({
  primaryDefinition,
  secondaryDefinition,
  primaryPreferences,
  secondaryPreferences,
  loading,
  comparisonError,
  deckHeight,
  autoSwapMs = 10000,
}: PatientOverviewKpiCarouselProps<CardId>) {
  const [deckWidth, setDeckWidth] = useState(0);
  const carouselRef = useRef<ScrollView | null>(null);
  const activeIndexRef = useRef<0 | 1>(0);
  const autoplayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shouldAutoplayForIndex = useCallback(
    (index: 0 | 1) => {
      const currentPreferences = index === 0 ? primaryPreferences : secondaryPreferences;
      return currentPreferences.carouselEnabled && currentPreferences.mode === "dynamic";
    },
    [primaryPreferences, secondaryPreferences],
  );

  const clearAutoplayTimeout = useCallback(() => {
    if (autoplayTimeoutRef.current !== null) {
      clearTimeout(autoplayTimeoutRef.current);
      autoplayTimeoutRef.current = null;
    }
  }, []);

  const scheduleAutoplay = useCallback(() => {
    clearAutoplayTimeout();

    if (deckWidth <= 0) {
      return;
    }
    if (!shouldAutoplayForIndex(activeIndexRef.current)) {
      return;
    }

    autoplayTimeoutRef.current = setTimeout(() => {
      const nextIndex: 0 | 1 = activeIndexRef.current === 0 ? 1 : 0;
      activeIndexRef.current = nextIndex;
      carouselRef.current?.scrollTo({
        x: nextIndex * deckWidth,
        animated: true,
      });
      scheduleAutoplay();
    }, autoSwapMs);
  }, [autoSwapMs, clearAutoplayTimeout, deckWidth, shouldAutoplayForIndex]);

  useEffect(() => {
    scheduleAutoplay();
    return () => {
      clearAutoplayTimeout();
    };
  }, [clearAutoplayTimeout, scheduleAutoplay]);

  useEffect(() => {
    if (deckWidth <= 0) {
      return;
    }
    carouselRef.current?.scrollTo({
      x: activeIndexRef.current * deckWidth,
      animated: false,
    });
  }, [deckWidth]);

  const handleSwipeStart = useCallback(() => {
    // 🚀 PERFORMANCE: gesto manual pausa e reinicia autoplay para evitar disputa com scroll.
    clearAutoplayTimeout();
  }, [clearAutoplayTimeout]);

  const handleSwipeFinish = useCallback(
    (offsetX: number) => {
      if (deckWidth > 0) {
        activeIndexRef.current = Math.round(offsetX / deckWidth) >= 1 ? 1 : 0;
      }
      // 🚀 PERFORMANCE: reset de janela para próxima troca automática.
      scheduleAutoplay();
    },
    [deckWidth, scheduleAutoplay],
  );

  return (
    <View
      style={[styles.deckWrap, { height: deckHeight }]}
      onLayout={({ nativeEvent }) => {
        const nextWidth = nativeEvent.layout.width;
        if (nextWidth > 0 && Math.abs(nextWidth - deckWidth) > 0.5) {
          setDeckWidth(nextWidth);
        }
      }}
    >
      <ScrollView
        ref={carouselRef}
        horizontal
        pagingEnabled
        bounces={false}
        directionalLockEnabled
        decelerationRate="fast"
        scrollEventThrottle={16}
        snapToAlignment="start"
        snapToInterval={deckWidth > 0 ? deckWidth : undefined}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.deckCarouselContent}
        onScrollBeginDrag={handleSwipeStart}
        onScrollEndDrag={(event) => {
          const targetOffset = event.nativeEvent.targetContentOffset?.x;
          handleSwipeFinish(
            typeof targetOffset === "number" ? targetOffset : event.nativeEvent.contentOffset.x,
          );
        }}
        onMomentumScrollEnd={(event) => {
          handleSwipeFinish(event.nativeEvent.contentOffset.x);
        }}
      >
        <View
          style={[
            styles.deckSlide,
            { height: deckHeight },
            deckWidth > 0 ? { width: deckWidth } : undefined,
          ]}
        >
          <KpiDeckCard
            definition={primaryDefinition}
            preferences={primaryPreferences}
            loading={loading}
            comparisonError={comparisonError}
            cardStyle={[styles.deckCard, { minHeight: deckHeight }]}
          />
        </View>

        <View
          style={[
            styles.deckSlide,
            { height: deckHeight },
            deckWidth > 0 ? { width: deckWidth } : undefined,
          ]}
        >
          <KpiDeckCard
            definition={secondaryDefinition}
            preferences={secondaryPreferences}
            loading={loading}
            comparisonError={comparisonError}
            cardStyle={[styles.deckCard, { minHeight: deckHeight }]}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  deckWrap: {
    borderRadius: 16,
    overflow: "hidden",
  },
  deckCarouselContent: {
    flexGrow: 1,
  },
  deckSlide: {
    justifyContent: "flex-start",
  },
  deckCard: {
    minHeight: 118,
    borderRadius: 16,
  },
});
