import 'react-native-url-polyfill/auto';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from './src/hooks/useAuth';
import LoginScreen from './src/screens/LoginScreen';
import ExpedientesScreen from './src/screens/ExpedientesScreen';
import ExpedienteDetailScreen from './src/screens/ExpedienteDetailScreen';
import ExpedienteFormScreen from './src/screens/ExpedienteFormScreen';
import ScanScreen from './src/screens/ScanScreen';

/**
 * Tipo canónico del stack. Importarlo en los screens para tener
 * tipado completo:  NativeStackScreenProps<RootStackParamList, 'NombrePantalla'>
 */
export type RootStackParamList = {
  Login:             undefined;
  Expedientes:       undefined;
  ExpedienteDetail:  { expedienteId: string };
  ExpedienteForm:    { expedienteId?: string } | undefined;
  Scan:              { expedienteId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#f5f5f5' },
        animation: 'slide_from_right',
      }}
    >
      {!session ? (
        /* ── Sin sesión ──────────────────────────────────── */
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: 'Iniciar sesión' }}
        />
      ) : (
        /* ── Con sesión ──────────────────────────────────── */
        <>
          <Stack.Screen
            name="Expedientes"
            component={ExpedientesScreen}
            options={{ title: 'Expedientes' }}
          />

          <Stack.Screen
            name="ExpedienteDetail"
            component={ExpedienteDetailScreen}
            options={{ title: 'Detalle de expediente' }}
          />

          <Stack.Screen
            name="ExpedienteForm"
            component={ExpedienteFormScreen}
            options={({ route }) => ({
              title: route.params?.expedienteId
                ? 'Editar expediente'
                : 'Nuevo expediente',
            })}
          />

          <Stack.Screen
            name="Scan"
            component={ScanScreen}
            options={{ title: 'Escanear documento' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </NavigationContainer>
  );
}
