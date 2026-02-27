import { AppText as Text } from '@/components/ui/AppText';
import { LucideIcon } from 'lucide-react-native';
import React, { memo } from 'react';
import { View } from 'react-native';

interface MetricCardProps {
    title: string;
    value: string;
    Icon: LucideIcon;
    trend?: string;
    trendPositive?: boolean;
}

export const MetricCard = memo(({ title, value, Icon, trend, trendPositive }: MetricCardProps) => {
    return (
        <View className="bg-white dark:bg-surface-dark px-md py-md rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex-1">
            <View className="flex-row items-center justify-between mb-sm">
                <Text className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">{title}</Text>
                <Icon size={16} className="text-primary dark:text-primary-light" color="#9333ea" />
            </View>
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">{value}</Text>
            {trend && (
                <Text className={`text-xs mt-sm font-medium ${trendPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {trendPositive ? '↑' : '↓'} {trend}
                </Text>
            )}
        </View>
    );
});

MetricCard.displayName = 'MetricCard';
