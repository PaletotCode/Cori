import React, { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

export const SlidingPill = ({ index }: { index: number }) => {
    const progress = useSharedValue(index);

    useEffect(() => {
        progress.value = withSpring(index, {
            damping: 14,
            stiffness: 130,
            mass: 0.8
        });
    }, [index]);

    const animatedStyle = useAnimatedStyle(() => {
        // Reduzimos a altura e largura para a bolha abraçar perfeitamente os botões sem sobrar
        // A proporção assume que as abas somadas dão flex 5 (1, 1, 1, 2)
        return {
            left: `${(progress.value * 20) + 4}%`,
            width: '32%',
            height: '80%',
            top: '10%'
        };
    });

    return (
        <Animated.View
            style={[
                animatedStyle,
                { position: 'absolute', backgroundColor: 'rgba(147, 51, 234, 0.1)', borderRadius: 999 }
            ]}
        />
    );
};
