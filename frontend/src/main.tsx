import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import DashboardPreviewPage from './components/DashboardPreviewPage'
import { isDashboardPreviewRoute } from './components/dashboardPreview'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  isDashboardPreviewRoute() ? <DashboardPreviewPage /> : <App />
)
