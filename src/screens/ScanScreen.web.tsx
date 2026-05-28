import { View } from 'react-native';
// Stub para web: el escaneo nativo no está disponible en browser.
// App.tsx no registra esta ruta en web, por lo que este componente
// nunca se renderiza. Existe sólo para que Metro no procese los
// imports nativos de ScanScreen.tsx durante el bundle web.
export default function ScanScreen(): null {
  return null;
}
