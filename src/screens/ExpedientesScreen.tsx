import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

type Expediente = Database['public']['Tables']['expedientes']['Row'];
type EstadoExpediente = Database['public']['Enums']['estado_expediente'];

const ESTADO_CONFIG: Record<EstadoExpediente, { label: string; bg: string; text: string }> = {
  nuevo:     { label: 'Nuevo',     bg: '#e8f4fd', text: '#1565c0' },
  en_curso:  { label: 'En curso',  bg: '#fff8e1', text: '#e65100' },
  pendiente: { label: 'Pendiente', bg: '#fce4ec', text: '#b71c1c' },
  cerrado:   { label: 'Cerrado',   bg: '#f1f8e9', text: '#33691e' },
};

export default function ExpedientesScreen() {
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [filtered, setFiltered] = useState<Expediente[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const [numero, setNumero] = useState('');
  const [caratula, setCaratula] = useState('');
  const [cliente, setCliente] = useState('');
  const [estado, setEstado] = useState<EstadoExpediente>('nuevo');

  const fetchExpedientes = useCallback(async () => {
    const { data, error } = await supabase
      .from('expedientes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Error', 'No se pudieron cargar los expedientes');
      return;
    }
    setExpedientes(data ?? []);
  }, []);

  useEffect(() => {
    fetchExpedientes().finally(() => setLoading(false));
  }, [fetchExpedientes]);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(expedientes);
      return;
    }
    const q = query.toLowerCase();
    setFiltered(
      expedientes.filter(
        (e) =>
          e.numero.toLowerCase().includes(q) ||
          e.caratula.toLowerCase().includes(q) ||
          e.cliente.toLowerCase().includes(q),
      ),
    );
  }, [query, expedientes]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchExpedientes();
    setRefreshing(false);
  };

  const resetForm = () => {
    setNumero('');
    setCaratula('');
    setCliente('');
    setEstado('nuevo');
  };

  const handleCreate = async () => {
    if (!numero.trim() || !caratula.trim() || !cliente.trim()) {
      Alert.alert('Error', 'Número, carátula y cliente son obligatorios');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSaving(true);
    const { error } = await supabase.from('expedientes').insert({
      numero: numero.trim(),
      caratula: caratula.trim(),
      cliente: cliente.trim(),
      estado,
      user_id: user.id,
      fecha_inicio: new Date().toISOString().split('T')[0],
    });
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setModalVisible(false);
    resetForm();
    await fetchExpedientes();
  };

  const renderItem = ({ item }: { item: Expediente }) => {
    const cfg = ESTADO_CONFIG[item.estado];
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.7}>
        <View style={styles.cardHeader}>
          <Text style={styles.numero}>Exp. {item.numero}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
          </View>
        </View>
        <Text style={styles.caratula} numberOfLines={2}>{item.caratula}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.clienteLabel}>Cliente: </Text>
          <Text style={styles.clienteValue} numberOfLines={1}>{item.cliente}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Expedientes</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por número, carátula o cliente..."
          placeholderTextColor="#aaa"
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          filtered.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#1a1a1a"
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📁</Text>
            <Text style={styles.emptyText}>
              {query
                ? 'Sin resultados para esa búsqueda'
                : 'No hay expedientes todavía'}
            </Text>
          </View>
        }
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboard}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nuevo expediente</Text>
                <TouchableOpacity
                  onPress={() => { setModalVisible(false); resetForm(); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>Número *</Text>
                <TextInput
                  style={styles.input}
                  value={numero}
                  onChangeText={setNumero}
                  placeholder="Ej: 12345/2026"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.label}>Carátula *</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={caratula}
                  onChangeText={setCaratula}
                  placeholder="Ej: García c/ López s/ Daños"
                  multiline
                  numberOfLines={2}
                />

                <Text style={styles.label}>Cliente *</Text>
                <TextInput
                  style={styles.input}
                  value={cliente}
                  onChangeText={setCliente}
                  placeholder="Nombre del cliente"
                />

                <Text style={styles.label}>Estado</Text>
                <View style={styles.estadoRow}>
                  {(Object.keys(ESTADO_CONFIG) as EstadoExpediente[]).map((key) => {
                    const selected = estado === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.estadoChip,
                          { backgroundColor: ESTADO_CONFIG[key].bg },
                          selected && styles.estadoChipSelected,
                        ]}
                        onPress={() => setEstado(key)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.estadoChipText,
                            { color: ESTADO_CONFIG[key].text },
                            selected && { fontWeight: '700' },
                          ]}
                        >
                          {ESTADO_CONFIG[key].label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={[styles.createButton, saving && styles.buttonDisabled]}
                  onPress={handleCreate}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  <Text style={styles.createButtonText}>
                    {saving ? 'Guardando...' : 'Crear expediente'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  addButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Buscador
  searchContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  // Lista
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  numero: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 0.3,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  caratula: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    lineHeight: 22,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clienteLabel: {
    fontSize: 13,
    color: '#888',
  },
  clienteValue: {
    fontSize: 13,
    color: '#444',
    fontWeight: '500',
    flex: 1,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
  },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalKeyboard: {
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  modalClose: {
    fontSize: 18,
    color: '#888',
    fontWeight: '500',
  },

  // Form
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  estadoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  estadoChip: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
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
  createButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  buttonDisabled: {
    backgroundColor: '#999',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
