import { LucideIcon } from 'lucide-react-native';
import React, { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

interface TabBarIconProps {
    Icon: LucideIcon;
    color: string;
    focused: boolean;
}

export const TabBarIcon = ({ Icon, color, focused }: TabBarIconProps) => {
    const scale = useSharedValue(1);

    useEffect(() => {
        scale.value = withSpring(focused ? 1.2 : 1, {
            mass: 0.5,
            damping: 12,
            stiffness: 100,
        });
    }, [focused]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
        };
    });

    return (
        <Animated.View style={animatedStyle}>
            <Icon color={color} size={24} strokeWidth={focused ? 2.5 : 2} />
        </Animated.View>
    );
};
