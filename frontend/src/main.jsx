import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/app.css';
import './styles/pro.css';
import './styles/print.css';
import './styles/extras.css';
import { applyDisplay } from './lib/display.js';

applyDisplay();   // row spacing, accent colour and contrast saved on this device

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
