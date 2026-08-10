import { useEffect, useMemo, useState } from 'react'
import { getStoredUser, getUsers, updateUserStatus } from '../shared/api'

const roleLabels = {
  teacher: '教师',
  student: '学生',
  admin: '管理员'
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-CN', { hour12: false })
}

export default function ExternalAdminUsers() {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [notice, setNotice] = useState('正在加载用户列表...')
  const currentUser = getStoredUser()
  const pageSize = 20

  async function loadUsers(nextPage = page) {
    setLoading(true)
    try {
      const data = await getUsers({ page: nextPage, page_size: pageSize })
      setUsers(data.items)
      setTotal(data.total)
      setPage(data.page)
      setNotice('用户列表已从 /api/v1/users 加载。')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '用户列表加载失败。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredUsers = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    if (!query) return users
    return users.filter((user) => {
      return user.username.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)
    })
  }, [keyword, users])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  async function toggleUser(user) {
    if (currentUser?.id === user.id) {
      setNotice('不能禁用当前登录用户。')
      return
    }
    const nextActive = !user.is_active
    const confirmed = window.confirm(`确认${nextActive ? '启用' : '禁用'}用户 ${user.username}？`)
    if (!confirmed) return

    setUpdatingId(user.id)
    try {
      const updated = await updateUserStatus(user.id, nextActive)
      setUsers((current) => current.map((item) => (item.id === user.id ? updated : item)))
      setNotice(`用户 ${user.username} 已${nextActive ? '启用' : '禁用'}。`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '用户状态更新失败。')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <main className="prism-my-exams external-admin-users" data-testid="external-admin-users">
      <section className="my-exams-hero" aria-labelledby="external-users-title">
        <div className="my-exams-title-block">
          <span className="my-exams-kicker">账号权限</span>
          <h1 id="external-users-title">用户管理</h1>
        </div>

        <div className="my-exams-toolbar">
          <label className="sr-only" htmlFor="external-user-keyword">
            按用户名或邮箱筛选
          </label>
          <input
            id="external-user-keyword"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="按用户名或邮箱筛选"
          />
          <button className="add-exam-trigger" type="button" disabled={loading} onClick={() => loadUsers(page)}>
            {loading ? '加载中' : '刷新列表'}
          </button>
        </div>
      </section>

      <section className="exam-stack-shell external-users-shell">
        <article className="exam-card external-users-card" data-active="true" data-status="published">
          <div className="exam-card-prism" aria-hidden="true" />
          <div className="exam-card-content external-users-card-content">
            <div className="exam-card-topline">
              <span>真实用户接口</span>
              <strong>{total} 条</strong>
            </div>
            <h2>平台用户列表</h2>

            <div className="external-users-table-wrap">
              <table className="external-users-table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>用户名</th>
                    <th>邮箱</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user, index) => {
                    const isCurrent = currentUser?.id === user.id
                    return (
                      <tr key={user.id}>
                        <td>{(page - 1) * pageSize + index + 1}</td>
                        <td>{user.username}</td>
                        <td>{user.email}</td>
                        <td>{roleLabels[user.role] || user.role}</td>
                        <td>
                          <span className={`external-status-pill ${user.is_active ? 'is-active' : 'is-disabled'}`}>
                            {user.is_active ? '启用' : '禁用'}
                          </span>
                        </td>
                        <td>{formatDate(user.created_at)}</td>
                        <td>
                          <button
                            className="external-table-action"
                            type="button"
                            disabled={isCurrent || updatingId === user.id}
                            onClick={() => toggleUser(user)}
                          >
                            {user.is_active ? '禁用' : '启用'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {!filteredUsers.length ? <p className="external-empty-text">当前页没有符合条件的用户。</p> : null}

            <div className="external-users-pagination">
              <button type="button" disabled={page <= 1 || loading} onClick={() => loadUsers(page - 1)}>
                上一页
              </button>
              <span>
                第 {page} / {totalPages} 页
              </span>
              <button type="button" disabled={page >= totalPages || loading} onClick={() => loadUsers(page + 1)}>
                下一页
              </button>
            </div>
          </div>
        </article>
      </section>

      <div className="my-exams-toast">{notice}</div>
    </main>
  )
}
