from __future__ import annotations

import json
import logging
from collections import Counter
from typing import Any

from app.models.assessment import LearningAssessment
from app.models.learning_path import LearningPath
from app.models.profile import StudentProfile
from app.models.resource import LearningResource
from app.models.test import StudentTest
from app.services.agents.base import AssessmentExplanation, BaseAgent
from app.services.knowledge.models import GroundingPolicy
from app.services.llm.model_registry import AgentRole


logger = logging.getLogger(__name__)


PROFILE_SCORE_KEYS = [
    "knowledge_score",
    "practice_score",
    "innovation_score",
    "exam_score",
    "efficiency_score",
    "quality_score",
]

TOPIC_LABELS = {
    "profile": "学习画像",
    "learning profile": "学习画像",
    "rag": "RAG 辅导",
    "rag tutoring": "RAG 辅导",
    "async task monitoring": "异步任务监控",
    "async tasks": "异步任务",
    "regularization": "正则化",
    "overfitting": "过拟合",
    "gradient descent": "梯度下降",
    "learning rate": "学习率",
    "function": "函数",
    "python functions": "Python 函数",
    "ml basics": "机器学习基础",
    "math": "数学基础",
    "model principles": "模型原理",
    "resources": "学习资源",
    "tests": "在线测试",
    "assessments": "学习评估",
}


