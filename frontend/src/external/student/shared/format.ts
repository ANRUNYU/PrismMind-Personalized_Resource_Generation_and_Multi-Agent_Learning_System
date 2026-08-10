export function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export function compactText(value?: string | null, defaultText = '暂未填写') {
  const text = String(value || '').trim()
  return text || defaultText
}

export function splitKeywords(value: string) {
  return value
    .split(/\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function difficultyText(value?: string | null) {
  const map: Record<string, string> = {
    easy: '基础',
    normal: '常规',
    medium: '中等',
    hard: '困难',
    mixed: '混合',
    advanced: '进阶'
  }
  return value ? map[value] || value : '-'
}

export function statusText(value?: string | null) {
  const map: Record<string, string> = {
    active: '进行中',
    archived: '已归档',
    completed: '已完成',
    generated: '已生成',
    in_progress: '作答中',
    submitted: '已提交',
    pending: '等待中',
    running: '运行中',
    success: '成功',
    failed: '失败',
    cancelled: '已取消',
    open: '待处理',
    ask: '直接提问',
    hint: '提示辅导',
    explain: '概念解释'
  }
  return value ? map[value] || value : '-'
}

export function resourceTypeText(value?: string | null) {
  const map: Record<string, string> = {
    concept_explanation: '概念讲解',
    case_study: '案例分析',
    practice_task: '练习任务',
    summary_notes: '总结笔记',
    quiz: '小测验',
    project_hint: '项目提示'
  }
  return value ? map[value] || value : '-'
}

export function assessmentTypeText(value?: string | null) {
  const map: Record<string, string> = {
    resource: '资源评估',
    path: '路径评估',
    topic: '主题评估',
    test: '测试评估',
    comprehensive: '综合评估'
  }
  return value ? map[value] || value : '-'
}
