import ExternalPrismAdminLogin from '../../auth/prism_admin/ExternalPrismAdminLogin.jsx'
import ExternalPrismRegister from '../../auth/prism_register/ExternalPrismRegister.jsx'

export default function PrismAuthApp({ mode = 'login' }) {
  return mode === 'register' ? <ExternalPrismRegister /> : <ExternalPrismAdminLogin />
}
