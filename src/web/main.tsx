import React from 'react';
import ReactDOM from 'react-dom/client';
import '@picocss/pico/css/pico.min.css';
import '@react-sigma/core/lib/style.css';
import './styles/index.css';
import App from './app/App';

// Mount the single-page workbench under StrictMode so development catches unsafe React effects.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
