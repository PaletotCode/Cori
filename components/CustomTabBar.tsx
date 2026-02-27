import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { Calendar, DollarSign, LayoutDashboard, Users } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CustomTabBar({ state, descriptors, navigation, position }: MaterialTopTabBarProps) {
    const insets = useSafeAreaInsets();

    // Define icons mapping for routes
    const getIcon = (routeName: string, isFocused: boolean) => {
        const color = isFocused ? '#2C3E50' : '#A0AAB5';
        const size = 24;

        switch (routeName) {
            case 'index':
                return <LayoutDashboard color={color} size={size} strokeWidth={isFocused ? 2.5 : 2} />;
            case 'agenda':
                return <Calendar color={color} size={size} strokeWidth={isFocused ? 2.5 : 2} />;
            case 'pacientes':
                return <Users color={color} size={size} strokeWidth={isFocused ? 2.5 : 2} />;
            case 'financeiro':
                return <DollarSign color={color} size={size} strokeWidth={isFocused ? 2.5 : 2} />;
            default:
                return <LayoutDashboard color={color} size={size} />;
        }
    };

    return (
        <View style={[styles.container, { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
            {state.routes.map((route, index) => {
                const { options } = descriptors[route.key];
                const label =
                    options.tabBarLabel !== undefined
                        ? options.tabBarLabel
                        : options.title !== undefined
                            ? options.title
                            : route.name;

                const isFocused = state.index === index;

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

                const onLongPress = () => {
                    navigation.emit({
                        type: 'tabLongPress',
                        target: route.key,
                    });
                };

                return (
                    <TouchableOpacity
                        key={index}
                        accessibilityRole="button"
                        accessibilityState={isFocused ? { selected: true } : {}}
                        accessibilityLabel={options.tabBarAccessibilityLabel}
                        onPress={onPress}
                        onLongPress={onLongPress}
                        style={styles.tabItem}
                        activeOpacity={0.7}
                    >
                        <View style={styles.iconContainer}>
                            {getIcon(route.name, isFocused)}
                        </View>
                        <Text style={[
                            styles.tabLabel,
                            { color: isFocused ? '#2C3E50' : '#A0AAB5' },
                            isFocused && styles.tabLabelFocused
                        ]}>
                            {label as string}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
        paddingTop: 12,
        // Soft shadow for elevation
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 8,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconContainer: {
        marginBottom: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabLabel: {
        fontFamily: 'Cori-Medium',
        fontSize: 11,
    },
    tabLabelFocused: {
        fontFamily: 'Cori-Bold',
    }
});
