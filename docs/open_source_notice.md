# 开源组件与协议说明

棱镜智教-PrismMind 当前主架构使用以下主要开源组件。提交材料或正式部署前，请以实际锁定版本为准复核许可证文本。

| 组件 | 用途 | 来源 | 常见协议 |
| --- | --- | --- | --- |
| FastAPI | 后端 Web 框架 | https://github.com/fastapi/fastapi | MIT |
| SQLAlchemy | ORM | https://github.com/sqlalchemy/sqlalchemy | MIT |
| Alembic | 数据库迁移 | https://github.com/sqlalchemy/alembic | MIT |
| PostgreSQL | 主业务数据库 | https://www.postgresql.org/ | PostgreSQL License |
| psycopg | PostgreSQL Python 驱动 | https://github.com/psycopg/psycopg | LGPL with exceptions |
| Redis | 缓存与任务队列基础设施 | https://github.com/redis/redis | BSD-3-Clause / RSALv2 相关版本说明 |
| Celery | Python 异步任务队列 | https://github.com/celery/celery | BSD-3-Clause |
| Chroma | 本地向量数据库 | https://github.com/chroma-core/chroma | Apache-2.0 |
| Vue | 前端框架 | https://github.com/vuejs/core | MIT |
| Vite | 前端构建工具 | https://github.com/vitejs/vite | MIT |
| TypeScript | 前端类型系统 | https://github.com/microsoft/TypeScript | Apache-2.0 |
| Element Plus | Vue3 UI 组件库 | https://github.com/element-plus/element-plus | MIT |
| Axios | HTTP 客户端 | https://github.com/axios/axios | MIT |
| ECharts | 图表渲染 | https://github.com/apache/echarts | Apache-2.0 |
| Marked | Markdown 渲染 | https://github.com/markedjs/marked | MIT |
| Lucide | 前端图标 | https://github.com/lucide-icons/lucide | ISC |

原型阶段文档中出现过 Flask、MySQL、RQ 等依赖说明；这些内容不代表当前主架构。
