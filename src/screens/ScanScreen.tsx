import { useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import DocumentScanner, {
  ResponseType,
  ScanDocumentResponseStatus,
} from 'react-native-document-scanner-plugin';
import { jsPDF } from 'jspdf';
import { supabase } from '../lib/supabase';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

const { width: SCREEN_W } = Dimensions.get('window');
// 2 columnas: 20+20 de padding + 12 de gap entre columnas
const THUMB_W = (SCREEN_W - 52) / 2;
const THUMB_H = THUMB_W * 1.37; // proporción A4 portrait

type Mode = 'una' | 'varias';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Construye un PDF en memoria a partir de un array de strings base64 (JPEG).
 * Cada imagen ocupa una página A4 completa.
 */
async function buildPdf(base64Images: string[]): Promise<ArrayBuffer> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  for (let i = 0; i < base64Images.length; i++) {
    if (i > 0) doc.addPage();
    doc.addImage(
      `data:image/jpeg;base64,${base64Images[i]}`,
      'JPEG',
      0,
      0,
      w,
      h,
      `page-${i}`,
      'FAST',
    );
  }

  return doc.output('arraybuffer');
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function ScanScreen({ route, navigation }: Props) {
  const { expedienteId } = route.params;

  const [mode, setMode]           = useState<Mode | null>(null);
  const [pages, setPages]         = useState<string[]>([]); // base64 JPEG strings
  const [scanning, setScanning]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docNombre, setDocNombre] = useState('');

  // ── Escanear una página ─────────────────────────────────────────────────

  const triggerScan = async (currentMode: Mode) => {
    if (scanning) return;
    setScanning(true);
    try {
      const result = await DocumentScanner.scanDocument({
        croppedImageQuality: 100,
        maxNumDocuments: 1,
        responseType: ResponseType.Base64,
      });

      if (
        result.status === ScanDocumentResponseStatus.Cancel ||
        !result.scannedImages?.length
      ) {
        // Si cancela en el primer escaneo de 'una', vuelve al selector
        if (currentMode === 'una' && pages.length === 0) setMode(null);
        return;
      }

      const b64 = result.scannedImages[0];
      if (currentMode === 'una') {
        setPages([b64]);
      } else {
        setPages(prev => [...prev, b64]);
      }
    } catch {
      Alert.alert('Error', 'No se pudo acceder al escáner. Verificá los permisos de cámara.');
      if (currentMode === 'una' && pages.length === 0) setMode(null);
    } finally {
      setScanning(false);
    }
  };

  // ── Confirmar y subir ────────────────────────────────────────────────────

  const handleFinalize = async () => {
    if (pages.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const nombre = docNombre.trim() ||
      `Documento ${new Date().toLocaleDateString('es-AR')}`;

    setUploading(true);
    try {
      const pdfBuffer = await buildPdf(pages);

      const timestamp = Date.now();
      const storagePath = `${user.id}/${expedienteId}/${timestamp}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(storagePath, pdfBuffer, { contentType: 'application/pdf' });

      if (uploadError) {
        Alert.alert('Error al subir', uploadError.message);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('documentos')
        .getPublicUrl(storagePath);

      const pagesLabel = `${pages.length} ${pages.length === 1 ? 'página' : 'páginas'}`;

      const { error: dbError } = await supabase
        .from('documentos_expediente')
        .insert({
          expediente_id: expedienteId,
          nombre,
          tipo: `PDF · ${pagesLabel}`,
          archivo_url: publicUrl,
          user_id: user.id,
        });

      if (dbError) {
        Alert.alert('Error al guardar', dbError.message);
        return;
      }

      navigation.goBack();
    } catch {
      Alert.alert('Error', 'No se pudo generar el PDF. Intentá de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  // ── Confirmar descarte ───────────────────────────────────────────────────

  const handleBack = () => {
    if (pages.length > 0) {
      Alert.alert(
        'Descartar escaneo',
        'Vas a perder las páginas escaneadas. ¿Continuás?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Descartar',
            style: 'destructive',
            onPress: () => { setMode(null); setPages([]); },
          },
        ],
      );
    } else {
      setMode(null);
      setPages([]);
    }
  };

  // ── Pantalla de carga ────────────────────────────────────────────────────

  if (scanning || uploading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
        <Text style={styles.loadingText}>
          {scanning ? 'Abriendo escáner...' : 'Generando PDF y subiendo...'}
        </Text>
      </View>
    );
  }

  // ── Selector de modo ─────────────────────────────────────────────────────

  if (mode === null) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backText}>← Volver</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.selectorWrap}>
          <Text style={styles.selectorTitle}>Escanear documento</Text>
          <Text style={styles.selectorSub}>¿Cuántas páginas tiene el documento?</Text>

          <TouchableOpacity
            style={styles.modeCard}
            onPress={() => { setMode('una'); triggerScan('una'); }}
            activeOpacity={0.75}
          >
            <Text style={styles.modeIcon}>📄</Text>
            <View style={styles.modeText}>
              <Text style={styles.modeTitle}>Una página</Text>
              <Text style={styles.modeDesc}>Escanea, previsualiza y confirma</Text>
            </View>
            <Text style={styles.modeArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modeCard}
            onPress={() => setMode('varias')}
            activeOpacity={0.75}
          >
            <Text style={styles.modeIcon}>📚</Text>
            <View style={styles.modeText}>
              <Text style={styles.modeTitle}>Varias páginas</Text>
              <Text style={styles.modeDesc}>Acumula páginas antes de subir</Text>
            </View>
            <Text style={styles.modeArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Modo: una página ─────────────────────────────────────────────────────

  if (mode === 'una') {
    const previewUri = pages.length > 0
      ? `data:image/jpeg;base64,${pages[0]}`
      : null;

    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => { setMode(null); setPages([]); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backText}>← Volver</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Una página</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.unaWrap}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {previewUri ? (
            <>
              {/* Preview */}
              <View style={styles.previewCard}>
                <Image
                  source={{ uri: previewUri }}
                  style={styles.previewImg}
                  resizeMode="contain"
                />
              </View>

              {/* Nombre */}
              <View style={styles.inputCard}>
                <Text style={styles.inputMeta}>NOMBRE DEL DOCUMENTO</Text>
                <TextInput
                  style={styles.inputField}
                  value={docNombre}
                  onChangeText={setDocNombre}
                  placeholder="Ej: Demanda inicial"
                  placeholderTextColor="#ccc"
                />
              </View>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => triggerScan('una')}
                activeOpacity={0.75}
              >
                <Text style={styles.secondaryBtnText}>Volver a escanear</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleFinalize}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Confirmar y subir</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* No hay página escaneada (canceló y volvió aquí) */
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📷</Text>
              <Text style={styles.emptyMsg}>No se escaneó ninguna página</Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => triggerScan('una')}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Escanear ahora</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Modo: varias páginas ─────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>
          {pages.length === 0
            ? 'Varias páginas'
            : `${pages.length} ${pages.length === 1 ? 'página' : 'páginas'}`}
        </Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.variasWrap}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Estado vacío */}
        {pages.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📚</Text>
            <Text style={styles.emptyMsg}>Escaneá la primera página para comenzar</Text>
          </View>
        )}

        {/* Grid de miniaturas */}
        {pages.length > 0 && (
          <View style={styles.thumbGrid}>
            {pages.map((b64, i) => (
              <View key={i} style={styles.thumbOuter}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${b64}` }}
                  style={styles.thumbImg}
                  resizeMode="cover"
                />
                {/* Número de página */}
                <View style={styles.thumbBadge}>
                  <Text style={styles.thumbBadgeText}>{i + 1}</Text>
                </View>
                {/* Eliminar página */}
                <TouchableOpacity
                  style={styles.thumbRemove}
                  onPress={() => setPages(prev => prev.filter((_, idx) => idx !== i))}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Text style={styles.thumbRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Nombre del documento (solo cuando hay páginas) */}
        {pages.length > 0 && (
          <View style={styles.inputCard}>
            <Text style={styles.inputMeta}>NOMBRE DEL DOCUMENTO</Text>
            <TextInput
              style={styles.inputField}
              value={docNombre}
              onChangeText={setDocNombre}
              placeholder="Ej: Demanda inicial"
              placeholderTextColor="#ccc"
            />
          </View>
        )}

        {/* Escanear otra — SIEMPRE visible */}
        <TouchableOpacity
          style={styles.scanMoreBtn}
          onPress={() => triggerScan('varias')}
          activeOpacity={0.8}
        >
          <Text style={styles.scanMoreText}>
            {pages.length === 0
              ? '📷  Escanear primera página'
              : '📷  Escanear otra página'}
          </Text>
        </TouchableOpacity>

        {/* Finalizar — solo cuando hay páginas */}
        {pages.length > 0 && (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleFinalize}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>
              {`Finalizar y subir · ${pages.length} ${pages.length === 1 ? 'página' : 'páginas'}`}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

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
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },

  // ── Barra superior
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  backText: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
    minWidth: 72,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  topBarSpacer: {
    minWidth: 72,
  },

  // ── Selector de modo
  selectorWrap: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  selectorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  selectorSub: {
    fontSize: 15,
    color: '#888',
    marginBottom: 28,
  },
  modeCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  modeIcon: {
    fontSize: 30,
    marginRight: 14,
  },
  modeText: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 3,
  },
  modeDesc: {
    fontSize: 13,
    color: '#888',
  },
  modeArrow: {
    fontSize: 24,
    color: '#ccc',
    lineHeight: 28,
  },

  // ── Una página
  unaWrap: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 16,
  },
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  previewImg: {
    width: SCREEN_W - 72,
    height: (SCREEN_W - 72) * 1.37,
    borderRadius: 8,
    backgroundColor: '#e8e8e8',
  },

  // ── Varias páginas
  variasWrap: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 16,
  },
  thumbGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  thumbOuter: {
    width: THUMB_W,
    height: THUMB_H,
  },
  thumbImg: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 10,
    backgroundColor: '#e0e0e0',
  },
  thumbBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  thumbBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  thumbRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbRemoveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: Platform.OS === 'ios' ? 14 : 13,
  },

  // ── Input nombre
  inputCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  inputMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: '#aaa',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  inputField: {
    fontSize: 16,
    color: '#1a1a1a',
    paddingVertical: 0,
  },

  // ── Estado vacío
  emptyState: {
    alignItems: 'center',
    paddingVertical: 56,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyMsg: {
    fontSize: 15,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 4,
  },

  // ── Botones
  primaryBtn: {
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
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
  },
  secondaryBtnText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '600',
  },
  scanMoreBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#1a1a1a',
  },
  scanMoreText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '600',
  },
});
