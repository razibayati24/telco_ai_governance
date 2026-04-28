import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { fetchAppConfig } from './hooks/useAppConfig';

// Kick off config fetch ASAP so the page title and brand strings update on
// the first paint instead of waiting for a render cycle.
fetchAppConfig();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
