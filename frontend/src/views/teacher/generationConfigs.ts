import {
  generateExercises,
  generateExercisesAsync,
  generatePaper,
  generatePaperAsync,
  generateProject,
  generateProjectAsync,
  generateTeachingDesign,
  generateTeachingDesignAsync,
  generateTrainingPlan,
  generateTrainingPlanAsync,
  type TeacherGenerationPayload,
  type TeacherGenerationResponse
} from '@/api/teacher'
import type { TaskCreateResponse } from '@/types/task'

export type GenerationKind =
  | 'training-plan'
  | 'teaching-design'
  | 'exercise'
  | 'paper'
  | 'project'

export type FieldType = 'input' | 'textarea' | 'number' | 'multiline' | 'select'

export interface FieldConfig {
  key: string
  label: string
  type: FieldType
  required?: boolean
  min?: number
  max?: number
  rows?: number
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  defaultValue?: string | number | null
}

export interface GenerationConfig {
  kind: GenerationKind
  title: string
  description: string
  fields: FieldConfig[]
  submit: (payload: TeacherGenerationPayload) => Promise<TeacherGenerationResponse>
  submitAsync: (payload: TeacherGenerationPayload) => Promise<TaskCreateResponse>
}

export type GenerationFormValue = string | number | null

export const generationConfigs: Record<GenerationKind, GenerationConfig> = {
  'training-plan': {
    kind: 'training-plan',
    title: '培养方案生成',
    description: '生成包含培养目标、毕业要求、课程体系和实践体系的结构化培养方案。',
    submit: generateTrainingPlan,
    submitAsync: generateTrainingPlanAsync,
    fields: [
      { key: 'program_name', label: '方案名称', type: 'input', required: true, placeholder: '人工智能人才培养方案' },
      { key: 'education_level', label: '培养层次', type: 'input', required: true, placeholder: '本科' },
      { key: 'major_name', label: '专业名称', type: 'input', required: true, placeholder: '计算机科学与技术' },
      { key: 'training_objectives', label: '培养目标', type: 'textarea', rows: 4, required: true },
      { key: 'graduation_requirements', label: '毕业要求', type: 'textarea', rows: 3 },
      { key: 'core_courses', label: '核心课程', type: 'multiline', placeholder: '每行一门课程' },
      { key: 'industry_requirements', label: '行业需求', type: 'textarea', rows: 3 },
      { key: 'additional_requirements', label: '补充要求', type: 'textarea', rows: 3 }
    ]
  },
  'teaching-design': {
    kind: 'teaching-design',
    title: '教学设计生成',
    description: '生成一次课或教学活动的学情分析、目标、流程、活动和评价设计。',
    submit: generateTeachingDesign,
    submitAsync: generateTeachingDesignAsync,
    fields: [
      { key: 'course_name', label: '课程名称', type: 'input', required: true },
      { key: 'lesson_topic', label: '课次主题', type: 'input', required: true },
      { key: 'target_students', label: '授课对象', type: 'input', required: true },
      { key: 'teaching_objectives', label: '教学目标', type: 'textarea', rows: 4, required: true },
      { key: 'key_points', label: '教学重点', type: 'textarea', rows: 3 },
      { key: 'difficult_points', label: '教学难点', type: 'textarea', rows: 3 },
      { key: 'teaching_hours', label: '教学学时', type: 'number', min: 1, max: 16, defaultValue: 2 },
      { key: 'teaching_methods', label: '教学方法', type: 'multiline', placeholder: '案例教学\n小组讨论\n项目实践' },
      { key: 'additional_requirements', label: '补充要求', type: 'textarea', rows: 3 }
    ]
  },
  exercise: {
    kind: 'exercise',
    title: '练习题批量生成',
    description: '围绕知识点、难度和题型生成结构化练习题。',
    submit: generateExercises,
    submitAsync: generateExercisesAsync,
    fields: [
      { key: 'course_name', label: '课程名称', type: 'input', required: true },
      { key: 'knowledge_points', label: '知识点', type: 'multiline', required: true, placeholder: '每行一个知识点' },
      {
        key: 'difficulty',
        label: '难度',
        type: 'select',
        required: true,
        defaultValue: 'normal',
        options: [
          { label: '基础', value: 'easy' },
          { label: '常规', value: 'normal' },
          { label: '困难', value: 'hard' }
        ]
      },
      { key: 'question_types', label: '题型', type: 'multiline', required: true, placeholder: '选择题\n简答题\n应用题' },
      { key: 'question_count', label: '题目数量', type: 'number', required: true, min: 1, max: 100, defaultValue: 10 },
      { key: 'reference_text', label: '参考文本', type: 'textarea', rows: 4 },
      { key: 'additional_requirements', label: '补充要求', type: 'textarea', rows: 3 }
    ]
  },
  paper: {
    kind: 'paper',
    title: '试卷生成',
    description: '生成包含范围、题型分布、分值、时长、答案和评分标准的完整试卷。',
    submit: generatePaper,
    submitAsync: generatePaperAsync,
    fields: [
      { key: 'course_name', label: '课程名称', type: 'input', required: true },
      { key: 'exam_scope', label: '考试范围', type: 'textarea', rows: 4, required: true },
      { key: 'total_score', label: '总分', type: 'number', required: true, min: 1, max: 300, defaultValue: 100 },
      { key: 'duration_minutes', label: '考试时长（分钟）', type: 'number', required: true, min: 10, max: 300, defaultValue: 120 },
      { key: 'question_distribution', label: '题型分布', type: 'textarea', rows: 3, required: true },
      { key: 'difficulty_ratio', label: '难度比例', type: 'textarea', rows: 3, required: true },
      { key: 'additional_requirements', label: '补充要求', type: 'textarea', rows: 3 }
    ]
  },
  project: {
    kind: 'project',
    title: '项目实践生成',
    description: '设计包含目标、任务、协作方式、交付物和评价标准的项目制实践方案。',
    submit: generateProject,
    submitAsync: generateProjectAsync,
    fields: [
      { key: 'course_name', label: '课程名称', type: 'input', required: true },
      { key: 'target_students', label: '授课对象', type: 'input', required: true },
      { key: 'project_topic', label: '项目主题', type: 'input', required: true },
      { key: 'expected_skills', label: '预期技能', type: 'multiline', required: true, placeholder: '每行一个技能' },
      { key: 'project_duration', label: '项目周期', type: 'input', required: true, placeholder: '2 周' },
      { key: 'team_size', label: '团队规模', type: 'input', placeholder: '3-5 人' },
      { key: 'deliverables', label: '交付物', type: 'multiline', placeholder: '报告\n演示\n代码仓库' },
      { key: 'evaluation_criteria', label: '评价标准', type: 'textarea', rows: 3 },
      { key: 'additional_requirements', label: '补充要求', type: 'textarea', rows: 3 }
    ]
  }
}

export function createInitialForm(config: GenerationConfig): Record<string, GenerationFormValue> {
  return config.fields.reduce<Record<string, GenerationFormValue>>((form, field) => {
    if (field.defaultValue !== undefined) {
      form[field.key] = field.defaultValue
    } else if (field.type === 'number') {
      form[field.key] = null
    } else {
      form[field.key] = ''
    }
    return form
  }, {})
}

export function multilineToArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean)
  if (typeof value !== 'string') return []
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}
