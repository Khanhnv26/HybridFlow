import React from 'react';
import { createRoot } from 'react-dom/client';
import { LandingPage } from './pages/LandingPage';
import './index.css';
import { BootstrapPreloader } from './components/Preloader';

createRoot(document.getElementById('root')!).render(
  <><BootstrapPreloader /><React.StrictMode>
    <LandingPage />
  </React.StrictMode></>
);
