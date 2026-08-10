import { useEffect, useMemo, useState } from 'react'
import { getLLMStatus, getUsers } from '../shared/api'
import { ExternalCardStack, ExternalDetailPanel } from './ExternalCardStack.jsx'

function formatModelStatus(status) {
  if (!status) return '读取中'
  if (!status.configured) return '未配置'
  return status.real_provider_enabled ? '真实模型' : '本地演示模式'
}

export default function ExternalAdminDashboard() {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [modelStatus, setModelStatus] = useState(null)
  const [selected, setSelected] = useState(null)
  const [notice, setNotice] = useState('正在加载系统数据...')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [userPage, llm] = await Promise.all([
          getUsers({ page: 1, page_size: 1000 }),
          getLLMStatus()
        ])
        if (cancelled) return
        setUsers(userPage.items)
        setTotal(userPage.total)
        setModelStatus(llm)
        setNotice('系统数据已同步。')
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : '加载失败，请稍后重试。')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const cards = useMemo(() => {
    const active = users.filter((user) => user.is_active).length
    const disabled = users.filter((user) => !user.is_active).length
    const teacher = users.filter((user) => user.role === 'teacher').length
    const student = users.filter((user) => user.role === 'student').length
    const admin = users.filter((user) => user.role === 'admin').length
    const modelText = formatModelStatus(modelStatus)

    return [
      {
        id: 'admin-users-overview',
        course: '用户结构',
        status: '正常',
        title: '平台用户总览',
        metrics: [
          { label: '用户总数', value: total },
          { label: '启用用户', value: active },
          { label: '禁用用户', value: disabled }
        ],
        content: '用于确认演示环境账号与权限状态。',
        answer: `教师 ${teacher} 人，学生 ${student} 人，管理员 ${admin} 人。`,
        explanation: '如需处理账号权限，请进入用户管理页面。',
        updatedAt: '实时接口'
      },
      {
        id: 'admin-role-overview',
        course: '角色分布',
        status: '正常',
        title: '教师/学生/管理员比例',
        metrics: [
          { label: '教师', value: teacher },
          { label: '学生', value: student },
          { label: '管理员', value: admin }
        ],
        content: '角色统计使用当前用户列表实时聚合。',
        answer: '当前系统仍由 Vue Router guard 控制 teacher、student、admin 权限边界。',
        explanation: '非 admin 访问用户管理页仍会被拦截。',
        updatedAt: '实时接口'
      },
      {
        id: 'admin-model-overview',
        course: '模型与服务',
        status: modelText,
        title: 'LLM 服务状态',
        metrics: [
          { label: 'Provider', value: modelStatus?.provider || '-' },
          { label: '模型', value: modelStatus?.model || '-' },
          { label: '状态', value: modelText }
        ],
        content: '展示当前模型配置状态。',
        answer: modelStatus?.message || '模型状态正在读取。',
        explanation: modelStatus ? '模型服务配置已读取。' : '模型服务配置待检查。',
        updatedAt: '实时接口'
      }
    ]
  }, [modelStatus, total, users])

  return (
    <main className="prism-my-exams external-admin-dashboard" data-testid="external-admin-dashboard">
      <section className="my-exams-hero" aria-labelledby="external-admin-title">
        <div className="my-exams-title-block">
          <span className="my-exams-kicker">后台控制台</span>
          <h1 id="external-admin-title">系统运行概览</h1>
        </div>

        <div className="my-exams-toolbar external-admin-toolbar">
          <button className="add-exam-trigger" type="button" onClick={() => window.location.assign('/admin/users')}>
            用户管理
          </button>
          <button type="button" onClick={() => window.location.assign('/teacher/dashboard')}>
            教师工作台
          </button>
          <button type="button" onClick={() => window.location.assign('/student/dashboard')}>
            学生工作台
          </button>
        </div>
      </section>

      <ExternalCardStack
        items={cards}
        emptyTitle="暂无后台数据"
        emptyAction="刷新数据"
        onOpenItem={setSelected}
        onEmptyAction={() => window.location.reload()}
      />

      <ExternalDetailPanel item={selected} loading={false} onClose={() => setSelected(null)} />
      <div className="my-exams-toast">{notice}</div>
    </main>
  )
}
