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
  Linking,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import type { RootStackParamList } from '../../App';

type Expediente   = Database['public']['Tables']['expedientes']['Row'];
type Nota         = Database['public']['Tables']['notas_expediente']['Row'];
type Documento    = Database['public']['Tables']['documentos_expediente']['Row'];
type EstadoExpediente = Database['public']['Enums']['estado_expediente'];

type Props = NativeStackScreenProps<RootStackParamList, 'Expedientes'>;

// ── Constantes ────────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<EstadoExpediente, { label: string; bg: string; text: string }> = {
  nuevo:     { label: 'Nuevo',     bg: '#e8f4fd', text: '#1565c0' },
  en_curso:  { label: 'En curso',  bg: '#fff8e1', text: '#e65100' },
  pendiente: { label: 'Pendiente', bg: '#fce4ec', text: '#b71c1c' },
  cerrado:   { label: 'Cerrado',   bg: '#f1f8e9', text: '#33691e' },
};

const MAX_WIDTH   = 1200;
const LEFT_W      = 380;
const WEB_BREAK   = 768;

// ── Helpers compartidos ───────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatFecha(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function getExtension(filename: string, mimeType?: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot > -1) return filename.slice(dot + 1).toLowerCase();
  const map: Record<string, string> = {
    'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/gif': 'gif', 'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
  };
  return map[mimeType ?? ''] ?? 'bin';
}

