import { addDays, format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
    selectedDate: Date;
    onSelect: (date: Date) => void;
}

export default function DateSelector({ selectedDate, onSelect }: Props) {
    const [weekDays, setWeekDays] = useState<Date[]>([]);

    useEffect(() => {
        // Generate a window of 14 days around the selected date
        const center = selectedDate;
        const days = [];
        for (let i = -7; i <= 7; i++) {
            days.push(addDays(center, i));
        }
        setWeekDays(days);
    }, [selectedDate]);

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            // Small hack: in a real app you might measure and scrollTo the center item,
            // but for now, the user can just swipe manually.
            >
                {weekDays.map((date, index) => {
                    const isSelected = isSameDay(date, selectedDate);

                    return (
                        <TouchableOpacity
                            key={index}
                            style={[styles.dayCard, isSelected && styles.dayCardSelected]}
                            onPress={() => onSelect(date)}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.dayName, isSelected && styles.textSelected]}>
                                {format(date, 'EEEEEE', { locale: ptBR }).toUpperCase()}
                            </Text>
                            <Text style={[styles.dayNumber, isSelected && styles.textSelected]}>
                                {format(date, 'd')}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    scrollContent: {
        paddingHorizontal: 20,
        gap: 12, // React Native 0.71+ flex gap
    },
    dayCard: {
        width: 54,
        height: 64,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#EFEFEF',
    },
    dayCardSelected: {
        backgroundColor: '#2C3E50', // Highlight color
        borderColor: '#2C3E50',
        shadowColor: '#2C3E50',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 4,
    },
    dayName: {
        fontFamily: 'Cori-Medium',
        fontSize: 11,
        color: '#A0AAB5',
        marginBottom: 4,
    },
    dayNumber: {
        fontFamily: 'Cori-Bold',
        fontSize: 18,
        color: '#34495E',
    },
    textSelected: {
        color: '#FFFFFF',
    }
});
