import RegisterPanel from './RegisterPanel.jsx'

export default function RegisterView({ onBackToLogin, onTransitionChange }) {
  const steps = [
    {
      title: '选择身份',
      body: '教师或学生使用不同的功能入口。'
    },
    {
      title: '完善账号',
      body: '保存基础登录信息，保护个人空间。'
    },
    {
      title: '进入工作台',
      body: '按需使用课程、资源与测评工具。'
    }
  ]

  return (
    <div className="register-layout">
      <section className="register-copy" aria-label="PrismMind register introduction">
        <div className="register-brand">
          <p className="eyebrow">棱镜智教</p>
          <p className="brand-mark">PrismMind</p>
        </div>

        <h1 className="register-title">
          <span className="title-line-a">建立你的</span>
          <span className="title-line-b">教学/学习空间</span>
        </h1>

        <ol className="register-steps" aria-label="注册步骤">
          {steps.map((step, index) => (
            <li className="register-step" key={step.title}>
              <span>{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="register-panel-zone">
        <RegisterPanel onBackToLogin={onBackToLogin} onTransitionChange={onTransitionChange} />
      </div>
    </div>
  )
}
