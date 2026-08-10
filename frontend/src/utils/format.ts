export function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export function formatFileSize(value?: number | null) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

export const artifactTypeText: Record<string, string> = {
  training_plan: '培养方案',
  course_design: '课程设计',
  teaching_design: '教学设计',
  exercise: '练习题',
  paper: '试卷',
  project_practice: '项目实践'
}

export const resourceTypeText: Record<string, string> = {
  concept_explanation: '概念讲解',
  case_study: '案例分析',
  practice_task: '练习任务',
  summary_notes: '总结笔记',
  quiz: '小测验',
  project_hint: '项目提示'
}

export const difficultyText: Record<string, string> = {
  easy: '基础',
  normal: '常规',
  medium: '中等',
  hard: '困难',
  mixed: '混合',
  advanced: '进阶'
}

export const learningPathStatusText: Record<string, string> = {
  active: '进行中',
  completed: '已完成',
  archived: '已归档'
}

export const assessmentTypeText: Record<string, string> = {
  resource: '资源评估',
  path: '路径评估',
  topic: '主题评估',
  test: '测试评估',
  comprehensive: '综合评估'
}

export const testStatusText: Record<string, string> = {
  generated: '已生成',
  in_progress: '进行中',
  submitted: '已提交',
  cancelled: '已取消'
}

export const courseAssignmentTypeText: Record<string, string> = {
  quiz: '随堂测验',
  homework: '课程作业',
  exam: '阶段考试'
}

export const courseAssignmentStatusText: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  closed: '已关闭',
  archived: '已归档',
  not_started: '未开始',
  in_progress: '进行中',
  submitted: '已提交',
  graded: '已批改'
}

export const questionTypeText: Record<string, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  true_false: '判断题',
  short_answer: '简答题'
}

export const priorityText: Record<string, string> = {
  high: '高优先级',
  medium: '中优先级',
  low: '低优先级'
}

export const learningTopicText: Record<string, string> = {
  profile: '学习画像',
  'learning profile': '学习画像',
  rag: 'RAG 辅导',
  'rag tutoring': 'RAG 辅导',
  'async task monitoring': '异步任务监控',
  regularization: '正则化',
  overfitting: '过拟合',
  'gradient descent': '梯度下降',
  'learning rate': '学习率',
  function: '函数',
  'python functions': 'Python 函数',
  'ml basics': '机器学习基础',
  math: '数学基础',
  'model principles': '模型原理',
  resources: '学习资源',
  tests: '在线测试',
  assessments: '学习评估'
}

export const taskStatusText: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消'
}

export const taskTypeText: Record<string, string> = {
  teacher_training_plan: '培养方案生成',
  teacher_course_design: '课程设计生成',
  teacher_teaching_design: '教学设计生成',
  teacher_exercise: '练习题生成',
  teacher_paper: '试卷生成',
  teacher_project: '项目实践生成',
  knowledge_ingest: '知识库入库',
  document_parse: '文档解析',
  student_resource_generation: '学习资源生成',
  student_resource_single_generation: '单项学习资源生成',
  report_generation: '报告生成'
}

export function formatArtifactType(value?: string | null) {
  return value ? artifactTypeText[value] || value : '-'
}

export function formatResourceType(value?: string | null) {
  return value ? resourceTypeText[value] || value : '-'
}

export function formatDifficulty(value?: string | null) {
  return value ? difficultyText[value] || value : '-'
}

export function formatLearningPathStatus(value?: string | null) {
  return value ? learningPathStatusText[value] || value : '-'
}

export function formatAssessmentType(value?: string | null) {
  return value ? assessmentTypeText[value] || value : '-'
}

export function formatTestStatus(value?: string | null) {
  return value ? testStatusText[value] || value : '-'
}

export function formatCourseAssignmentType(value?: string | null) {
  return value ? courseAssignmentTypeText[value] || value : '-'
}

export function formatCourseAssignmentStatus(value?: string | null) {
  return value ? courseAssignmentStatusText[value] || value : '-'
}

export function formatQuestionType(value?: string | null) {
  return value ? questionTypeText[value] || value : '-'
}

export function formatPriority(value?: string | null) {
  return value ? priorityText[value] || value : '中优先级'
}

