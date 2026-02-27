import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SlidingPill } from './SlidingPill';
import { TabBarItem } from './TabBarItem';

export const CustomTabBar = ({ state, descriptors, navigation }: MaterialTopTabBarProps) => {
    const insets = useSafeAreaInsets();

    return (
        <View
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            className="absolute bottom-0 w-full px-md pt-sm bg-transparent"
        >
            <View className="bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-full shadow-lg elevation-10 p-xs shadow-purple-900/10">
                <View className="flex-row items-center justify-between relative bg-transparent overflow-hidden rounded-full">
                    <SlidingPill index={state.index} />
                    {state.routes.map((route, index) => {
                        const isFocused = state.index === index;
                        return (
                            <TabBarItem
                                key={route.key}
                                route={route}
                                index={index}
                                isFocused={isFocused}
                                descriptors={descriptors}
                                navigation={navigation}
                            />
                        );
                    })}
                </View>
            </View>
        </View>
    );
};
