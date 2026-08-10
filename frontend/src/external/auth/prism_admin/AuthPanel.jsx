import { useState } from 'react'

import { login, loginTargetFor, persistSession } from './loginAdapter.js'

const roleOptions = [
  { value: 'student', label: '学生' },
  { value: 'teacher', label: '教师' }
]

export default function AuthPanel({ onCreateAccount = () => {}, onTransitionChange = () => {} }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')
  const [status, setStatus] = useState('准备进入 PrismMind')
  const [hasError, setHasError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()

    const payload = {
      username: username.trim(),
      password,
      role
    }

    if (!payload.username || !payload.password.trim()) {
      setHasError(true)
      setStatus('请先填写用户名和密码。')
      return
    }

    setIsSubmitting(true)
    setHasError(false)
    setStatus('正在验证登录信息...')
    onTransitionChange(true)
    const transitionStartedAt = performance.now()

    try {
      const data = await login(payload)
      persistSession(data)
      setStatus('登录成功，正在进入工作台...')
      window.setTimeout(() => {
        window.location.assign(loginTargetFor(data.user?.role || role))
      }, 420)
    } catch (error) {
      setHasError(true)
      setStatus(error instanceof Error ? error.message : '登录失败，请稍后重试。')
    } finally {
      const elapsed = performance.now() - transitionStartedAt
      const remaining = Math.max(0, 650 - elapsed)
      window.setTimeout(() => {
        setIsSubmitting(false)
        onTransitionChange(false)
      }, remaining)
    }
  }

  return (
    <div className="auth-panel-shell" data-testid="external-login-panel">
      <div className="auth-panel-effects" aria-hidden="true">
        <div className="prism-glass-bg" />
        <div className="prism-edge prism-edge-a" />
        <div className="prism-edge prism-edge-b" />
        <div className="prism-facet prism-facet-a" />
        <div className="prism-facet prism-facet-b" />
      </div>

      <div className="auth-panel-content" aria-label="PrismMind login panel">
        <div className="auth-panel-header">
          <p className="panel-kicker">Workspace Access</p>
          <h2>欢迎回来</h2>
          <p>登录后继续管理课程、资源与学习进度。</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label className="field-group" htmlFor="external-login-username">
            <span>用户名</span>
            <input
              id="external-login-username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="输入用户名"
            />
          </label>

          <label className="field-group" htmlFor="external-login-password">
            <span>密码</span>
            <input
              id="external-login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入密码"
            />
          </label>

          <fieldset className="role-field">
            <legend>登录身份</legend>
            <div className="role-options">
              {roleOptions.map((option) => (
                <label
                  className={`role-option ${role === option.value ? 'is-active' : ''}`}
                  key={option.value}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option.value}
                    checked={role === option.value}
                    onChange={() => setRole(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button className="primary-auth-button" type="submit" disabled={isSubmitting}>
            进入平台
          </button>

          <button
            className="secondary-auth-button"
            type="button"
            disabled={isSubmitting}
            onClick={onCreateAccount}
          >
            创建账号
          </button>

          <p className={`auth-status ${hasError ? 'is-error' : ''}`} role="status">
            {status}
          </p>
        </form>
      </div>
    </div>
  )
}
