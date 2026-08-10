import { useState } from 'react'

import { register } from './registerAdapter.js'

const roleOptions = [
  { value: 'student', label: '学生' },
  { value: 'teacher', label: '教师' }
]

export default function RegisterPanel({ onBackToLogin = () => {}, onTransitionChange = () => {} }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('准备创建 PrismMind 账号')

  async function submit(event) {
    event.preventDefault()

    const payload = {
      username: username.trim(),
      email: email.trim(),
      password,
      role
    }

    if (!payload.username || !payload.email || !payload.password.trim()) {
      setError('请完整填写用户名、邮箱和密码。')
      setMessage('')
      return
    }

    if (payload.role !== 'student' && payload.role !== 'teacher') {
      setError('请选择正确的账号身份。')
      setMessage('')
      return
    }

    setLoading(true)
    setError('')
    setMessage('正在创建账号...')
    onTransitionChange(true)
    const transitionStartedAt = performance.now()

    try {
      await register(payload)
      setMessage('注册成功，正在返回登录页...')
      window.setTimeout(() => onBackToLogin(), 560)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '注册失败，请稍后重试。')
      setMessage('')
    } finally {
      const elapsed = performance.now() - transitionStartedAt
      const remaining = Math.max(0, 650 - elapsed)
      window.setTimeout(() => {
        setLoading(false)
        onTransitionChange(false)
      }, remaining)
    }
  }

  return (
    <div className="auth-panel-shell register-shell" data-testid="external-register-panel">
      <div className="prism-glass-bg" aria-hidden="true" />
      <div className="prism-facet prism-facet-a" aria-hidden="true" />
      <div className="prism-facet prism-facet-b" aria-hidden="true" />
      <div className="prism-edge prism-edge-a" aria-hidden="true" />
      <div className="prism-edge prism-edge-b" aria-hidden="true" />

      <form className="auth-panel-content register-panel" aria-label="PrismMind register panel" onSubmit={submit}>
        <div className="auth-panel-header">
          <p className="panel-kicker">Prism Account</p>
          <h2>创建账号</h2>
          <p>加入 PrismMind，开始组织你的教学与学习节奏。</p>
        </div>

        <div className="auth-form register-form">
          <label className="field-group" htmlFor="external-register-username">
            <span>用户名</span>
            <input
              id="external-register-username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="输入用户名"
            />
          </label>

          <label className="field-group" htmlFor="external-register-email">
            <span>邮箱</span>
            <input
              id="external-register-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="输入邮箱"
            />
          </label>

          <label className="field-group" htmlFor="external-register-password">
            <span>密码</span>
            <input
              id="external-register-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入密码"
            />
          </label>

          <fieldset className="role-field">
            <legend>账号身份</legend>
            <div className="role-options">
              {roleOptions.map((option) => (
                <label
                  className={`role-option ${role === option.value ? 'is-active' : ''}`}
                  key={option.value}
                >
                  <input
                    type="radio"
                    name="register-role"
                    value={option.value}
                    checked={role === option.value}
                    onChange={() => setRole(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button className="primary-auth-button" type="submit" disabled={loading}>
            完成注册
          </button>

          <p className={`auth-status ${error ? 'is-error' : ''}`} role="status">
            {error || message}
          </p>

          <p className="auth-switch">
            已有账号？
            <button type="button" onClick={onBackToLogin}>
              返回登录
            </button>
          </p>
        </div>
      </form>
    </div>
  )
}
