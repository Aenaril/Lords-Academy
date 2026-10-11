import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AdminProvider } from './admin/AdminContext'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminProvider>
      <App />
    </AdminProvider>
  </React.StrictMode>,
)
