# PrismMind 生产部署参考

本文说明 `docker-compose.prod.yml` 的生产部署准备方式。竞赛电脑的本地首次运行请优先阅读 [竞赛版部署说明](docs/COMPETITION_EXECUTABLE_DEPLOYMENT.md)。

## 架构

```text
浏览器 -> Nginx -> Vue 前端
              -> /api -> FastAPI
FastAPI -> PostgreSQL / Redis / Chroma / Celery Worker
```

生产 Compose 包含 PostgreSQL、Redis、backend、celery_worker、frontend 和 nginx 六个服务。

## 服务器要求

- Linux 或可稳定运行 Linux Containers 的服务器
- Docker Engine 与 Docker Compose v2
- 可访问容器镜像仓库和依赖源
- 对外开放 80/443 端口
- 足够的数据库、上传文件、知识库和日志空间

## 环境变量

复制生产环境模板：

```powershell
Copy-Item backend/.env.production.example backend/.env.production
```

至少修改以下值：

- `SECRET_KEY`
- `POSTGRES_PASSWORD`
- `BACKEND_CORS_ORIGINS`
- 按需配置 LLM Provider 和 API Key

不要提交真实 `.env`、`.env.production`、API Key 或管理员密码。

## 构建与启动

在项目根目录执行：

```powershell
docker compose -f docker-compose.prod.yml --env-file backend/.env.production config --quiet
docker compose -f docker-compose.prod.yml --env-file backend/.env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file backend/.env.production exec -T backend alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file backend/.env.production ps
```

创建管理员时，将管理员信息放入服务器环境变量或密钥管理系统，然后执行：

```powershell
docker compose -f docker-compose.prod.yml --env-file backend/.env.production exec -T backend python scripts/seed_admin.py
```

## 健康检查

- 前端：`http://SERVER/`
- 后端健康检查：`http://SERVER/api/v1/health`
- Swagger：`http://SERVER/docs`

## 日志

```powershell
docker compose -f docker-compose.prod.yml --env-file backend/.env.production logs -f nginx
docker compose -f docker-compose.prod.yml --env-file backend/.env.production logs -f backend
docker compose -f docker-compose.prod.yml --env-file backend/.env.production logs -f celery_worker
```

## 停止服务

```powershell
docker compose -f docker-compose.prod.yml --env-file backend/.env.production down
```

不要在生产环境执行 `down -v`。该操作会删除数据库、Redis、上传文件和 Chroma 知识库数据。

## 持久化数据与备份

需要备份的物理数据卷：

- `intelligent-teaching-prod-postgres-data`
- `intelligent-teaching-prod-redis-data`
- `intelligent-teaching-prod-storage-data`

同时备份：

- PostgreSQL 定期逻辑备份
- `backend/.env.production`（存放在仓库之外的安全位置）
- TLS 证书和 Nginx 站点配置

正式上线前应完成一次从备份恢复的演练。

## 常见问题

- 数据库连接失败：容器内数据库主机名应为 `postgres`，不是 `localhost`。
- Redis 连接失败：检查 `redis://redis:6379/0` 和 Redis 健康状态。
- 数据表缺失：执行 `alembic upgrade head`。
- Celery 重启：检查 worker 日志、Redis 与后端环境变量。
- CORS 错误：把正式域名加入 `BACKEND_CORS_ORIGINS`。
- 上传返回 413：同时检查 Nginx 与后端上传大小限制。
- 前端刷新 404：检查 Nginx SPA history fallback。
- Chroma 权限错误：确认 backend 与 celery_worker 共享生产 storage 卷。

## 上线加固建议

- 配置 HTTPS、证书自动续期和安全响应头。
- 使用可信镜像仓库和不可变镜像标签。
- 建立日志收集、指标监控和告警。
- 自动化数据库与存储备份。
- 使用密钥管理服务保存生产凭据。
- 建立 CI/CD、灰度发布和回滚流程。
