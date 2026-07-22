import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import DashboardPreviewPage from './components/DashboardPreviewPage'
import { isDashboardPreviewRoute } from './components/dashboardPreview'
import './index.css'

// 拦截并隐藏 Three.js (r164+) 和 R3F 不兼容产生的烦人废弃警告
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  if (typeof args[0] === 'string' && (args[0].includes('THREE.Clock:') || args[0].includes('THREE.WebGLShadowMap:'))) {
    return;
  }
  originalWarn.apply(console, args);
};
ReactDOM.createRoot(document.getElementById('root')!).render(
  isDashboardPreviewRoute() ? <DashboardPreviewPage /> : <App />
)
