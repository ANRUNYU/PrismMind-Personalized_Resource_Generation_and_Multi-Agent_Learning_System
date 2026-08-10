from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Awaitable, Callable
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.agent_run import AgentRun
from app.models.enums import AgentRunStatus
from app.services.agents.base import AgentContext, AgentRequest, AgentResult
from app.services.agents.path_agent import path_planning_agent
from app.services.agents.profile_agent import profile_agent
from app.services.agents.resource_agent import resource_agent
from app.services.agents.test_agent import test_agent
from app.services.agents.tutor_agent import tutor_agent
from app.services.agents.assessment_agent import assessment_agent
from app.services.llm.model_registry import AgentRole

EventCallback = Callable[[dict[str, Any]], Awaitable[None] | None]


class OrchestratorService:
    """Deterministic dispatcher. It never exposes prompts or model reasoning."""

    agents = {
        AgentRole.PROFILE: profile_agent,
        AgentRole.TUTOR: tutor_agent,
        AgentRole.RESOURCE: resource_agent,
        AgentRole.TEST: test_agent,
        AgentRole.PATH: path_planning_agent,
        AgentRole.ASSESSMENT: assessment_agent,
    }

    def classify(self, query: str) -> list[AgentRole]:
        normalized = query.lower()
        wants_path = any(word in normalized for word in ("学习路径", "学习计划", "制定计划", "path", "plan"))
        wants_test = any(word in normalized for word in ("练习", "习题", "试卷", "测验", "quiz", "test"))
        if wants_path and wants_test:
            return [AgentRole.PATH, AgentRole.TEST]
        if wants_path:
            return [AgentRole.PATH]
        if wants_test:
            return [AgentRole.TEST]
        if any(word in normalized for word in ("资源", "讲义", "ppt", "阅读材料")):
            return [AgentRole.RESOURCE]
        if any(word in normalized for word in ("画像", "专业", "学习目标")):
            return [AgentRole.PROFILE]
        if any(word in normalized for word in ("评估", "分析成绩", "薄弱点")):
            return [AgentRole.ASSESSMENT]
        return [AgentRole.TUTOR]

    async def execute(self, db: Session, context: AgentContext, request: AgentRequest,
                      on_event: EventCallback | None = None) -> dict[str, Any]:
        roles = self.classify(request.query)
        composite = len(roles) > 1
        parent = self._create_run(db, context, AgentRole.ORCHESTRATOR) if composite else None
        if parent:
            await self._emit(on_event, {"type": "stage", "stage": "analyzing", "message": "正在分析请求", "run_id": parent.run_uuid})
        results: list[AgentResult] = []
        try:
            for role in roles:
                child = self._create_run(db, context, role, parent=parent)
                await self._emit(on_event, {"type": "stage", "stage": "retrieving", "message": "正在检索课程知识库", "agent_role": role.value})
                await self._emit(on_event, {"type": "stage", "stage": "calling_agent", "message": f"正在调用 {role.value} Agent", "agent_role": role.value})
                result = await self.agents[role].run(context, request)
                self._complete_run(db, child, result)
                results.append(result)
                await self._emit(on_event, {"type": "reference", "agent_role": role.value, "references": [item.model_dump() for item in result.citations]})
                await self._emit(on_event, {"type": "stage", "stage": "verifying", "message": "正在验证引用", "agent_role": role.value})
            if parent:
                parent.status = AgentRunStatus.success
                parent.finished_at = datetime.now(timezone.utc)
                parent.output_payload = {"child_run_ids": [result.run_id for result in results]}
                db.commit()
            await self._emit(on_event, {"type": "done", "message": "已完成"})
        except Exception as exc:
            if parent:
                parent.status = AgentRunStatus.failed
                parent.error_message = str(exc)[:1000]
                parent.finished_at = datetime.now(timezone.utc)
                db.commit()
            raise
        return {"orchestrator_run_id": parent.run_uuid if parent else None, "results": results}

    def _create_run(self, db: Session, context: AgentContext, role: AgentRole, parent: AgentRun | None = None) -> AgentRun:
        run = AgentRun(user_id=context.user.id, parent_run_id=parent.id if parent else None,
                       run_uuid=str(uuid4()), agent_type=role.value, input_payload={},
                       status=AgentRunStatus.running, trace=[], started_at=datetime.now(timezone.utc))
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    def _complete_run(self, db: Session, run: AgentRun, result: AgentResult) -> None:
        run.run_uuid = result.run_id
        run.status = AgentRunStatus.success
        run.output_payload = result.model_dump(mode="json")
        run.model_name = result.model_name
        run.provider = result.provider
        run.token_usage = result.usage.model_dump()
        run.evidence_count = len(result.citations)
        run.verifier_decision = str(result.verification.get("decision") or "") or None
        run.latency_ms = round(result.latency_ms)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

    @staticmethod
    async def _emit(callback: EventCallback | None, event: dict[str, Any]) -> None:
        if callback is None:
            return
        result = callback(event)
        if hasattr(result, "__await__"):
            await result


orchestrator_service = OrchestratorService()
