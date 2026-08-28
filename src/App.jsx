import { HashRouter, Routes, Route } from 'react-router-dom';
import ActivationScreen from './screens/ActivationScreen';
import ChatScreen from './screens/ChatScreen';
import MathScreen from './screens/MathScreen';
import ParentDashboard from './screens/ParentDashboard';
import OnlinePreviewBanner from './components/OnlinePreviewBanner';

/**
 * 4 pantallas. Ni una más (regla no negociable).
 *
 * HashRouter en vez de BrowserRouter: la app tiene que poder abrirse desde el
 * sistema de archivos o desde un hosting estático sin configurar rewrites.
 * En un despliegue offline no hay servidor que resuelva rutas.
 */
export default function App() {
  return (
    <HashRouter>
      <OnlinePreviewBanner />
      <Routes>
        <Route path="/"      element={<ActivationScreen />} />
        <Route path="/chat"  element={<ChatScreen />} />
        <Route path="/math"  element={<MathScreen />} />
        <Route path="/padre" element={<ParentDashboard />} />
      </Routes>
    </HashRouter>
  );
}
