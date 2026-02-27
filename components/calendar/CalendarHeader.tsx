import { addDays, addMonths, addWeeks, format, subDays, subMonths, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type CalendarMode = 'day' | 'week' | 'month';

interface Props {
    mode: CalendarMode;
    date: Date;
    onModeChange: (mode: CalendarMode) => void;
    onDateChange: (date: Date) => void;
}

const MODES: { key: CalendarMode; label: string }[] = [
    { key: 'day', label: 'Dia' },
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mês' },
];

export default function CalendarHeader({ mode, date, onModeChange, onDateChange }: Props) {
    const navigatePrev = () => {
        if (mode === 'day') onDateChange(subDays(date, 1));
        else if (mode === 'week') onDateChange(subWeeks(date, 1));
        else onDateChange(subMonths(date, 1));
    };

    const navigateNext = () => {
        if (mode === 'day') onDateChange(addDays(date, 1));
        else if (mode === 'week') onDateChange(addWeeks(date, 1));
        else onDateChange(addMonths(date, 1));
    };

    const getLabel = () => {
        if (mode === 'day') return format(date, "dd 'de' MMMM, yyyy", { locale: ptBR });
        if (mode === 'week') {
            const start = new Date(date);
            start.setDate(date.getDate() - date.getDay());
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            return `${format(start, 'dd MMM', { locale: ptBR })} – ${format(end, 'dd MMM', { locale: ptBR })}`;
        }
        return format(date, 'MMMM yyyy', { locale: ptBR });
    };

    return (
        <View style={styles.container}>
            {/* Mode Switcher */}
            <View style={styles.modeSwitcher}>
                {MODES.map(m => (
                    <TouchableOpacity
                        key={m.key}
                        style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]}
                        onPress={() => onModeChange(m.key)}
                    >
                        <Text style={[styles.modeBtnText, mode === m.key && styles.modeBtnTextActive]}>
                            {m.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Navigation Row */}
            <View style={styles.navRow}>
                <TouchableOpacity onPress={navigatePrev} style={styles.navBtn}>
                    <ChevronLeft color="#2C3E50" size={22} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.labelContainer}
                    onPress={() => onDateChange(new Date())}
                >
                    <Text style={styles.dateLabel}>{getLabel()}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={navigateNext} style={styles.navBtn}>
                    <ChevronRight color="#2C3E50" size={22} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    modeSwitcher: {
        flexDirection: 'row',
        backgroundColor: '#F4F6F8',
        borderRadius: 12,
        padding: 3,
        marginBottom: 14,
    },
    modeBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 10,
        alignItems: 'center',
    },
    modeBtnActive: {
        backgroundColor: '#2C3E50',
        shadowColor: '#2C3E50',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },
    modeBtnText: {
        fontFamily: 'Cori-SemiBold',
        fontSize: 14,
        color: '#A0AAB5',
    },
    modeBtnTextActive: {
        color: '#FFFFFF',
    },
    navRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    navBtn: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: '#F4F6F8',
    },
    labelContainer: {
        flex: 1,
        alignItems: 'center',
    },
    dateLabel: {
        fontFamily: 'Cori-Bold',
        fontSize: 16,
        color: '#2C3E50',
        textTransform: 'capitalize',
    },
});
