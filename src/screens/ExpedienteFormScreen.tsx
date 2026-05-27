import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import type { RootStackParamList } from '../../App';

type EstadoExpediente = Database['public']['Enums']['estado_expediente'];

type Props = NativeStackScreenProps<RootStackParamList, 'ExpedienteForm'>;

const ESTADO_CONFIG: Record<EstadoExpediente, { label: string; bg: string; text: string }> = {
  nuevo:     { label: 'Nuevo',     bg: '#e8f4fd', text: '#1565c0' },
  en_curso:  { label: 'En curso',  bg: '#fff8e1', text: '#e65100' },
  pendiente: { label: 'Pendiente', bg: '#fce4ec', text: '#b71c1c' },
  cerrado:   { label: 'Cerrado',   bg: '#f1f8e9', text: '#33691e' },
};

// YYYY-MM-DD → DD/MM/YYYY para mostrar en el input
function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// DD/MM/YYYY → YYYY-MM-DD para guardar, null si inválido
function displayToIso(input: string): string | null {
  const match = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (
    isNaN(date.getTime()) ||
    date.getDate() !== Number(d) ||
    date.getMonth() + 1 !== Number(m)
  ) return null;
  return `${y}-${m}-${d}`;
}

export default function ExpedienteFormScreen({ route, navigation }: Props) {
  const expedienteId = route.params?.expedienteId;
  const isEditing = !!expedienteId;

  const [loadingData, setLoadingData] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  const [numero, setNumero]         = useState('');
  const [caratula, setCaratula]     = useState('');
  const [cliente, setCliente]       = useState('');
  const [estado, setEstado]         = useState<EstadoExpediente>('nuevo');
  const [fechaInicio, setFechaInicio] = useState(
    isoToDisplay(new Date().toISOString().split('T')[0]),
  );
  const [descripcion, setDescripcion] = useState('');

  const loadExpediente = useCallback(async () => {
    if (!expedienteId) return;

    const { data, error } = await supabase
      .from('expedientes')
      .select('*')
      .eq('id', expedienteId)
      .single();

    if (error || !data) {
      Alert.alert('Error', 'No se pudo cargar el expediente');
      navigation.goBack();
      return;
    }

    setNumero(data.numero);
    setCaratula(data.caratula);
    setCliente(data.cliente);
    setEstado(data.estado);
    setFechaInicio(isoToDisplay(data.fecha_inicio));
    setDescripcion(data.descripcion ?? '');
  }, [expedienteId, navigation]);

  useEffect(() => {
    loadExpediente().finally(() => setLoadingData(false));
  }, [loadExpediente]);

  const handleSave = async () => {
    if (!numero.trim() || !caratula.trim() || !cliente.trim()) {
      Alert.alert('Campos incompletos', 'Número, carátula y cliente son obligatorios');
      return;
    }

    const isoFecha = displayToIso(fechaInicio);
    if (!isoFecha) {
      Alert.alert('Fecha inválida', 'Ingresá la fecha con el formato DD/MM/AAAA');
      return;
    }

    setSaving(true);

    if (isEditing) {
      const { error } = await supabase
        .from('expedientes')
        .update({
          numero:       numero.trim(),
          caratula:     caratula.trim(),
          cliente:      cliente.trim(),
          estado,
          fecha_inicio: isoFecha,
          descripcion:  descripcion.trim() || null,
          updated_at:   new Date().toISOString(),
        })
        .eq('id', expedienteId);

      setSaving(false);
      if (error) { Alert.alert('Error', error.message); return; }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }

      const { error } = await supabase.from('expedientes').insert({
        numero:       numero.trim(),
        caratula:     caratula.trim(),
        cliente:      cliente.trim(),
        estado,
        fecha_inicio: isoFecha,
        descripcion:  descripcion.trim() || null,
        user_id:      user.id,
      });

      setSaving(false);
      if (error) { Alert.alert('Error', error.message); return; }
    }

    navigation.goBack();
  };

  if (loadingData) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Barra superior */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>
          {isEditing ? 'Editar expediente' : 'Nuevo expediente'}
        </Text>
        {/* Espejo del botón volver para centrar el título */}
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>

          {/* Número */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Número <Text style={styles.req}>*</Text>
            </Text>
            <TextInput
              style={styles.fieldInput}
              value={numero}
              onChangeText={setNumero}
              placeholder="Ej: 12345/2026"
              placeholderTextColor="#ccc"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <FieldDivider />

          {/* Carátula */}
          <View style={[styles.field, styles.fieldTop]}>
            <Text style={[styles.fieldLabel, styles.fieldLabelTop]}>
              Carátula <Text style={styles.req}>*</Text>
            </Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMultiline]}
              value={caratula}
              onChangeText={setCaratula}
              placeholder="Ej: García c/ López s/ Daños"
              placeholderTextColor="#ccc"
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />
          </View>
          <FieldDivider />

          {/* Cliente */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Cliente <Text style={styles.req}>*</Text>
            </Text>
            <TextInput
              style={styles.fieldInput}
              value={cliente}
              onChangeText={setCliente}
              placeholder="Nombre del cliente"
              placeholderTextColor="#ccc"
            />
          </View>
          <FieldDivider />

          {/* Estado */}
          <View style={[styles.field, styles.fieldTop]}>
            <Text style={[styles.fieldLabel, styles.fieldLabelTop]}>Estado</Text>
            <View style={styles.estadoGrid}>
              {(Object.keys(ESTADO_CONFIG) as EstadoExpediente[]).map((key) => {
                const cfg = ESTADO_CONFIG[key];
                const selected = estado === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.estadoChip,
                      { backgroundColor: cfg.bg },
                      selected && styles.estadoChipSelected,
                    ]}
                    onPress={() => setEstado(key)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.estadoChipText,
                        { color: cfg.text },
                        selected && styles.estadoChipTextSelected,
                      ]}
                    >
                      {cfg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <FieldDivider />

          {/* Fecha de inicio */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Fecha <Text style={styles.req}>*</Text>
            </Text>
            <TextInput
              style={styles.fieldInput}
              value={fechaInicio}
              onChangeText={setFechaInicio}
              placeholder="DD/MM/AAAA"
              placeholderTextColor="#ccc"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              autoCorrect={false}
            />
          </View>
          <FieldDivider />

          {/* Descripción */}
          <View style={[styles.field, styles.fieldTop]}>
            <Text style={[styles.fieldLabel, styles.fieldLabelTop]}>
              Descripción
            </Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMultiline, styles.fieldInputDesc]}
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="Opcional"
              placeholderTextColor="#ccc"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

        </View>

        {/* Botón guardar */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.saveButtonText}>
            {saving
              ? 'Guardando...'
              : isEditing
              ? 'Guardar cambios'
              : 'Crear expediente'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Auxiliar ──────────────────────────────────────────────────────────────

function FieldDivider() {
  return <View style={{ height: 1, backgroundColor: '#f2f2f2' }} />;
}

// ── Estilos ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  backButton: {
    minWidth: 72,
  },
  backText: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  screenTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  topBarSpacer: {
    minWidth: 72,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
    gap: 16,
  },

  // Card contenedor del formulario
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  // Campos
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldTop: {
    alignItems: 'flex-start',
  },
  fieldLabel: {
    fontSize: 13,
    color: '#999',
    width: 88,
    flexShrink: 0,
  },
  fieldLabelTop: {
    paddingTop: Platform.OS === 'ios' ? 2 : 4,
  },
  req: {
    color: '#e53935',
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    paddingVertical: 0,
  },
  fieldInputMultiline: {
    minHeight: 52,
    lineHeight: 21,
  },
  fieldInputDesc: {
    minHeight: 72,
  },

  // Chips de estado
  estadoGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 2,
    paddingBottom: 2,
  },
  estadoChip: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  estadoChipSelected: {
    borderColor: '#1a1a1a',
  },
  estadoChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  estadoChipTextSelected: {
    fontWeight: '700',
  },

  // Botón guardar
  saveButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  saveButtonDisabled: {
    backgroundColor: '#bbb',
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
