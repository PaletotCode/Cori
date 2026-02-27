import {
    createMaterialTopTabNavigator,
    MaterialTopTabNavigationEventMap,
    MaterialTopTabNavigationOptions,
} from '@react-navigation/material-top-tabs';
import { ParamListBase, TabNavigationState } from '@react-navigation/native';
import { withLayoutContext } from 'expo-router';
import CustomTabBar from '../../components/CustomTabBar';

const { Navigator } = createMaterialTopTabNavigator();

export const MaterialTopTabs = withLayoutContext<
    MaterialTopTabNavigationOptions,
    typeof Navigator,
    TabNavigationState<ParamListBase>,
    MaterialTopTabNavigationEventMap
>(Navigator);

export default function AppLayout() {
    return (
        <MaterialTopTabs
            tabBarPosition="bottom" // Positions the Material Top Tabs at the bottom to allow swipe
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{
                swipeEnabled: true,
            }}
        >
            <MaterialTopTabs.Screen
                name="index"
                options={{ title: 'Home' }}
            />
            <MaterialTopTabs.Screen
                name="agenda"
                options={{ title: 'Agenda' }}
            />
            <MaterialTopTabs.Screen
                name="pacientes"
                options={{ title: 'Pacientes' }}
            />
            <MaterialTopTabs.Screen
                name="financeiro"
                options={{ title: 'Financeiro' }}
            />
        </MaterialTopTabs>
    );
}
