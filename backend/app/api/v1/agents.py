from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_active_user
from app.models.agent_run import AgentRun
from app.models.user import User
from app.schemas.agent import AgentExecuteRequest, AgentRunRead
from app.schemas.common import ApiResponse
from app.services.agents.base import AgentContext, AgentRequest
from app.services.agents.orchestrator import orchestrator_service
from app.utils.response import success_response

router = APIRouter()


@router.post("/execute", response_model=ApiResponse[dict], summary="Dispatch a single or composite Agent request")
async def execute_agent_request(
    payload: AgentExecuteRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    result = await orchestrator_service.execute(
        db,
        AgentContext(db=db, user=current_user, course_id=payload.course_id, document_ids=payload.document_ids),
        AgentRequest(query=payload.query, payload=payload.payload,
                     allow_general_knowledge=payload.allow_general_knowledge, top_k=payload.top_k),
    )
    return success_response(data={
        "orchestrator_run_id": result["orchestrator_run_id"],
        "results": [item.model_dump(mode="json") for item in result["results"]],
    }, request=request)


@router.get("/runs/{run_uuid}", response_model=ApiResponse[AgentRunRead], summary="Read an owned Agent run tree")
def read_agent_run(
    run_uuid: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    root = db.scalar(select(AgentRun).where(AgentRun.run_uuid == run_uuid, AgentRun.user_id == current_user.id))
    if root is None:
        from app.core.exceptions import NotFoundException
        raise NotFoundException("Agent run not found")
    children = list(db.scalars(select(AgentRun).where(AgentRun.parent_run_id == root.id).order_by(AgentRun.id)))
    return success_response(data=_read(root, children), request=request)


def _read(run: AgentRun, children: list[AgentRun] | None = None) -> AgentRunRead:
    output = run.output_payload or {}
    return AgentRunRead(
        run_id=run.run_uuid, parent_run_id=str(run.parent_run_id) if run.parent_run_id else None,
        agent_role=run.agent_type, status=run.status.value, model_name=run.model_name,
        provider=run.provider, latency_ms=run.latency_ms, token_usage=run.token_usage or {},
        evidence_count=run.evidence_count, verifier_decision=run.verifier_decision,
        content=str(output.get("content") or ""), citations=list(output.get("citations") or []),
        evidence_status=output.get("evidence_status"), warnings=list(output.get("warnings") or []),
        children=[_read(child) for child in children or []],
    )
