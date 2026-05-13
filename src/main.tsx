import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { BrowserRouter } from 'react-router-dom';
import './index.css';

registerSW({ immediate: true });

const baseUrl = import.meta.env.BASE_URL || '/';
const routerBasename = baseUrl === '/' ? '/' : baseUrl.replace(/\/$/, '');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
