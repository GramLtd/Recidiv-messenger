import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App.jsx';
import { applyTheme, loadTheme } from './theme.js';
import './styles.css';

applyTheme(loadTheme());

const manifestUrl = import.meta.env.VITE_TONCONNECT_MANIFEST || `${location.origin}/tonconnect-manifest.json`;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </TonConnectUIProvider>
  </React.StrictMode>,
);
