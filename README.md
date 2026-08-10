# 棱镜智教 PrismMind

棱镜智教 PrismMind 是面向高等教育场景的个性化资源生成与学习多智能体系统，覆盖教师教学资源生成、课程管理、课程知识库、学生个性化学习、智能辅导、测试与学习评估。

## 核心功能

- 教师端：课程管理、课程资料与知识库、培养方案、课程设计、习题和试卷生成、作业与测试发布。
- 学生端：课程学习、学习画像、个性化资源、学习路径、智能辅导、练习、测试与学习评估。
- 智能能力：多智能体任务编排、RAG 知识检索、内容引用、异步生成和质量分析。
- 平台能力：JWT 身份认证、教师/学生角色权限、文件中心、任务中心和 API 文档。

## 技术架构

- 前端：Vue 3、Vite、TypeScript、Element Plus
- 后端：FastAPI、SQLAlchemy 2.0、Alembic
- 数据库：PostgreSQL 16
- 缓存与任务队列：Redis 7、Celery
- 知识库：Chroma
- 部署：Docker Compose
- API 前缀：`/api/v1`

## 竞赛版首次部署

### 环境要求

- Windows 10/11 64 位
- Docker Desktop，使用 Linux Containers
- Docker Compose v2
- 建议 16 GB 内存、25 GB 可用磁盘
- 首次构建需要联网下载基础镜像与依赖

### 一键启动

将 `PrismMind-Competition.exe` 放在项目根目录，与 `docker-compose.yml` 同级，然后双击运行。

启动器会自动：

1. 检查 Docker Engine、Compose 和项目文件。
2. 准备持久化数据卷。
3. 执行 `docker compose up --build -d` 构建并启动服务。
4. 执行 Alembic 数据库迁移。
5. 检查前后端服务并打开系统页面。

启动器不会预置账号。部署完成后，请在注册页面自行创建教师或学生账号。

完整说明见 [竞赛版部署说明](docs/COMPETITION_EXECUTABLE_DEPLOYMENT.md)。

## 手工启动

在项目根目录打开 PowerShell：

```powershell
docker volume create intelligent-teaching-postgres-data
docker volume create intelligent-teaching-redis-data
docker volume create intelligent-teaching-storage-data

docker compose config --quiet
docker compose up --build -d
docker compose exec -T backend alembic upgrade head
docker compose ps
```

首次成功构建后，日常启动可使用：

```powershell
docker compose up -d
```

停止服务但保留数据：

```powershell
docker compose stop
```

不要执行 `docker compose down -v`，否则可能删除 PostgreSQL、Redis、上传文件和知识库数据。

## 访问地址

- 系统页面：<http://127.0.0.1:5173>
- API 文档：<http://127.0.0.1:8000/docs>
- 健康检查：<http://127.0.0.1:8000/api/v1/health>

健康检查正常时返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "ok",
    "service": "backend"
  }
}
```

## 模型配置

项目默认使用 `LLM_PROVIDER=mock`，无需 API Key 即可完成基础功能和离线演示。需要启用真实模型时，在项目根目录创建或修改 `.env`：

```env
LLM_PROVIDER=dashscope
LLM_MODEL=qwen-plus
DASHSCOPE_API_KEY=请填写有效密钥
SECRET_KEY=请填写足够长的随机字符串
```

不要将真实 API Key、访问令牌或个人隐私数据放入竞赛提交包。

## 目录结构

```text
backend/                 FastAPI 后端、数据库模型、迁移和 Celery 任务
frontend/                Vue 3 前端
scripts/                 启动、检查和测试脚本
docs/                    竞赛交付与核心技术文档
docker-compose.yml       本地及竞赛演示环境
docker-compose.prod.yml  生产部署参考环境
```

## 核心文档

- [竞赛版部署说明](docs/COMPETITION_EXECUTABLE_DEPLOYMENT.md)
- [API 概览](docs/API_OVERVIEW.md)
- [技术架构](docs/TECHNICAL_ARCHITECTURE.md)
- [答辩展示提纲](docs/PRESENTATION_OUTLINE.md)
- [最终测试摘要](docs/FINAL_TEST_SUMMARY.md)
- [AI Coding 工具使用说明](docs/ai_coding_usage.md)
- [开源组件与协议说明](docs/open_source_notice.md)
- [生产部署准备说明](DEPLOYMENT.md)

## 状态检查与日志

```powershell
docker compose ps
docker compose logs --tail=200 backend
docker compose logs --tail=200 frontend
docker compose logs --tail=200 celery_worker
```

如果后端健康检查返回 `status: ok`，表示后端、路由和基础依赖已经正常工作。
