import type { TrainingPhase } from './StepIndicator'
import type { TrainingSkill } from './trainingProgramApi'

export default function SkillsDisplayPanel({ skills, phase }: { skills: TrainingSkill[]; phase: TrainingPhase }) {
  const groupedSkills = groupByCategory(skills)
  const isLoading = phase === 'extracting'

  return (
    <section className="training-result-panel hud-panel" aria-label="提取的核心技能" data-testid="external-teacher-training-skills">
      <header className="training-result-header">
        <div>
          <span className="training-result-title">提取的核心技能</span>
          <span className="training-result-subtitle">两阶段流程第一步：从材料和关注点提炼能力结构</span>
        </div>
        <span className={`training-result-signal${skills.length ? ' is-ready' : ''}${isLoading ? ' is-loading' : ''}`} />
      </header>

      <div className="training-result-scroll">
        {isLoading ? (
          <EmptyState title="正在解析材料与关注点" description="系统正在建立技能画像，请稍候。" loading />
        ) : null}

        {!isLoading && skills.length === 0 ? (
          <EmptyState title="等待技能提取" description="填写培养方案基本信息后即可生成；文件、知识库和关注点均为可选。" />
        ) : null}

        {!isLoading && groupedSkills.length
          ? groupedSkills.map(([category, items], groupIndex) => (
              <article className="training-skill-group" key={category} style={{ animationDelay: `${groupIndex * 70}ms` }}>
                <div className="training-skill-group-title">
                  <span>{category}</span>
                  <em>{items.length} 项技能</em>
                </div>
                <div className="training-skill-list">
                  {items.map((skill, index) => (
                    <div className="training-skill-chip" key={`${skill.name}-${index}`} style={{ animationDelay: `${index * 42}ms` }}>
                      <span className="training-skill-dot" aria-hidden="true" />
                      <strong>{skill.name}</strong>
                      {skill.weight ? <em>{skill.weight}</em> : null}
                      <small>{skill.description}</small>
                      {skill.weight ? (
                        <span className="training-skill-meter" aria-hidden="true">
                          <i style={{ width: skill.weight }} />
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            ))
          : null}
      </div>
    </section>
  )
}

function EmptyState({ title, description, loading = false }: { title: string; description: string; loading?: boolean }) {
  return (
    <div className={`training-empty-state${loading ? ' is-loading' : ''}`}>
      <span className="training-empty-orbit" aria-hidden="true" />
      <strong>{title}</strong>
      <small>{description}</small>
    </div>
  )
}

function groupByCategory(skills: TrainingSkill[]) {
  const groups = new Map<string, TrainingSkill[]>()
  skills.forEach((skill) => {
    const category = skill.category || '核心能力'
    groups.set(category, [...(groups.get(category) || []), skill])
  })
  return Array.from(groups.entries())
}
