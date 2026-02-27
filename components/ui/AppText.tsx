import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';

export interface AppTextProps extends RNTextProps {
    className?: string; // Support for NativeWind v4 classes
}

// Maps standard font weights to our explicit custom font aliases loaded in app/_layout.tsx
const FONT_MAP: Record<string, string> = {
    'normal': 'Cori',
    '400': 'Cori',
    '500': 'Cori-Medium',
    '600': 'Cori-SemiBold',
    '700': 'Cori-Bold',
    'bold': 'Cori-Bold',
};

export const AppText = React.forwardRef<RNText, AppTextProps>((props, ref) => {
    // Flatten styles to resolve arrays (NativeWind injects arrays of styles)
    const flattenedStyle = StyleSheet.flatten(props.style || {});

    // Extract or default weight
    let weight = '400';
    if (flattenedStyle.fontWeight) {
        weight = flattenedStyle.fontWeight.toString();
    }

    // Get the mapped specific font file alias for this weight
    const fontFamily = FONT_MAP[weight] || 'Cori';

    // Reconstruct styles ensuring fontWeight is undefined so Android doesn't fallback to Roboto
    const newStyle = [
        { fontFamily },
        flattenedStyle,
        { fontWeight: undefined } // Let the font file itself decide the true weight
    ];

    return <RNText {...props} style={newStyle} ref={ref} />;
});

AppText.displayName = 'AppText';
