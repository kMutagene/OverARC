import React from 'react';
import ReactDOM from 'react-dom/client';
import '@picocss/pico/css/pico.min.css';
import '@react-sigma/core/lib/style.css';
import './styles.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
