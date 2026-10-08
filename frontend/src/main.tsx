import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminApp from './admin/AdminApp';
import { schoolSlugFromHost } from './services/school';
import { takeSupportToken } from './services/session';
import './index.css';

takeSupportToken();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {schoolSlugFromHost() === 'admin' ? <AdminApp /> : <App />}
  </React.StrictMode>,
);
