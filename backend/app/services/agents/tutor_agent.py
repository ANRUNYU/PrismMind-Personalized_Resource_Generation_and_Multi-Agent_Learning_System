from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.services.agents.base import BaseAgent, TutorOutput
from app.services.knowledge.models import GroundingPolicy
from app.services.llm.base import ChatMessage, StreamChunkType
from app.services.llm.model_registry import AgentRole
from app.services.llm.prompt_registry import render_prompt


@dataclass(frozen=True)
class TutorAgentResult:
    content: str
    model_name: str
    token_usage: dict | None = None


class TutorAgent(BaseAgent[TutorOutput]):
    role = AgentRole.TUTOR
    policy = GroundingPolicy.STRICT
    output_schema = TutorOutput
    system_prompt = (
        "你是课程辅导 Agent。只依据提供的 [S1] 等证据回答课程事实，每项事实必须引用；"
        "不得自行构造文件名或来源。返回 JSON: {content, citation_ids}。"
    )

    def answer_question(self, *, question: str, reference_context: str, difficulty: str = "normal",
                        response_format: str = "markdown") -> TutorAgentResult:
        return self._legacy_call("student_tutoring_ask", question=question, reference_context=reference_context,
                                 difficulty=difficulty, response_format=response_format)

    def generate_hint(self, *, question: str, context: str | None, reference_context: str,
                      difficulty: str = "normal", response_format: str = "markdown") -> TutorAgentResult:
        return self._legacy_call("student_tutoring_hint", question=question, context=context or "",
                                 reference_context=reference_context, difficulty=difficulty, response_format=response_format)

    def explain_concept(self, *, concept: str, reference_context: str, difficulty: str = "normal",
                        response_format: str = "markdown") -> TutorAgentResult:
        return self._legacy_call("student_tutoring_explain", concept=concept, reference_context=reference_context,
                                 difficulty=difficulty, response_format=response_format)

    async def stream_legacy_answer(self, prompt: str) -> AsyncIterator[str]:
        async for chunk in self.router.stream_chat(role=self.role, messages=[ChatMessage(role="user", content=prompt)]):
            if chunk.type == StreamChunkType.delta and chunk.delta:
                yield chunk.delta
            if chunk.type == StreamChunkType.error:
                raise RuntimeError(chunk.error or "Tutor stream interrupted")

    def _legacy_call(self, prompt_name: str, **values) -> TutorAgentResult:
        prompt = render_prompt(prompt_name, values)
        response = self.legacy_text(prompt)
        usage = response.usage.model_dump() if response.usage else None
        return TutorAgentResult(content=response.content, model_name=response.model, token_usage=usage)


tutor_agent = TutorAgent()