export function priorityTagType(value?: string | null) {
  if (value === 'high') return 'danger'
  if (value === 'low') return 'info'
  return 'warning'
}

export function formatLearningTopic(value?: string | null) {
  const text = String(value || '').trim()
  if (!text) return '当前学习任务'
  const lowered = text.toLowerCase()
  if (learningTopicText[lowered]) return learningTopicText[lowered]
  if (/^\d+$/.test(text)) return `知识点 ${text}`
  return text
}

export function localizeLearningText(value?: string | null) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (priorityText[text]) return priorityText[text]
  if (text.startsWith('Review ')) return `重点复习：${formatLearningTopic(text.replace(/^Review\s+/, ''))}`

  const weakTopicMatch = text.match(/^(.+?) appears in recent weak-topic evidence and should be reviewed first\.$/)
  if (weakTopicMatch) {
    return `系统检测到${formatLearningTopic(weakTopicMatch[1])}近期掌握情况较弱，建议优先复习。`
  }

  const actionMatch = text.match(/^Complete one focused explanation, one worked example, and one practice question for (.+?)\.$/)
  if (actionMatch) {
    return `建议围绕${formatLearningTopic(actionMatch[1])}完成一次针对性概念讲解、一道例题解析和两道同类巩固练习，并总结错因。`
  }

  const exactText: Record<string, string> = {
    'Recent assessment recorded this topic as incorrect or weak.': '近期测试或学习评估将该主题记录为薄弱点。',
    'Rebuild the prerequisite foundation': '夯实前置基础',
    'The current score is below 60, so direct advancement may be unstable.':
      '当前测试得分低于 60 分，说明基础掌握仍不稳定，暂不建议直接进入更高难度内容。',
    'Assessment score is below the passing threshold.': '评估得分低于及格阈值，需要先补齐基础。',
    'Review prerequisite concepts before starting a new topic.': '建议先复习相关前置概念，再进入新知识点学习。',
    'No urgent weak topic was detected.': '近期没有检测到必须立即处理的薄弱主题。',
    'Recent assessment data is stable.': '近期评估数据整体较稳定。',
    'Continue with the next resource or path step and run a short self-test afterwards.':
      '继续推进下一项学习资源或路径步骤，并在完成后进行一次简短自测。',
    'Create a learning profile first': '先完善学习画像',
    'No assessment or profile data is available yet.': '当前还没有学习画像或评估记录。',
    'Personalized recommendations need at least a profile or assessment record.':
      '个性化建议至少需要一份学习画像或一次评估结果作为依据。',
    'Complete the learning profile form before generating further recommendations.':
      '请先完成学习画像表单，再生成后续学习建议。',
    'Great result. Continue with higher-difficulty practice and explain your reasoning in your own words.':
      '本次表现较好，可以尝试更高难度练习，并用自己的话复述关键概念和解题思路。',
    'Correct.': '回答正确。',
    'This answer comes from the question bank.': '该解析来自题库。'
  }
  if (exactText[text]) return exactText[text]

  if (text.startsWith('Foundation is acceptable. Review ')) {
    const topics = text.replace(/^Foundation is acceptable\. Review\s+/, '').replace(/\s+and complete one focused exercise\.$/, '')
    return `基础掌握基本稳定，建议重点复习${topics
      .split(',')
      .map((item) => formatLearningTopic(item.trim()))
      .join('、')}，并完成一道针对性巩固练习。`
  }

  if (text.startsWith('More review is needed. Revisit ')) {
    const topics = text.replace(/^More review is needed\. Revisit\s+/, '').replace(/\s+before moving to the next learning path step\.$/, '')
    return `仍需加强复习，建议先回顾${topics
      .split(',')
      .map((item) => formatLearningTopic(item.trim()))
      .join('、')}，再推进下一步学习路径。`
  }

  return text
}

export function formatTaskStatus(value?: string | null) {
  return value ? taskStatusText[value] || value : '-'
}

export function formatTaskType(value?: string | null) {
  return value ? taskTypeText[value] || value : '-'
}

export function formatBooleanStatus(value?: boolean | null, truthy = 'Yes', falsy = 'No') {
  if (value === null || value === undefined) return '-'
  return value ? truthy : falsy
}
