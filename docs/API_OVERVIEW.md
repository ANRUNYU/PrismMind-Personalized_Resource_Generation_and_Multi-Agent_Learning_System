# PrismMind API 概览

PrismMind 后端基于 FastAPI，统一接口前缀为 `/api/v1`。服务启动后，可通过以下地址查看和测试完整接口：

- Swagger UI：<http://127.0.0.1:8000/docs>
- OpenAPI JSON：<http://127.0.0.1:8000/openapi.json>
- 健康检查：<http://127.0.0.1:8000/api/v1/health>

前端页面会自动调用这些接口。普通使用者和评委不需要在 Swagger 中逐个执行接口。

## 通用约定

| 方法 | 用途 |
| --- | --- |
| `GET` | 查询数据 |
| `POST` | 创建数据或执行操作 |
| `PATCH` | 修改部分数据 |
| `DELETE` | 删除数据 |

常规成功响应结构：

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "request_id": ""
}
```

- `code = 0` 表示业务请求成功。
- `data` 为具体结果。
- `request_id` 用于在服务日志中追踪一次请求。
- `401` 通常表示未登录或令牌失效。
- `403` 表示当前角色没有权限。
- `404` 表示目标资源不存在。
- `422` 表示路径、查询参数或请求体校验失败。

## 认证流程

| 接口 | 说明 |
| --- | --- |
| `POST /api/v1/auth/register` | 注册教师或学生账号 |
| `POST /api/v1/auth/login` | 登录并获取访问令牌与刷新令牌 |
| `POST /api/v1/auth/refresh` | 刷新访问令牌 |
| `POST /api/v1/auth/logout` | 退出登录 |
| `GET /api/v1/auth/me` | 获取当前登录用户 |

需要登录的接口使用 Bearer Token：

```http
Authorization: Bearer <access_token>
```

教师、学生和管理员由后端执行角色权限校验。启动器不会预置账号，评委可通过注册页面自行创建教师或学生账号。

## 主要接口分组

### 课程与课程任务

- `/api/v1/courses`：创建、查询、更新和归档课程。
- `/api/v1/courses/join`：学生使用课程码加入课程。
- `/api/v1/courses/{course_id}/members`：课程成员。
- `/api/v1/courses/{course_id}/assignments`：课程作业和测试发布、查询。
- `/api/v1/courses/{course_id}/assignments/{assignment_id}/start`：开始作业。
- `/api/v1/courses/{course_id}/assignments/{assignment_id}/submit`：提交答案。

### 教师资源生成

- `/api/v1/teacher/training-plans/*`：培养方案技能提取与生成。
- `/api/v1/teacher/course-designs/*`：课程设计生成。
- `/api/v1/teacher/teaching-designs/*`：教学设计生成。
- `/api/v1/teacher/exercises/*`：习题生成。
- `/api/v1/teacher/papers/*`：试卷生成。
- `/api/v1/teacher/projects/*`：项目实践生成。
- `/api/v1/teacher/generated-artifacts`：查询教师生成历史与详情。

生成接口同时提供同步和 `generate-async` 异步形式。异步任务状态可从任务中心查询。

### 学生学习

- `/api/v1/student/dashboard/summary`：学生首页聚合数据。
- `/api/v1/student/profile/*`：学习画像与引导式画像构建。
- `/api/v1/student/resources/*`：个性化学习资源生成和管理。
- `/api/v1/student/learning-paths/*`：学习路径、步骤、小测和推荐。
- `/api/v1/student/tutoring/*`：智能辅导、提示、概念解释和会话。
- `/api/v1/student/exercises/*`：个人练习创建、作答、收藏和完成。
- `/api/v1/student/tests/*`：测试生成、开始、提交和评分。
- `/api/v1/student/assessments/*`：学习评估、总结和建议。

### 文件与知识库

- `/api/v1/files/*`：单文件/批量上传、详情、下载和删除。
- `/api/v1/knowledge/documents/*`：知识文档创建、解析、入库和重试。
- `/api/v1/knowledge/retrieve`：从当前用户知识库检索内容。
- `/api/v1/courses/{course_id}/knowledge/*`：课程范围内的知识文档与检索。

### 智能助手与任务

- `/api/v1/assistant/sessions/*`：智能助手会话、消息和临时附件。
- `/api/v1/agents/execute`：执行单智能体或组合智能体请求。
- `/api/v1/agents/runs/{run_uuid}`：查询智能体运行树。
- `/api/v1/tasks`：查询当前用户的异步任务。
- `/api/v1/tasks/{task_id}/stream`：以 NDJSON 流式返回任务事件。
- `/api/v1/llm/status`：查询当前大模型提供方状态。

## Swagger 测试方法

1. 在 `/api/v1/auth/register` 注册账号。
2. 在 `/api/v1/auth/login` 登录并复制 `access_token`。
3. 点击 Swagger 页面右上角的 `Authorize`。
4. 填入 Bearer Token。
5. 展开目标接口，点击 `Try it out`，填写参数后执行。

`DELETE` 接口会真实删除数据，测试前应确认目标 ID。流式接口会返回 NDJSON 数据，更适合通过前端页面或专用客户端调用。
