# 棱镜智教-PrismMind 答辩展示提纲

棱镜智教-PrismMind：基于大模型的个性化资源生成与学习多智能体系统。

## 1. 项目背景

高等教育课程建设正在从“统一内容供给”转向“面向学生差异的个性化学习支持”。教师需要快速生成教学资源，学生需要围绕课程资料获得可解释的辅导、测试和反馈，管理者也需要看到学习过程数据与系统运行状态。

## 2. 痛点分析

- 教师备课、出题、作业发布和学习反馈工作量大。
- 学生学习资料分散，问题解答缺少课程上下文。
- 传统测试只给分数，难以形成可追踪的诊断建议。
- 大模型生成内容需要知识库引用、质量分析和异步任务管理支撑，才能进入稳定演示与交付。

## 3. 系统架构

- 后端：FastAPI + SQLAlchemy 2.0 + Alembic
- 数据库：PostgreSQL
- 缓存与任务队列：Redis + Celery
- 知识库：Chroma
- 前端：Vue3 + Vite + TypeScript + Element Plus
- 部署：Docker Compose
- 主接口前缀：`/api/v1`

## 4. 核心功能

- 教师端：我的课程、课程成员、课程知识库、六类教学资源生成、作业/测试发布、生成质量分析。
- 学生端：我的课程、课程知识库检索、作业/测试提交、成绩解析、学习画像、个性化资源、学习路径和学习评估。
- 智能助手：课程知识库问答、上下文引用、问答会话管理。
- 管理端：用户管理、系统概览、模型状态查看。
- 平台能力：文件中心、异步任务中心、Chroma 检索增强、smoke/seed/final acceptance 验证脚本。

## 5. 创新点

- 以课程为核心组织教师资源生成、学生学习行为和知识库检索。
- 将 coverage、depth、confidence 质量分析接入生成、作业提交、测试和评估结果。
- 用 RAG 引用和任务中心增强大模型应用的可解释性与稳定性。
- 用可复用演示数据和全链路自动化测试保证比赛答辩时系统可复现。

## 6. 技术路线

1. FastAPI 提供统一 `/api/v1` REST API。
2. SQLAlchemy + Alembic 管理 PostgreSQL 数据模型和迁移。
3. Redis + Celery 执行知识库入库、资源生成等异步任务。
4. Chroma 保存文档切片向量并支持课程知识库检索。
5. Vue3 + Element Plus 构建教师、学生和管理员端交互。
6. LLM provider 默认使用 mock 稳定演示；配置 DashScope 或 OpenAI-compatible Key 后可切换真实模型。

## 7. 演示流程

1. 打开登录页，说明项目定位和三类角色。
2. 教师登录，展示课程、成员和课程知识库。
3. 上传 FastAPI 课程资料并执行课程内检索。
4. 发布作业/测试，展示生成质量分析。
5. 学生登录，进入课程学习页并完成作业/测试。
6. 展示成绩、解析、诊断建议和学习评估。
7. 使用智能助手围绕课程知识库提问。
8. 管理员登录，查看用户管理和模型状态。

## 8. 测试验证

- 后端：`python -m compileall app`、`pytest`
- 前端：`npm.cmd run type-check`、`npm.cmd run build`、`npm.cmd run test:e2e`
- 运行态：`curl.exe -4 http://127.0.0.1:8000/api/v1/health`
- 回归：`python scripts/e2e_smoke_api.py --api-base-url http://127.0.0.1:8000/api/v1`
- 演示数据：`python scripts/seed_demo_data.py --api-base-url http://127.0.0.1:8000/api/v1`
- 终验：`powershell -ExecutionPolicy Bypass -File scripts/final_acceptance_check.ps1`

## 9. 当前不足

- 图片/OCR 多模态附件未纳入当前主验收链路；当前稳定支持 txt、md、pdf、docx 课程资料和附件问答。
- 真实模型效果依赖本地或部署环境配置有效 API Key；仓库不保存真实密钥。
- Celery 容器仍可能提示 root 用户运行警告，当前作为生产化优化项记录，不影响本地演示。

## 10. 后续规划

- 接入图片/OCR 多模态资料解析。
- 扩展更多课程数据看板和班级层面的学习风险预警。
- 增强真实模型下的答案风格控制、引用质量评分和内容安全审核。
- 完善生产部署中的非 root 容器用户、密钥托管和日志脱敏策略。
