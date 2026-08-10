from __future__ import annotations

from typing import Any


class QueryBuilder:
    @staticmethod
    def build(agent_role: str, *, user_input: str = "", course_name: str | None = None, **context: Any) -> str:
        role = agent_role.lower()
        parts: list[str] = []
        if role == "tutor":
            parts = [user_input, course_name or ""]
        elif role == "resource":
            parts = [str(context.get("topic", user_input)), str(context.get("resource_type", "")), str(context.get("knowledge_points", ""))]
        elif role == "test":
            parts = [str(context.get("knowledge_points", user_input)), str(context.get("difficulty", "")), str(context.get("question_types", ""))]
        elif role == "path":
            parts = [str(context.get("goal", user_input)), str(context.get("weaknesses", "")), str(context.get("course_structure", course_name or ""))]
        elif role == "assessment":
            parts = [str(context.get("wrong_answer_topics", user_input)), str(context.get("learning_goal", ""))]
        elif role == "profile":
            parts = [course_name or "", str(context.get("knowledge_concepts", user_input))]
        else:
            parts = [user_input, course_name or ""]
        return " | ".join(part.strip() for part in parts if part and part.strip())[:4000]