class AssessmentAgent(BaseAgent[AssessmentExplanation]):
    role = AgentRole.ASSESSMENT
    policy = GroundingPolicy.CONTEXTUAL
    output_schema = AssessmentExplanation
    system_prompt = "只解释确定性分数，不得修改客观分数；薄弱结论必须来自学习记录，课程解释必须引用。"

    def _legacy_generate_json(self, prompt: str, **_kwargs):
        return self.legacy_text(prompt)
    def estimate_score(
        self,
        *,
        assessment_type: str,
        explicit_score: float | None,
        resource: LearningResource | None = None,
        path: LearningPath | None = None,
        test: StudentTest | None = None,
        profile: StudentProfile | None = None,
        resources: list[LearningResource] | None = None,
        paths: list[LearningPath] | None = None,
        tests: list[StudentTest] | None = None,
        assessments: list[LearningAssessment] | None = None,
    ) -> float:
        if explicit_score is not None:
            return self._clamp(explicit_score)

        if assessment_type == "test" and test and test.score is not None:
            return self._clamp(test.score)

        if assessment_type == "resource" and resource:
            score = 45.0
            if resource.is_viewed:
                score += 10.0
            if resource.is_completed:
                score += 25.0
            if resource.user_rating:
                score += (float(resource.user_rating) - 3.0) * 5.0
            return self._clamp(score)

        if assessment_type == "path" and path:
            return self._clamp(path.completion_rate)

        if assessment_type == "comprehensive":
            return self._comprehensive_score(
                profile=profile,
                resources=resources or [],
                paths=paths or [],
                tests=tests or [],
                assessments=assessments or [],
            )

        if profile:
            profile_scores = [float(getattr(profile, key, 0.0) or 0.0) for key in PROFILE_SCORE_KEYS]
            if profile_scores:
                return self._clamp(sum(profile_scores) / len(profile_scores))
        return 60.0

    def build_analysis(
        self,
        *,
        assessment_type: str,
        topic: str | None,
        score: float,
        correct_topics: list[str],
        incorrect_topics: list[str],
    ) -> str:
        type_text = {
            "resource": "学习资源",
            "path": "学习路径",
            "topic": "主题",
            "test": "测试结果",
            "comprehensive": "综合学习",
        }.get(assessment_type, "学习")
        topic_text = self._topic_label(topic)
        level = "表现较好" if score >= 80 else "基本稳定" if score >= 60 else "需要重点改进"
        strengths = self._topic_list(correct_topics) if correct_topics else "暂无明确优势主题"
        weaknesses = self._topic_list(incorrect_topics) if incorrect_topics else "暂无明确薄弱主题"
        return (
            f"本次{type_text}评估围绕{topic_text}展开，综合得分为 {round(score, 1)} 分，整体状态为{level}。"
            f"当前优势主题：{strengths}；需要关注的薄弱主题：{weaknesses}。"
            "该结果由学习记录、测试表现和画像信号进行规则聚合生成，建议结合近期学习过程一起复盘。"
        )

    def build_recommendations(
        self,
        *,
        score: float,
        incorrect_topics: list[str],
        profile: StudentProfile | None = None,
        resource_completion_hint: str | None = None,
        path_progress_hint: str | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        recommendations: list[dict[str, Any]] = []
        for topic in incorrect_topics[:3]:
            topic_label = self._topic_label(topic)
            recommendations.append(
                {
                    "title": f"重点复习：{topic_label}",
                    "description": f"系统检测到{topic_label}近期掌握情况较弱，建议优先复习。",
                    "priority": "high",
                    "reason": f"近期测试或学习评估将{topic_label}记录为薄弱知识点。",
                    "suggested_action": (
                        f"建议围绕{topic_label}完成一次针对性概念讲解、一道例题解析和两道同类巩固练习，"
                        "并总结错因，形成“理解-应用-反馈”的学习闭环。"
                    ),
                    "related_topics": [topic_label],
                }
            )

        if profile:
            if float(profile.exam_score or 0) < 60:
                recommendations.append(
                    {
                        "title": "强化错题回顾",
                        "description": "画像中的测试表现维度低于稳定区间，需要通过短测和错题复盘提升稳定性。",
                        "priority": "medium",
                        "reason": "学习画像显示测试维度得分相对偏低。",
                        "suggested_action": "每完成一个学习资源后生成一次 3-5 题短测，并立即记录错题原因和正确解法。",
                        "related_topics": [],
                    }
                )
            if float(profile.practice_score or 0) < 60:
                recommendations.append(
                    {
                        "title": "增加实践任务训练",
                        "description": "实践能力维度需要更多动手训练来巩固概念理解。",
                        "priority": "medium",
                        "reason": "学习画像显示实践维度得分相对偏低。",
                        "suggested_action": "选择一个小型实践任务，记录实现步骤、关键问题和调试过程，完成后进行一次自我复盘。",
                        "related_topics": [],
                    }
                )
            if float(profile.efficiency_score or 0) < 60:
                recommendations.append(
                    {
                        "title": "拆分学习步骤",
                        "description": "学习效率维度偏弱时，较短且可验证的学习步骤更容易形成连续反馈。",
                        "priority": "medium",
                        "reason": "学习画像显示效率维度得分相对偏低。",
                        "suggested_action": "将学习路径拆成 30-45 分钟的小步骤，并为每一步设置明确完成标准。",
                        "related_topics": [],
                    }
                )

        if score < 60:
            recommendations.append(
                {
                    "title": "夯实前置基础",
                    "description": "当前测试得分低于 60 分，说明基础掌握仍不稳定，暂不建议直接进入更高难度内容。",
                    "priority": "high",
                    "reason": "评估得分低于及格阈值，需要先补齐前置概念和基础练习。",
                    "suggested_action": "建议先复习相关前置概念，完成基础例题和同类练习后，再进入新知识点学习。",
                    "related_topics": [self._topic_label(topic) for topic in incorrect_topics[:3]],
                }
            )

        if resource_completion_hint:
            recommendations.append(
                {
                    "title": "优先完成关键学习资源",
                    "description": resource_completion_hint,
                    "priority": "medium",
                    "reason": "学习资源完成记录显示仍有关键材料尚未完成。",
                    "suggested_action": "先完成与当前薄弱点最相关的学习资源，再生成新的学习内容。",
                    "related_topics": [],
                }
            )

        if path_progress_hint:
            recommendations.append(
                {
                    "title": "推进当前学习路径",
                    "description": path_progress_hint,
                    "priority": "medium",
                    "reason": "学习路径进度是判断学习连续性的重要信号。",
                    "suggested_action": "完成当前路径步骤，并用 3-5 句话记录本步收获和遗留问题。",
                    "related_topics": [],
                }
            )

        if not recommendations:
            recommendations.append(
                {
                    "title": "保持当前学习节奏",
                    "description": "近期没有检测到必须立即处理的薄弱主题。",
                    "priority": "low",
                    "reason": "近期评估数据整体较稳定。",
                    "suggested_action": "继续推进下一项学习资源或路径步骤，并在完成后进行一次简短自测。",
                    "related_topics": [],
                }
            )
        return self._enhance_recommendations(
            recommendations=recommendations[:limit],
            score=score,
            incorrect_topics=incorrect_topics,
            limit=limit,
        )

    def summarize(self, *, assessments: list[LearningAssessment], profile: StudentProfile | None) -> dict[str, Any]:
        scored = [item for item in assessments if item.score is not None]
        total = len(assessments)
        average = round(sum(float(item.score or 0.0) for item in scored) / len(scored), 2) if scored else 0.0
        latest = float(scored[0].score) if scored else None
        correct_counter = Counter()
        incorrect_counter = Counter()
        type_counter = Counter()
        recent_recommendations: list[dict[str, Any]] = []
        for item in assessments:
            type_counter[item.assessment_type] += 1
            correct_counter.update(self._topic_label(str(topic)) for topic in item.correct_topics or [])
            incorrect_counter.update(self._topic_label(str(topic)) for topic in item.incorrect_topics or [])
            for recommendation in item.recommendations or []:
                if len(recent_recommendations) < 5:
                    recent_recommendations.append(self._localize_recommendation(recommendation))
        return {
            "total_assessments": total,
            "average_score": average,
            "latest_score": latest,
            "score_trend": [
                {"assessment_id": item.id, "score": item.score, "created_at": item.created_at}
                for item in reversed(scored[:10])
            ],
            "strong_topics": [topic for topic, _ in correct_counter.most_common(5)],
            "weak_topics": [topic for topic, _ in incorrect_counter.most_common(5)],
            "assessment_type_distribution": dict(type_counter),
            "recent_recommendations": recent_recommendations,
            "profile_dimension_hints": self._profile_hints(profile),
        }

    def recommend(
        self,
        *,
        assessments: list[LearningAssessment],
        profile: StudentProfile | None,
        top_k: int,
    ) -> dict[str, Any]:
        if not assessments:
            return {
                "recommendations": [],
                "basis": {
                    "profile_used": False,
                    "assessment_count": 0,
                    "latest_assessment_id": None,
                },
            }

        weak_topics = Counter()
        for item in assessments:
            weak_topics.update(self._topic_label(str(topic)) for topic in item.incorrect_topics or [])
        recommendations = self.build_recommendations(
            score=float(assessments[0].score or 60.0) if assessments else 60.0,
            incorrect_topics=[topic for topic, _ in weak_topics.most_common(top_k)],
            profile=profile,
            limit=top_k,
        )
        return {
            "recommendations": recommendations[:top_k],
            "basis": {
                "profile_used": profile is not None,
                "assessment_count": len(assessments),
                "latest_assessment_id": assessments[0].id if assessments else None,
            },
        }

    def _enhance_recommendations(
        self,
        *,
        recommendations: list[dict[str, Any]],
        score: float,
        incorrect_topics: list[str],
        limit: int,
    ) -> list[dict[str, Any]]:
        fallback_json = json.dumps({"recommendations": recommendations}, ensure_ascii=False)
        prompt = (
            "请优化学生学习评估建议，输出中文 JSON。\n"
            f"当前得分：{score}\n"
            f"薄弱主题：{incorrect_topics}\n"
            f"已有建议：{fallback_json}\n"
            "要求：建议必须具体、可执行，包含 title、description、priority、reason、suggested_action、related_topics；"
            "priority 只能使用 high、medium、low；不要输出内部 ID。"
        )
        try:
            result = self._legacy_generate_json(
                prompt,
                system_prompt="你是个性化学习评估助手。请使用中文，基于学生表现给出可执行学习建议。",
                schema_hint='{"recommendations":[{"title":"建议标题","description":"说明","priority":"high|medium|low","reason":"原因","suggested_action":"行动","related_topics":["主题"]}]}',
                temperature=0.25,
                fallback=fallback_json,
            )
        except Exception as exc:
            logger.warning(
                "assessment recommendation enhancement unavailable; preserving deterministic recommendations error_type=%s",
                type(exc).__name__,
            )
            return recommendations
        try:
            payload = json.loads(self._strip_json_code_fence(result.content))
        except json.JSONDecodeError:
            return recommendations
        raw_items = payload.get("recommendations") if isinstance(payload, dict) else payload
        if not isinstance(raw_items, list):
            return recommendations
        enhanced: list[dict[str, Any]] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            suggested_action = str(item.get("suggested_action") or "").strip()
            if not title or not suggested_action:
                continue
            priority = str(item.get("priority") or "medium").strip().lower()
            if priority not in {"high", "medium", "low"}:
                priority = "medium"
            related_topics = item.get("related_topics") or []
            if not isinstance(related_topics, list):
                related_topics = [str(related_topics)]
            enhanced.append(
                {
                    "title": title,
                    "description": str(item.get("description") or title),
                    "priority": priority,
                    "reason": str(item.get("reason") or "基于当前学习评估结果生成。"),
                    "suggested_action": suggested_action,
                    "related_topics": [str(topic) for topic in related_topics],
                }
            )
        return enhanced[:limit] or recommendations

    def _strip_json_code_fence(self, content: str) -> str:
        text = str(content or "").strip()
        if text.startswith("```"):
            text = text.removeprefix("```json").removeprefix("```").strip()
            if text.endswith("```"):
                text = text[:-3].strip()
        return text

    def _comprehensive_score(
        self,
        *,
        profile: StudentProfile | None,
        resources: list[LearningResource],
        paths: list[LearningPath],
        tests: list[StudentTest],
        assessments: list[LearningAssessment],
    ) -> float:
        signals: list[float] = []
        if profile:
            signals.append(sum(float(getattr(profile, key, 0.0) or 0.0) for key in PROFILE_SCORE_KEYS) / len(PROFILE_SCORE_KEYS))
        if resources:
            completed = sum(1 for item in resources if item.is_completed)
            signals.append((completed / len(resources)) * 100)
        if paths:
            signals.append(sum(float(item.completion_rate or 0.0) for item in paths) / len(paths))
        submitted_tests = [item for item in tests if item.score is not None]
        if submitted_tests:
            signals.append(sum(float(item.score or 0.0) for item in submitted_tests) / len(submitted_tests))
        scored_assessments = [item for item in assessments if item.score is not None]
        if scored_assessments:
            signals.append(sum(float(item.score or 0.0) for item in scored_assessments) / len(scored_assessments))
        return self._clamp(sum(signals) / len(signals)) if signals else 60.0

    def _topic_label(self, topic: str | None) -> str:
        value = str(topic or "").strip()
        if not value:
            return "当前学习任务"
        lowered = value.lower()
        if lowered in TOPIC_LABELS:
            return TOPIC_LABELS[lowered]
        if value.isdigit():
            return f"知识点 {value}"
        return value

    def _topic_list(self, topics: list[str]) -> str:
        return "、".join(self._topic_label(topic) for topic in topics)

    def _localize_recommendation(self, recommendation: dict[str, Any]) -> dict[str, Any]:
        localized = dict(recommendation)
        for field in ("title", "description", "reason", "suggested_action"):
            if field in localized:
                localized[field] = self._localize_text(localized.get(field))
        localized["related_topics"] = [
            self._topic_label(str(topic)) for topic in localized.get("related_topics") or []
        ]
        return localized

    def _localize_text(self, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        text = value.strip()
        if not text:
            return text
        if text.startswith("Review "):
            return f"重点复习：{self._topic_label(text.removeprefix('Review '))}"
        if " appears in recent weak-topic evidence and should be reviewed first." in text:
            topic = text.split(" appears in recent weak-topic evidence", 1)[0]
            return f"系统检测到{self._topic_label(topic)}近期掌握情况较弱，建议优先复习。"
        if text.startswith("Complete one focused explanation"):
            topic = text.rsplit(" for ", 1)[-1].rstrip(".")
            topic_label = self._topic_label(topic)
            return (
                f"建议围绕{topic_label}完成一次针对性概念讲解、一道例题解析和两道同类巩固练习，"
                "并总结错因。"
            )
        exact = {
            "Recent assessment recorded this topic as incorrect or weak.": "近期测试或学习评估将该主题记录为薄弱点。",
            "Rebuild the prerequisite foundation": "夯实前置基础",
            "The current score is below 60, so direct advancement may be unstable.": (
                "当前测试得分低于 60 分，说明基础掌握仍不稳定，暂不建议直接进入更高难度内容。"
            ),
            "Assessment score is below the passing threshold.": "评估得分低于及格阈值，需要先补齐基础。",
            "Review prerequisite concepts before starting a new topic.": "建议先复习相关前置概念，再进入新知识点学习。",
            "No urgent weak topic was detected.": "近期没有检测到必须立即处理的薄弱主题。",
            "Recent assessment data is stable.": "近期评估数据整体较稳定。",
            "Continue with the next resource or path step and run a short self-test afterwards.": (
                "继续推进下一项学习资源或路径步骤，并在完成后进行一次简短自测。"
            ),
            "Create a learning profile first": "先完善学习画像",
            "No assessment or profile data is available yet.": "当前还没有学习画像或评估记录。",
            "Personalized recommendations need at least a profile or assessment record.": (
                "个性化建议至少需要一份学习画像或一次评估结果作为依据。"
            ),
            "Complete the learning profile form before generating further recommendations.": (
                "请先完成学习画像表单，再生成后续学习建议。"
            ),
        }
        return exact.get(text, text)

    def _profile_hints(self, profile: StudentProfile | None) -> dict[str, float]:
        if profile is None:
            return {}
        return {key: float(getattr(profile, key, 0.0) or 0.0) for key in PROFILE_SCORE_KEYS}

    def _clamp(self, value: float) -> float:
        return round(max(0.0, min(100.0, float(value))), 2)


assessment_agent = AssessmentAgent()