function getFriendlyType(mimeType: string, ext: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'PDF', 'image/jpeg': 'Imagen', 'image/png': 'Imagen',
    'image/webp': 'Imagen', 'image/gif': 'Imagen', 'application/msword': 'Word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'text/plain': 'Texto',
  };
  return map[mimeType] ?? ext.toUpperCase();
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ExpedientesScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const isWide    = Platform.OS === 'web' && width >= WEB_BREAK;

  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [filtered,    setFiltered]    = useState<Expediente[]>([]);
  const [query,       setQuery]       = useState('');
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [modalVisible,setModalVisible]= useState(false);
  const [saving,      setSaving]      = useState(false);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);

  const [numero,   setNumero]   = useState('');
  const [caratula, setCaratula] = useState('');
  const [cliente,  setCliente]  = useState('');
  const [estado,   setEstado]   = useState<EstadoExpediente>('nuevo');

  const fetchExpedientes = useCallback(async () => {
    const { data, error } = await supabase
      .from('expedientes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { Alert.alert('Error', 'No se pudieron cargar los expedientes'); return; }
    setExpedientes(data ?? []);
  }, []);

  useEffect(() => { fetchExpedientes().finally(() => setLoading(false)); }, [fetchExpedientes]);

  useEffect(() => {
    if (!query.trim()) { setFiltered(expedientes); return; }
    const q = query.toLowerCase();
    setFiltered(expedientes.filter(e =>
      e.numero.toLowerCase().includes(q) ||
      e.caratula.toLowerCase().includes(q) ||
      e.cliente.toLowerCase().includes(q),
    ));
  }, [query, expedientes]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchExpedientes();
    setRefreshing(false);
  };

  const resetForm = () => { setNumero(''); setCaratula(''); setCliente(''); setEstado('nuevo'); };

  const handleCreate = async () => {
    if (!numero.trim() || !caratula.trim() || !cliente.trim()) {
      Alert.alert('Error', 'Número, carátula y cliente son obligatorios');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSaving(true);
    const { data: newExp, error } = await supabase.from('expedientes').insert({
      numero: numero.trim(), caratula: caratula.trim(), cliente: cliente.trim(),
      estado, user_id: user.id,
      fecha_inicio: new Date().toISOString().split('T')[0],
    }).select().single();
    setSaving(false);

    if (error) { Alert.alert('Error', error.message); return; }

    setModalVisible(false);
    resetForm();
    await fetchExpedientes();
    if (newExp && isWide) setSelectedId(newExp.id);
  };

  const renderItem = ({ item }: { item: Expediente }) => {
    const cfg      = ESTADO_CONFIG[item.estado];
    const selected = isWide && item.id === selectedId;
    const onPress  = isWide
      ? () => setSelectedId(item.id)
      : () => navigation.navigate('ExpedienteDetail', { expedienteId: item.id });

    return (
      <TouchableOpacity
        style={[styles.card, selected && styles.cardSelected]}
        onPress={onPress}
        activeOpacity={0.7}
      >
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

  // ── Header + buscador + lista (compartido entre layouts) ─────────────────

  const listHeader = (
    <>
      <View style={[styles.header, isWide && styles.headerWeb]}>
        <Text style={[styles.title, isWide && styles.titleWeb]}>Expedientes</Text>
        <TouchableOpacity
          style={[styles.addButton, isWide && styles.addButtonWeb]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.searchContainer, isWide && styles.searchContainerWeb]}>
        <TextInput
          style={[styles.searchInput, isWide && styles.searchInputWeb]}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por número, carátula o cliente..."
          placeholderTextColor="#aaa"
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
      </View>
    </>
  );

  const listBody = (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={
        filtered.length === 0
          ? [styles.emptyContainer, isWide && styles.emptyContainerWeb]
          : [styles.listContent, isWide && styles.listContentWeb]
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#1a1a1a" />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📁</Text>
          <Text style={styles.emptyText}>
            {query ? 'Sin resultados para esa búsqueda' : 'No hay expedientes todavía'}
          </Text>
        </View>
      }
    />
  );

  // ── Modal "Nuevo expediente" ──────────────────────────────────────────────

  const createModal = (
    <Modal
      visible={modalVisible}
      animationType={isWide ? 'fade' : 'slide'}
      transparent
      onRequestClose={() => { setModalVisible(false); resetForm(); }}
    >
      <View style={[styles.overlay, isWide && styles.overlayWeb]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={isWide ? styles.modalKbWeb : styles.modalKeyboard}
        >
          <View style={[styles.modalContent, isWide && styles.modalContentWeb]}>
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
              <TextInput style={styles.input} value={numero} onChangeText={setNumero}
                placeholder="Ej: 12345/2026" autoCapitalize="none" autoCorrect={false} />

              <Text style={styles.label}>Carátula *</Text>
              <TextInput style={[styles.input, styles.inputMultiline]} value={caratula}
                onChangeText={setCaratula} placeholder="Ej: García c/ López s/ Daños"
                multiline numberOfLines={2} />

              <Text style={styles.label}>Cliente *</Text>
              <TextInput style={styles.input} value={cliente} onChangeText={setCliente}
                placeholder="Nombre del cliente" />

              <Text style={styles.label}>Estado</Text>
              <View style={styles.estadoRow}>
                {(Object.keys(ESTADO_CONFIG) as EstadoExpediente[]).map((key) => {
                  const selected = estado === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.estadoChip, { backgroundColor: ESTADO_CONFIG[key].bg },
                              selected && styles.estadoChipSelected]}
                      onPress={() => setEstado(key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.estadoChipText, { color: ESTADO_CONFIG[key].text },
                                    selected && { fontWeight: '700' }]}>
                        {ESTADO_CONFIG[key].label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.createButton, saving && styles.buttonDisabled]}
                onPress={handleCreate} disabled={saving} activeOpacity={0.8}
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
  );

  // ── Layout móvil ─────────────────────────────────────────────────────────

  if (!isWide) {
    return (
      <View style={styles.container}>
        {listHeader}
        {listBody}
        {createModal}
      </View>
    );
  }

  // ── Layout web dos columnas ───────────────────────────────────────────────

  return (
    <View style={webStyles.root}>
      <View style={webStyles.inner}>

        {/* ── Columna izquierda: lista ── */}
        <View style={webStyles.leftPanel}>
          {listHeader}
          {listBody}
        </View>

        {/* ── Columna derecha: detalle ── */}
        <View style={webStyles.rightPanel}>
          {selectedId ? (
            <WebDetailPanel
              key={selectedId}
              expedienteId={selectedId}
              navigation={navigation}
              onRefreshList={fetchExpedientes}
            />
          ) : (
            <View style={webStyles.emptyPanel}>
              <Text style={webStyles.emptyPanelIcon}>⚖️</Text>
              <Text style={webStyles.emptyPanelTitle}>Seleccioná un expediente</Text>
              <Text style={webStyles.emptyPanelSub}>
                Hacé clic en un expediente de la lista para ver su detalle
              </Text>
            </View>
          )}
        </View>

      </View>
      {createModal}
    </View>
  );
}

// ── WebDetailPanel ────────────────────────────────────────────────────────────
// Panel de detalle inline para el layout web de dos columnas.
// Muestra todos los datos del expediente, notas y documentos.

function WebDetailPanel({
  expedienteId,
  navigation,
  onRefreshList,
}: {
  expedienteId: string;
  navigation: Props['navigation'];
  onRefreshList: () => void;
}) {
  const [expediente,  setExpediente]  = useState<Expediente | null>(null);
  const [notas,       setNotas]       = useState<Nota[]>([]);
  const [documentos,  setDocumentos]  = useState<Documento[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [nuevaNota,   setNuevaNota]   = useState('');
  const [savingNota,  setSavingNota]  = useState(false);
  const [uploadingDoc,setUploadingDoc]= useState(false);

  const fetchAll = useCallback(async () => {
    const [expRes, notasRes, docsRes] = await Promise.all([
      supabase.from('expedientes').select('*').eq('id', expedienteId).single(),
      supabase.from('notas_expediente').select('*').eq('expediente_id', expedienteId)
               .order('created_at', { ascending: false }),
      supabase.from('documentos_expediente').select('*').eq('expediente_id', expedienteId)
               .order('created_at', { ascending: false }),
    ]);
    if (expRes.error || !expRes.data) return;
    setExpediente(expRes.data);
    setNotas(notasRes.data ?? []);
    setDocumentos(docsRes.data ?? []);
  }, [expedienteId]);

  useEffect(() => { fetchAll().finally(() => setLoading(false)); }, [fetchAll]);

  const refreshNotas = async () => {
    const { data } = await supabase.from('notas_expediente').select('*')
      .eq('expediente_id', expedienteId).order('created_at', { ascending: false });
    setNotas(data ?? []);
  };

  const refreshDocumentos = async () => {
    const { data } = await supabase.from('documentos_expediente').select('*')
      .eq('expediente_id', expedienteId).order('created_at', { ascending: false });
    setDocumentos(data ?? []);
  };

  const handleAddNota = async () => {
    if (!nuevaNota.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSavingNota(true);
    const { error } = await supabase.from('notas_expediente').insert({
      expediente_id: expedienteId, contenido: nuevaNota.trim(), user_id: user.id,
    });
    setSavingNota(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setNuevaNota('');
    await refreshNotas();
  };

  const handleDeleteNota = (notaId: string) => {
    if (!window.confirm('¿Eliminar esta nota?')) return;
    supabase.from('notas_expediente').delete().eq('id', notaId).then(({ error }) => {
      if (error) { Alert.alert('Error', error.message); return; }
      setNotas(prev => prev.filter(n => n.id !== notaId));
    });
  };

  const handleUploadArchivo = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*', 'application/msword',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
             'text/plain'],
      copyToCacheDirectory: false,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const ext         = getExtension(asset.name, asset.mimeType ?? undefined);
    const timestamp   = Date.now();
    const storagePath = `${user.id}/${expedienteId}/${timestamp}.${ext}`;
    const nombre      = asset.name.replace(/\.[^.]+$/, '');
    const tipo        = getFriendlyType(asset.mimeType ?? '', ext);

    setUploadingDoc(true);
    try {
      const response = await fetch(asset.uri);
      const blob     = await response.blob();
      const { error: uploadErr } = await supabase.storage
        .from('documentos').upload(storagePath, blob, { contentType: asset.mimeType ?? 'application/octet-stream' });
      if (uploadErr) { Alert.alert('Error al subir', uploadErr.message); return; }

      const { data: { publicUrl } } = supabase.storage.from('documentos').getPublicUrl(storagePath);
      const { error: dbErr } = await supabase.from('documentos_expediente').insert({
        expediente_id: expedienteId, nombre, tipo, archivo_url: publicUrl, user_id: user.id,
      });
      if (dbErr) { Alert.alert('Error al guardar', dbErr.message); return; }
      await refreshDocumentos();
    } catch {
      Alert.alert('Error', 'No se pudo subir el archivo.');
    } finally {
      setUploadingDoc(false);
    }
  };

  if (loading) {
    return (
      <View style={panelStyles.loading}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  if (!expediente) return null;

  const cfg = ESTADO_CONFIG[expediente.estado];

  return (
    <ScrollView style={panelStyles.scroll} contentContainerStyle={panelStyles.content}
                showsVerticalScrollIndicator={false}>

      {/* ── Encabezado del panel ── */}
      <View style={panelStyles.panelHeader}>
        <View style={panelStyles.panelHeaderLeft}>
          <Text style={panelStyles.panelTitle} numberOfLines={2}>{expediente.caratula}</Text>
          <View style={[panelStyles.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[panelStyles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={panelStyles.editBtn}
          onPress={() => navigation.navigate('ExpedienteForm', { expedienteId })}
          activeOpacity={0.8}
        >
          <Text style={panelStyles.editBtnText}>✏️ Editar</Text>
        </TouchableOpacity>
      </View>

      {/* ── Datos ── */}
      <View style={panelStyles.section}>
        <Text style={panelStyles.sectionTitle}>Datos del expediente</Text>
        <View style={panelStyles.card}>
          <PRow label="Número"         value={expediente.numero} />
          <PHr /><PRow label="Carátula"       value={expediente.caratula} ml />
          <PHr /><PRow label="Cliente"        value={expediente.cliente} />
          <PHr /><PRow label="Fecha inicio"   value={formatFecha(expediente.fecha_inicio)} />
          {expediente.descripcion && (<><PHr /><PRow label="Descripción" value={expediente.descripcion} ml /></>)}
        </View>
      </View>

      {/* ── Notas ── */}
      <View style={panelStyles.section}>
        <Text style={panelStyles.sectionTitle}>Notas internas</Text>

        <View style={[panelStyles.card, { marginBottom: 8 }]}>
          <TextInput
            style={panelStyles.notaInput}
            value={nuevaNota}
            onChangeText={setNuevaNota}
            placeholder="Escribir una nota..."
            placeholderTextColor="#bbb"
            multiline
            numberOfLines={3}
          />
          <TouchableOpacity
            style={[panelStyles.notaBtn, (!nuevaNota.trim() || savingNota) && panelStyles.notaBtnDisabled]}
            onPress={handleAddNota}
            disabled={!nuevaNota.trim() || savingNota}
            activeOpacity={0.8}
          >
            <Text style={panelStyles.notaBtnText}>
              {savingNota ? 'Guardando...' : 'Agregar nota'}
            </Text>
          </TouchableOpacity>
        </View>

        {notas.length === 0 ? (
          <Text style={panelStyles.emptyText}>Sin notas todavía</Text>
        ) : notas.map(nota => (
          <View key={nota.id} style={panelStyles.notaCard}>
            <View style={panelStyles.notaBody}>
              <Text style={panelStyles.notaContenido}>{nota.contenido}</Text>
              <Text style={panelStyles.notaFecha}>{formatTimestamp(nota.created_at)}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteNota(nota.id)} style={panelStyles.deleteBtn}>
              <Text style={panelStyles.deleteIcon}>🗑</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* ── Documentos ── */}
      <View style={panelStyles.lastSection}>
        <View style={panelStyles.docHeader}>
          <Text style={panelStyles.sectionTitle}>Documentos</Text>
          <TouchableOpacity
            style={[panelStyles.uploadBtn, uploadingDoc && panelStyles.uploadBtnDisabled]}
            onPress={handleUploadArchivo}
            disabled={uploadingDoc}
            activeOpacity={0.8}
          >
            {uploadingDoc
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={panelStyles.uploadBtnText}>↑ Subir archivo</Text>}
          </TouchableOpacity>
        </View>

        {documentos.length === 0 ? (
          <Text style={panelStyles.emptyText}>Sin documentos adjuntos</Text>
        ) : documentos.map(doc => (
          <TouchableOpacity
            key={doc.id}
            style={panelStyles.docCard}
            onPress={() => Linking.openURL(doc.archivo_url)}
            activeOpacity={0.7}
          >
            <View style={panelStyles.docIconWrap}>
              <Text style={panelStyles.docIcon}>📄</Text>
            </View>
            <View style={panelStyles.docInfo}>
              <Text style={panelStyles.docNombre} numberOfLines={1}>{doc.nombre}</Text>
              <Text style={panelStyles.docMeta}>{doc.tipo} · {formatTimestamp(doc.created_at)}</Text>
            </View>
            <Text style={panelStyles.docArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

    </ScrollView>
  );
}

// ── Subcomponentes del panel ──────────────────────────────────────────────────

function PRow({ label, value, ml }: { label: string; value: string; ml?: boolean }) {
  return (
    <View style={[panelStyles.dataRow, ml && panelStyles.dataRowTop]}>
      <Text style={panelStyles.dataLabel}>{label}</Text>
      <Text style={[panelStyles.dataValue, ml && panelStyles.dataValueMl]}>{value}</Text>
    </View>
  );
}
function PHr() { return <View style={panelStyles.divider} />; }

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f5f5f5' },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, backgroundColor: '#f5f5f5',
  },
  headerWeb:    { paddingTop: 24, paddingBottom: 16 },
  title:        { fontSize: 26, fontWeight: 'bold', color: '#1a1a1a' },
  titleWeb:     { fontSize: 22 },
  addButton:    { backgroundColor: '#1a1a1a', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  addButtonWeb: { paddingVertical: 7, paddingHorizontal: 14 },
  addButtonText:{ color: '#fff', fontSize: 14, fontWeight: '600' },

  searchContainer:    { paddingHorizontal: 20, paddingBottom: 12 },
  searchContainerWeb: { paddingBottom: 10 },
  searchInput: {
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15, color: '#1a1a1a', borderWidth: 1, borderColor: '#e0e0e0',
  },
  searchInputWeb: { paddingVertical: 9, fontSize: 14 },

  listContent:    { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  listContentWeb: { paddingHorizontal: 16, paddingBottom: 20, gap: 8 },
  emptyContainer:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainerWeb: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardSelected: { borderWidth: 2, borderColor: '#1a1a1a' },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  numero:       { fontSize: 13, fontWeight: '600', color: '#555', letterSpacing: 0.3 },
  badge:        { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText:    { fontSize: 12, fontWeight: '600' },
  caratula:     { fontSize: 15, fontWeight: '600', color: '#1a1a1a', lineHeight: 22, marginBottom: 10 },
  cardFooter:   { flexDirection: 'row', alignItems: 'center' },
  clienteLabel: { fontSize: 13, color: '#888' },
  clienteValue: { fontSize: 13, color: '#444', fontWeight: '500', flex: 1 },

  empty:     { alignItems: 'center', gap: 12, paddingVertical: 40 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, color: '#999', textAlign: 'center' },

  // Modal
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  overlayWeb:      { justifyContent: 'center', alignItems: 'center' },
  modalKeyboard:   { justifyContent: 'flex-end' },
  modalKbWeb:      { width: '100%', maxWidth: 540, alignSelf: 'center' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '90%',
  },
  modalContentWeb: { borderRadius: 16, width: '100%' },
  modalHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle:      { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  modalClose:      { fontSize: 18, color: '#888', fontWeight: '500' },

  label:        { fontSize: 13, fontWeight: '600', color: '#1a1a1a', marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    backgroundColor: '#fafafa', color: '#1a1a1a',
  },
  inputMultiline:   { minHeight: 72, textAlignVertical: 'top' },
  estadoRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  estadoChip: {
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  estadoChipSelected: { borderColor: '#1a1a1a' },
  estadoChipText:     { fontSize: 13, fontWeight: '500' },
  createButton: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 24, marginBottom: 8,
  },
  buttonDisabled:    { backgroundColor: '#999' },
  createButtonText:  { color: '#fff', fontSize: 16, fontWeight: '600' },
});

const webStyles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#f0f0f0' },
  inner: {
    flex: 1, flexDirection: 'row',
    maxWidth: MAX_WIDTH, alignSelf: 'center', width: '100%',
  },
  leftPanel: {
    width: LEFT_W, backgroundColor: '#f5f5f5',
    borderRightWidth: 1, borderRightColor: '#e0e0e0',
  },
  rightPanel:  { flex: 1, backgroundColor: '#f5f5f5' },
  emptyPanel:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  emptyPanelIcon:  { fontSize: 56 },
  emptyPanelTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  emptyPanelSub:   { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
});

const panelStyles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 48 },

  panelHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  panelHeaderLeft:{ flex: 1, marginRight: 12 },
  panelTitle:     { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 8, lineHeight: 26 },
  badge:          { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText:      { fontSize: 12, fontWeight: '600' },
  editBtn:        { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  editBtnText:    { color: '#fff', fontSize: 13, fontWeight: '600' },

  section:      { marginBottom: 24 },
  lastSection:  { marginBottom: 0 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  dataRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14 },
  dataRowTop:  { alignItems: 'flex-start' },
  dataLabel:   { fontSize: 12, color: '#999', width: 100, flexShrink: 0, paddingTop: 1 },
  dataValue:   { fontSize: 13, color: '#1a1a1a', fontWeight: '500', flex: 1 },
  dataValueMl: { lineHeight: 19 },
  divider:     { height: 1, backgroundColor: '#f2f2f2', marginHorizontal: 14 },

  notaInput: {
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6,
    fontSize: 14, color: '#1a1a1a', minHeight: 72,
  },
  notaBtn:         { backgroundColor: '#1a1a1a', margin: 10, marginTop: 4, borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  notaBtnDisabled: { backgroundColor: '#c0c0c0' },
  notaBtnText:     { color: '#fff', fontSize: 13, fontWeight: '600' },

  notaCard:     { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  notaBody:     { flex: 1, marginRight: 8 },
  notaContenido:{ fontSize: 13, color: '#1a1a1a', lineHeight: 19, marginBottom: 4 },
  notaFecha:    { fontSize: 11, color: '#bbb' },
  deleteBtn:    { paddingTop: 1 },
  deleteIcon:   { fontSize: 15 },

  emptyText:    { fontSize: 13, color: '#c0c0c0', fontStyle: 'italic' },

  docHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  uploadBtn:    { backgroundColor: '#1a1a1a', borderRadius: 7, paddingHorizontal: 12, paddingVertical: 7, minWidth: 44, alignItems: 'center' },
  uploadBtnDisabled: { backgroundColor: '#999' },
  uploadBtnText:{ color: '#fff', fontSize: 12, fontWeight: '600' },

  docCard:    { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  docIconWrap:{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  docIcon:    { fontSize: 18 },
  docInfo:    { flex: 1 },
  docNombre:  { fontSize: 13, fontWeight: '600', color: '#1a1a1a', marginBottom: 2 },
  docMeta:    { fontSize: 11, color: '#aaa' },
  docArrow:   { fontSize: 20, color: '#ccc', lineHeight: 24 },
});
