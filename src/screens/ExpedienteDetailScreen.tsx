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
  Linking,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import type { RootStackParamList } from '../../App';

type Expediente = Database['public']['Tables']['expedientes']['Row'];
type Nota       = Database['public']['Tables']['notas_expediente']['Row'];
type Documento  = Database['public']['Tables']['documentos_expediente']['Row'];
type EstadoExpediente = Database['public']['Enums']['estado_expediente'];

type Props = NativeStackScreenProps<RootStackParamList, 'ExpedienteDetail'>;

const ESTADO_CONFIG: Record<EstadoExpediente, { label: string; bg: string; text: string }> = {
  nuevo:     { label: 'Nuevo',     bg: '#e8f4fd', text: '#1565c0' },
  en_curso:  { label: 'En curso',  bg: '#fff8e1', text: '#e65100' },
  pendiente: { label: 'Pendiente', bg: '#fce4ec', text: '#b71c1c' },
  cerrado:   { label: 'Cerrado',   bg: '#f1f8e9', text: '#33691e' },
};

function formatFecha(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ExpedienteDetailScreen({ route, navigation }: Props) {
  const { expedienteId } = route.params;

  const [expediente, setExpediente] = useState<Expediente | null>(null);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevaNota, setNuevaNota] = useState('');
  const [savingNota, setSavingNota] = useState(false);

  const fetchAll = useCallback(async () => {
    const [expRes, notasRes, docsRes] = await Promise.all([
      supabase.from('expedientes').select('*').eq('id', expedienteId).single(),
      supabase
        .from('notas_expediente')
        .select('*')
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: false }),
      supabase
        .from('documentos_expediente')
        .select('*')
        .eq('expediente_id', expedienteId)
        .order('created_at', { ascending: false }),
    ]);

    if (expRes.error || !expRes.data) {
      Alert.alert('Error', 'No se pudo cargar el expediente');
      navigation.goBack();
      return;
    }

    setExpediente(expRes.data);
    setNotas(notasRes.data ?? []);
    setDocumentos(docsRes.data ?? []);
  }, [expedienteId, navigation]);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const refreshNotas = async () => {
    const { data } = await supabase
      .from('notas_expediente')
      .select('*')
      .eq('expediente_id', expedienteId)
      .order('created_at', { ascending: false });
    setNotas(data ?? []);
  };

  const handleAddNota = async () => {
    if (!nuevaNota.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSavingNota(true);
    const { error } = await supabase.from('notas_expediente').insert({
      expediente_id: expedienteId,
      contenido: nuevaNota.trim(),
      user_id: user.id,
    });
    setSavingNota(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setNuevaNota('');
    await refreshNotas();
  };

  const handleDeleteNota = (notaId: string) => {
    Alert.alert(
      'Eliminar nota',
      '¿Estás seguro de que querés eliminar esta nota?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('notas_expediente')
              .delete()
              .eq('id', notaId);

            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            setNotas((prev) => prev.filter((n) => n.id !== notaId));
          },
        },
      ],
    );
  };

  const handleOpenDocumento = async (url: string) => {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', 'No se puede abrir este documento');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  if (!expediente) return null;

  const estadoCfg = ESTADO_CONFIG[expediente.estado];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Barra superior con volver */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Datos del expediente ─────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Datos del expediente</Text>
            <View style={[styles.badge, { backgroundColor: estadoCfg.bg }]}>
              <Text style={[styles.badgeText, { color: estadoCfg.text }]}>
                {estadoCfg.label}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <DataRow label="Número"         value={expediente.numero} />
            <RowDivider />
            <DataRow label="Carátula"        value={expediente.caratula} multiline />
            <RowDivider />
            <DataRow label="Cliente"         value={expediente.cliente} />
            <RowDivider />
            <DataRow label="Fecha de inicio" value={formatFecha(expediente.fecha_inicio)} />
            {expediente.descripcion ? (
              <>
                <RowDivider />
                <DataRow label="Descripción" value={expediente.descripcion} multiline />
              </>
            ) : null}
          </View>
        </View>

        {/* ── Notas internas ───────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notas internas</Text>

          {/* Campo para agregar nota */}
          <View style={[styles.card, styles.notaInputCard]}>
            <TextInput
              style={styles.notaInput}
              value={nuevaNota}
              onChangeText={setNuevaNota}
              placeholder="Escribir una nota..."
              placeholderTextColor="#bbb"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[
                styles.addNotaButton,
                (!nuevaNota.trim() || savingNota) && styles.buttonDisabled,
              ]}
              onPress={handleAddNota}
              disabled={!nuevaNota.trim() || savingNota}
              activeOpacity={0.8}
            >
              <Text style={styles.addNotaButtonText}>
                {savingNota ? 'Guardando...' : 'Agregar nota'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Lista de notas */}
          {notas.length === 0 ? (
            <Text style={styles.emptyText}>Sin notas todavía</Text>
          ) : (
            notas.map((nota) => (
              <View key={nota.id} style={styles.notaCard}>
                <View style={styles.notaBody}>
                  <Text style={styles.notaContenido}>{nota.contenido}</Text>
                  <Text style={styles.notaFecha}>{formatTimestamp(nota.created_at)}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteNota(nota.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteIcon}>🗑</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ── Documentos ───────────────────────────────────────── */}
        <View style={styles.lastSection}>
          <Text style={styles.sectionTitle}>Documentos</Text>

          {documentos.length === 0 ? (
            <Text style={styles.emptyText}>Sin documentos adjuntos</Text>
          ) : (
            documentos.map((doc) => (
              <TouchableOpacity
                key={doc.id}
                style={styles.docCard}
                onPress={() => handleOpenDocumento(doc.archivo_url)}
                activeOpacity={0.7}
              >
                <View style={styles.docIconWrap}>
                  <Text style={styles.docIconText}>📄</Text>
                </View>
                <View style={styles.docInfo}>
                  <Text style={styles.docNombre} numberOfLines={1}>{doc.nombre}</Text>
                  <Text style={styles.docMeta}>
                    {doc.tipo} · {formatTimestamp(doc.created_at)}
                  </Text>
                </View>
                <Text style={styles.docArrow}>›</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────

function DataRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={[rowStyles.row, multiline && rowStyles.rowTop]}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, multiline && rowStyles.valueMultiline]}>{value}</Text>
    </View>
  );
}

function RowDivider() {
  return <View style={rowStyles.divider} />;
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  rowTop: {
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 13,
    color: '#999',
    width: 110,
    flexShrink: 0,
    paddingTop: 1,
  },
  value: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
    flex: 1,
  },
  valueMultiline: {
    lineHeight: 21,
  },
  divider: {
    height: 1,
    backgroundColor: '#f2f2f2',
    marginHorizontal: 16,
  },
});

// ── Estilos principales ───────────────────────────────────────────────────

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

  topBar: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backText: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
  },

  // Secciones
  section: {
    marginBottom: 28,
  },
  lastSection: {
    marginBottom: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },

  // Card base
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },

  // Badge estado
  badge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Nota: input card
  notaInputCard: {
    marginBottom: 10,
  },
  notaInput: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    fontSize: 15,
    color: '#1a1a1a',
    minHeight: 80,
  },
  addNotaButton: {
    backgroundColor: '#1a1a1a',
    margin: 12,
    marginTop: 6,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#c0c0c0',
  },
  addNotaButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Nota: items
  notaCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  notaBody: {
    flex: 1,
    marginRight: 8,
  },
  notaContenido: {
    fontSize: 14,
    color: '#1a1a1a',
    lineHeight: 21,
    marginBottom: 6,
  },
  notaFecha: {
    fontSize: 11,
    color: '#bbb',
  },
  deleteButton: {
    paddingTop: 1,
  },
  deleteIcon: {
    fontSize: 16,
  },

  // Empty states
  emptyText: {
    fontSize: 14,
    color: '#c0c0c0',
    fontStyle: 'italic',
    paddingLeft: 2,
  },

  // Documento: items
  docCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  docIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  docIconText: {
    fontSize: 20,
  },
  docInfo: {
    flex: 1,
  },
  docNombre: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 3,
  },
  docMeta: {
    fontSize: 12,
    color: '#aaa',
  },
  docArrow: {
    fontSize: 24,
    color: '#ccc',
    lineHeight: 28,
  },
});
