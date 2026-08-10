# 技术架构说明

## 总览

棱镜智教-PrismMind 采用前后端分离架构：

- 后端：FastAPI + SQLAlchemy 2.0 + Alembic
- 数据库：PostgreSQL
- 缓存与任务队列：Redis + Celery
- 知识库：Chroma
- 前端：Vue3 + Vite + TypeScript + Element Plus
- 部署：Docker Compose
- 主接口前缀：`/api/v1`

## 后端分层

- `backend/app/api/v1`：API 路由，统一暴露 `/api/v1/**`。
- `backend/app/models`：SQLAlchemy 2.0 数据模型。
- `backend/app/schemas`：Pydantic 请求与响应模型。
- `backend/app/repositories`：数据库访问封装。
- `backend/app/services`：业务服务、生成服务、RAG、LLM provider、质量分析。
- `backend/app/tasks`：Celery 异步任务。
- `backend/alembic`：数据库迁移。

## 前端分层

- `frontend/src/router`：角色路由与守卫。
- `frontend/src/layouts`：主布局、教师布局、学生布局。
- `frontend/src/api`：真实 `/api/v1` API client。
- `frontend/src/views`：教师、学生、管理员、任务中心、助手页面。
- `frontend/src/components`：公共组件、课程、知识库、资源、任务、Markdown 展示。
- `frontend/src/stores`：Pinia 状态管理。

## 核心业务模块

- 认证与 RBAC。
- 我的课程与课程成员。
- 教师六类资源生成。
- 文件中心与课程知识库。
- 学生画像。
- 学生 RAG 辅导与智能聊天助手。
- 个性化学习资源。
- 学习路径。
- 课程作业/测试发布与提交。
- 学习评估与质量分析。
- 异步任务中心。
- 管理员用户管理。

## LLM 配置

当前支持统一 LLM Provider：

- `LLM_PROVIDER=mock`：默认离线演示模式。
- `LLM_PROVIDER=dashscope`：真实模型模式，需要配置 `DASHSCOPE_API_KEY`。

登录后可通过 `/api/v1/llm/status` 查看 provider、模型和 fallback 状态。

## 历史说明

原型阶段曾使用 EduGenie / Flask / MySQL / RQ 等命名和技术栈。该内容为原型阶段历史记录，不代表当前主架构，旧运行入口与旧 demo API 已清理。
