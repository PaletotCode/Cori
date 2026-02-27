import { AppText as Text } from '@/components/ui/AppText';
import { CalendarDays, Home, Settings, Users } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const ICONS = {
    index: Home,
    agenda: CalendarDays,
    pacientes: Users,
    perfil: Settings,
};

// Animated Active Pill Component
export const TabBarItem = ({ route, index, isFocused, descriptors, navigation }: any) => {
    const options = descriptors[route.key].options;
    const label = options.tabBarLabel !== undefined ? options.tabBarLabel : options.title !== undefined ? options.title : route.name;
    const Icon = ICONS[route.name as keyof typeof ICONS] || Home;

    const progress = useSharedValue(isFocused ? 1 : 0);

    useEffect(() => {
        progress.value = withSpring(isFocused ? 1 : 0, {
            damping: 14,
            stiffness: 130,
            mass: 0.8
        });
    }, [isFocused]);

    const onPress = () => {
        const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
        });

        if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
        }
    };

    const animatedContainerStyle = useAnimatedStyle(() => {
        return {
            flex: progress.value + 1, // Expande do flex 1 pro flex 2 durante a animação perfeitamente em sincronia com SlidingPill
        };
    });

    const animatedTextStyle = useAnimatedStyle(() => {
        const opacity = interpolate(progress.value, [0.5, 1], [0, 1], Extrapolation.CLAMP);
        const translateX = interpolate(progress.value, [0, 1], [-10, 0], Extrapolation.CLAMP);
        const maxWidth = interpolate(progress.value, [0, 1], [0, 80], Extrapolation.CLAMP);
        const marginLeft = interpolate(progress.value, [0, 1], [0, 6], Extrapolation.CLAMP);

        return {
            opacity,
            transform: [{ translateX }],
            maxWidth,
            marginLeft,
            overflow: 'hidden',
        };
    });

    const animatedIconStyle = useAnimatedStyle(() => {
        const scale = interpolate(progress.value, [0, 1], [1, 1.15], Extrapolation.CLAMP);
        const translateY = interpolate(progress.value, [0, 1], [0, -2], Extrapolation.CLAMP);
        return {
            transform: [{ scale }, { translateY }],
        };
    });

    return (
        <Animated.View style={animatedContainerStyle}>
            <Pressable onPress={onPress} className="flex-row items-center justify-center min-h-[48px] h-full w-full">
                <Animated.View style={animatedIconStyle}>
                    <Icon color={isFocused ? '#9333ea' : '#6b7280'} size={22} strokeWidth={isFocused ? 2.5 : 2} />
                </Animated.View>

                <Animated.Text
                    style={[animatedTextStyle, { flexShrink: 1 }]}
                    className="text-primary dark:text-primary-light font-bold text-xs tracking-tight whitespace-nowrap"
                    numberOfLines={1}
                >
                    {label as string}
                </Animated.Text>
            </Pressable>
        </Animated.View>
    );
};
