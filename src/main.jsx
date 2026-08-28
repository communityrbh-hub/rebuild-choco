import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Service worker: es lo que hace que "funciona sin internet" sea literal y no
// dependa de que haya un servidor corriendo. Solo en producción, para no
// interferir con el hot reload durante el desarrollo.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => { /* si falla, la app sigue funcionando con red */ });
  });
}
