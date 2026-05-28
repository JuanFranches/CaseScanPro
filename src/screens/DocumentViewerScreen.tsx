import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import type { RootStackParamList } from '../../App';

type Documento = Database['public']['Tables']['documentos_expediente']['Row'];
type Props = NativeStackScreenProps<RootStackParamList, 'DocumentViewer'>;

const BUCKET        = 'documentos';
const SIGNED_EXPIRY = 3600; // 1 hora

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extrae el path de storage a partir de la URL pública de Supabase. */
function extractStoragePath(publicUrl: string): string {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return '';
  return decodeURIComponent(publicUrl.slice(idx + marker.length).split('?')[0]);
}

function esImagen(tipo: string): boolean {
  return tipo === 'Imagen';
}

function esPdf(tipo: string): boolean {
  return tipo.startsWith('PDF');
}

function iconoPorTipo(tipo: string): string {
  if (esImagen(tipo)) return '🖼';
  if (esPdf(tipo))    return '📄';
  return '📎';
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function DocumentViewerScreen({ route, navigation }: Props) {
  const { documentoId } = route.params;
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [doc, setDoc]                   = useState<Documento | null>(null);
  const [signedUrl, setSignedUrl]       = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [viewerLoading, setViewerLoading] = useState(true);
  const [deleting, setDeleting]         = useState(false);
  const [downloading, setDownloading]   = useState(false);

  // ── Carga inicial ──────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('documentos_expediente')
        .select('*')
        .eq('id', documentoId)
        .single();

      if (error || !data) {
        Alert.alert('Error', 'No se pudo cargar el documento');
        navigation.goBack();
        return;
      }

      setDoc(data);

      // Generar URL firmada (caduca en 1 hora)
      const path = extractStoragePath(data.archivo_url);
      if (path) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, SIGNED_EXPIRY);

        // Fallback a URL pública si falla la firma
        setSignedUrl(signErr || !signed?.signedUrl ? data.archivo_url : signed.signedUrl);
      } else {
        setSignedUrl(data.archivo_url);
      }

      setLoading(false);
    })();
  }, [documentoId, navigation]);

  // ── Acciones ───────────────────────────────────────────────────────────

  const handleDownload = async () => {
    if (!signedUrl) return;
    setDownloading(true);
    try {
      await WebBrowser.openBrowserAsync(signedUrl);
    } catch {
      Alert.alert('Error', 'No se pudo abrir el archivo en el navegador');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = () => {
    if (!doc) return;
    Alert.alert(
      'Eliminar documento',
      `¿Estás seguro de que querés eliminar "${doc.nombre}"?\nEsta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              // 1 – Borrar archivo de Storage
              const path = extractStoragePath(doc.archivo_url);
              if (path) {
                await supabase.storage.from(BUCKET).remove([path]);
              }

              // 2 – Borrar registro de la BD
              const { error } = await supabase
                .from('documentos_expediente')
                .delete()
                .eq('id', documentoId);

              if (error) {
                Alert.alert('Error', error.message);
                return;
              }

              navigation.goBack();
            } catch {
              Alert.alert('Error', 'No se pudo eliminar el documento');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  // ── Loading inicial ────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  if (!doc || !signedUrl) return null;

  // En Android los PDF se abren vía Google Docs Viewer embebido en WebView
  const pdfUri = Platform.OS === 'ios'
    ? signedUrl
    : `https://docs.google.com/viewer?url=${encodeURIComponent(signedUrl)}&embedded=true`;

  // Altura útil del visor (pantalla menos las dos barras)
  const viewerH = screenH - TOP_BAR_H - BOTTOM_BAR_H;

  // ── UI ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Barra superior ──────────────────────────────────────── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topBarSideBtn}
          onPress={() => navigation.goBack()}
          disabled={deleting}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>

        <View style={styles.topBarCenter}>
          <Text style={styles.docIcon}>{iconoPorTipo(doc.tipo)}</Text>
          <Text style={styles.docNombre} numberOfLines={1}>{doc.nombre}</Text>
          <Text style={styles.docTipo}>{doc.tipo}</Text>
        </View>

        <TouchableOpacity
          style={styles.topBarSideBtn}
          onPress={handleDelete}
          disabled={deleting}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {deleting
            ? <ActivityIndicator size="small" color="#ff3b30" />
            : <Text style={styles.deleteIcon}>🗑</Text>}
        </TouchableOpacity>
      </View>

      {/* ── Visor ───────────────────────────────────────────────── */}
      <View style={styles.viewer}>

        {esImagen(doc.tipo) ? (
          /* Imágenes: ScrollView con zoom por pellizco */
          <ScrollView
            style={styles.imageSv}
            contentContainerStyle={{ width: screenW, height: viewerH }}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image
              source={{ uri: signedUrl }}
              style={{ width: screenW, height: viewerH }}
              resizeMode="contain"
              onLoadStart={() => setViewerLoading(true)}
              onLoadEnd={() => setViewerLoading(false)}
            />
          </ScrollView>

        ) : esPdf(doc.tipo) ? (
          /* PDFs: WebView (nativo en iOS; Google Docs en Android) */
          <WebView
            source={{ uri: pdfUri }}
            style={styles.webViewer}
            scalesPageToFit
            javaScriptEnabled
            domStorageEnabled
            onLoadStart={() => setViewerLoading(true)}
            onLoadEnd={() => setViewerLoading(false)}
          />

        ) : (
          /* Tipo no previsualizable */
          <View style={styles.unsupportedWrap}>
            <Text style={styles.unsupportedEmoji}>📎</Text>
            <Text style={styles.unsupportedNombre}>{doc.nombre}</Text>
            <Text style={styles.unsupportedDesc}>
              Este tipo de archivo no se puede previsualizar directamente.{'\n'}
              Usá el botón de abajo para abrirlo en el navegador.
            </Text>
          </View>
        )}

        {/* Overlay de carga mientras el visor renderiza */}
        {viewerLoading && (esImagen(doc.tipo) || esPdf(doc.tipo)) && (
          <View style={styles.viewerLoader}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.viewerLoaderText}>Cargando...</Text>
          </View>
        )}

      </View>

      {/* ── Barra inferior: descargar ──────────────────────────── */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.downloadBtn, downloading && styles.downloadBtnBusy]}
          onPress={handleDownload}
          disabled={downloading}
          activeOpacity={0.8}
        >
          {downloading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.downloadBtnText}>↓  Abrir / Descargar</Text>}
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ── Constantes de layout ──────────────────────────────────────────────────────

const TOP_BAR_H    = Platform.OS === 'ios' ? 88 : 72;
const BOTTOM_BAR_H = Platform.OS === 'ios' ? 96 : 80;

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },

  // ── Barra superior
  topBar: {
    height: TOP_BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 20 : 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  topBarSideBtn: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  deleteIcon: {
    fontSize: 22,
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  docIcon: {
    fontSize: 18,
    marginBottom: 1,
  },
  docNombre: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  docTipo: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 1,
  },

  // ── Visor
  viewer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  imageSv: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  webViewer: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // Overlay de carga del visor
  viewerLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  viewerLoaderText: {
    color: '#888',
    fontSize: 14,
  },

  // Tipo no soportado
  unsupportedWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 36,
    gap: 14,
  },
  unsupportedEmoji: {
    fontSize: 56,
  },
  unsupportedNombre: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  unsupportedDesc: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 21,
  },

  // ── Barra inferior
  bottomBar: {
    height: BOTTOM_BAR_H,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  downloadBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  downloadBtnBusy: {
    backgroundColor: '#999',
  },
  downloadBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
