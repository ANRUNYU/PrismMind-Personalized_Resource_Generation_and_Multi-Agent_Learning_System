import React from 'react'
import { createRoot, type Root } from 'react-dom/client'

import ExternalPrismAdminLogin from '../auth/prism_admin/ExternalPrismAdminLogin.jsx'
import ExternalPrismLoading from '../auth/loading/ExternalPrismLoading.jsx'
import ExternalPrismRegister from '../auth/prism_register/ExternalPrismRegister.jsx'
import ExternalAdminDashboard from './admin/ExternalAdminDashboard.jsx'
import ExternalAdminUsers from './admin/ExternalAdminUsers.jsx'

type ExternalPage = 'login' | 'register' | 'loading' | 'admin-dashboard' | 'admin-users'

export function mountPrismExternalPage(container: HTMLElement, page: ExternalPage) {
  let root: Root | null = createRoot(container)

  const elementMap: Record<ExternalPage, React.ReactElement> = {
    login: <ExternalPrismAdminLogin />,
    register: <ExternalPrismRegister />,
    loading: <ExternalPrismLoading />,
    'admin-dashboard': <ExternalAdminDashboard />,
    'admin-users': <ExternalAdminUsers />
  }

  root.render(elementMap[page])

  return () => {
    root?.unmount()
    root = null
  }
}
