from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.core.config import get_settings
from app.models.test import QuestionBank
from app.services.agents.base import BaseAgent, TestGeneration
from app.services.knowledge.models import GroundingPolicy
from app.services.llm.model_registry import AgentRole


CHOICE_OPTIONS = [
    {"key": "A", "text": "准确概括该知识点的核心概念"},
    {"key": "B", "text": "只覆盖了部分相关内容"},
    {"key": "C", "text": "与当前知识点关联较弱"},
    {"key": "D", "text": "常见但容易导致误解的说法"},
]

TOPIC_LABELS = {
    "profile": "学习画像",
    "learning profile": "学习画像",
    "rag": "RAG 辅导",
    "rag tutoring": "RAG 辅导",
    "async task monitoring": "异步任务监控",
    "regularization": "正则化",
    "overfitting": "过拟合",
    "gradient descent": "梯度下降",
    "learning rate": "学习率",
    "function": "函数",
    "python functions": "Python 函数",
    "ml basics": "机器学习基础",
}

SUPPORTED_QUESTION_TYPES = {"single_choice", "multiple_choice", "true_false", "short_answer"}


class GeneratedTestOption(BaseModel):
    key: str
    text: str


class GeneratedTestQuestion(BaseModel):
    id: str | None = None
    question_type: str
    stem: str
    options: list[GeneratedTestOption] = Field(default_factory=list)
    answer: Any
    analysis: str
    keywords: list[str] = Field(default_factory=list)
    knowledge_points: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_common_model_fields(cls, value: Any):
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        normalized.setdefault("stem", normalized.get("question") or normalized.get("title") or "")
        normalized.setdefault("question_type", normalized.get("type") or "short_answer")
        normalized.setdefault("answer", normalized.get("answer_key", normalized.get("correct_answer")))
        normalized.setdefault("analysis", normalized.get("explanation") or normalized.get("rationale") or "")
        raw_options = normalized.get("options") or []
        if isinstance(raw_options, dict):
            normalized["options"] = [{"key": str(key), "text": str(text)} for key, text in raw_options.items()]
        elif isinstance(raw_options, list):
            normalized["options"] = [
                option if isinstance(option, dict) else {"key": chr(65 + index), "text": str(option)}
                for index, option in enumerate(raw_options)
            ]
        return normalized


class GeneratedTestPayload(BaseModel):
    questions: list[GeneratedTestQuestion]

    @model_validator(mode="before")
    @classmethod
    def merge_top_level_answer_key(cls, value: Any):
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        raw_questions = normalized.get("questions") or normalized.get("items") or []
        answer_key = normalized.get("answer_key") or normalized.get("answers") or {}
        if isinstance(raw_questions, list) and isinstance(answer_key, dict):
            merged = []
            for index, question in enumerate(raw_questions, start=1):
                if not isinstance(question, dict):
                    merged.append(question)
                    continue
                item = dict(question)
                question_id = str(item.get("id") or f"q{index}")
                answer_detail = answer_key.get(question_id)
                if item.get("answer") is None and answer_detail is not None:
                    if isinstance(answer_detail, dict):
                        item.update({key: value for key, value in answer_detail.items() if key in {"answer", "analysis", "keywords"}})
                    else:
                        item["answer"] = answer_detail
                merged.append(item)
            normalized["questions"] = merged
        return normalized


class TeachingFocusPayload(BaseModel):
    teaching_focus: list[str] = Field(default_factory=list)


class TestAgent(BaseAgent[TestGeneration]):
    role = AgentRole.TEST
    policy = GroundingPolicy.STRICT
    output_schema = TestGeneration
    system_prompt = "生成 TestGeneration JSON；每道题必须有有效 source_citation_ids，证据不足时减少题量。"

    def _legacy_generate_json(self, prompt: str, **_kwargs):
        return self.legacy_text(prompt)
    def generate_test(
        self,
        *,
        topic: str,
        difficulty: str,
        question_count: int,
        question_types: list[str],
        knowledge_points: list[str],
        bank_questions: list[QuestionBank],
        evidence_context: str = "",
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        # Uploaded/knowledge evidence takes precedence over the generic question bank.
        # Otherwise a ready knowledge document can be selected and persisted while the
        # generated questions never receive its content.
        if bank_questions and not evidence_context.strip():
            rule_questions, rule_answers = self._generate_rule_test(
                topic=topic,
                difficulty=difficulty,
                question_count=question_count,
                question_types=question_types,
                knowledge_points=knowledge_points,
                bank_questions=bank_questions,
            )
            return rule_questions, rule_answers

        prompt = self._test_generation_prompt(
            topic=topic,
            difficulty=difficulty,
            question_count=question_count,
            question_types=question_types,
            knowledge_points=knowledge_points,
            evidence_context=evidence_context,
        )
        try:
            result = self.legacy_structured(prompt, GeneratedTestPayload)
            parsed_payload = result.parsed
            if not isinstance(parsed_payload, GeneratedTestPayload):
                parsed_payload = GeneratedTestPayload.model_validate(parsed_payload)
            parsed = self._from_structured_payload(
                parsed_payload,
                question_count=question_count,
                question_types=question_types,
                scores=self._score_distribution(question_count),
                topic=topic,
            )
        except Exception:
            if get_settings().app_env == "test":
                # CI uses an explicit deterministic fake provider and never calls a paid model.
                return self._generate_rule_test(
                    topic=topic, difficulty=difficulty, question_count=question_count,
                    question_types=question_types, knowledge_points=knowledge_points, bank_questions=[],
                )
            raise RuntimeError("题目生成模型及其备用模型均未返回有效题目结构，请稍后重试")
        return parsed

    def _from_structured_payload(
        self,
        payload: GeneratedTestPayload,
        *,
        question_count: int,
        question_types: list[str],
        scores: list[float],
        topic: str,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        if len(payload.questions) < question_count:
            raise ValueError("模型返回题目数量不足")
        questions: list[dict[str, Any]] = []
        answers: dict[str, Any] = {}
        for index, item in enumerate(payload.questions[:question_count], start=1):
            question_id = f"q{index}"
            question_type = item.question_type
            if question_type not in SUPPORTED_QUESTION_TYPES or question_type not in question_types:
                question_type = question_types[(index - 1) % len(question_types)]
            options = [option.model_dump() for option in item.options]
            if question_type == "true_false" and not options:
                options = [{"key": "true", "text": "正确"}, {"key": "false", "text": "错误"}]
            if question_type in {"single_choice", "multiple_choice"} and len(options) < 2:
                raise ValueError("选择题选项不足")
            normalized = self._normalize_generated_answer(
                {"answer": item.answer, "analysis": item.analysis, "keywords": item.keywords},
                question_type,
                {"analysis": item.analysis, "keywords": item.keywords},
            )
            if normalized is None:
                raise ValueError("题目答案无效")
            generated_question = {
                "id": question_id,
                "question_type": question_type,
                "stem": item.stem.strip(),
                "options": options,
                "knowledge_points": item.knowledge_points or [topic],
                "score": scores[index - 1],
            }
            generated_question["knowledge_points"] = self._diagnostic_topics(generated_question, normalized)
            questions.append(generated_question)
            answers[question_id] = normalized
        return questions, answers

    def _generate_rule_test(
        self,
        *,
        topic: str,
        difficulty: str,
        question_count: int,
        question_types: list[str],
        knowledge_points: list[str],
        bank_questions: list[QuestionBank],
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        questions: list[dict[str, Any]] = []
        answers: dict[str, Any] = {}
        scores = self._score_distribution(question_count)

        for index, bank_question in enumerate(bank_questions[:question_count], start=1):
            question_id = f"q{index}"
            question = self._from_question_bank(bank_question, question_id=question_id, score=scores[index - 1])
            questions.append(question)
            answers[question_id] = self._answer_from_bank(bank_question)

        while len(questions) < question_count:
            index = len(questions) + 1
            question_type = question_types[(index - 1) % len(question_types)]
            point = knowledge_points[(index - 1) % len(knowledge_points)] if knowledge_points else topic
            question_id = f"q{index}"
            question, answer = self._mock_question(
                question_id=question_id,
                question_type=question_type,
                topic=topic,
                point=point,
                difficulty=difficulty,
                score=scores[index - 1],
            )
            questions.append(question)
            answers[question_id] = answer

        return questions, answers

    def grade(
        self,
        *,
        questions: list[dict[str, Any]],
        answers: dict[str, Any],
        user_answers: dict[str, Any],
    ) -> dict[str, Any]:
        results: list[dict[str, Any]] = []
        total = 0.0
        correct_topics: set[str] = set()
        incorrect_topics: set[str] = set()
        for question in questions:
            question_id = str(question.get("id"))
            max_score = float(question.get("score") or 0.0)
            answer_detail = answers.get(question_id, {})
            result = self._grade_one(
                question=question,
                answer_detail=answer_detail,
                user_answer=user_answers.get(question_id),
                max_score=max_score,
            )
            total += float(result["score"])
            topics = [str(item) for item in result.get("knowledge_points") or []]
            if result["is_correct"]:
                correct_topics.update(topics)
            else:
                incorrect_topics.update(topics)
            results.append(result)

        score = round(max(0.0, min(100.0, total)), 2)
        mastered_topics = sorted(correct_topics - incorrect_topics)
        weak_topics = sorted(incorrect_topics)
        base_result = {
            "score": score,
            "analysis": self._analysis(score, results),
            "feedback": self._feedback(score, sorted(incorrect_topics)),
            "question_results": results,
            "correct_topics": mastered_topics,
            "incorrect_topics": weak_topics,
        }
        # Grading, persistence and learning-path unlocking must not wait for an
        # optional model-written narrative.  The deterministic analysis above
        # is derived from the submitted answers and remains fully auditable.
        return base_result

    def diagnostic_topics(self, question: dict[str, Any], answer_detail: dict[str, Any]) -> list[str]:
        return self._diagnostic_topics(question, answer_detail)

    def feedback_for_score(self, score: float, incorrect_topics: list[str]) -> str:
        return self._feedback(score, incorrect_topics)

    def summarize_teaching_focus(
        self,
        *,
        diagnostic_context: dict[str, Any],
        fallback: list[str],
    ) -> list[str]:
        """Use the assessment model to turn real class errors into teaching actions."""
        weak_topics = diagnostic_context.get("weak_topics") or []
        if not weak_topics:
            return fallback
        prompt = (
            "你是课程教学诊断专家。请只依据下面的班级真实作答统计，归纳教师下一节课的教学方法与课堂着重点。\n"
            "要求：\n"
            "1. 每条建议必须对应一个具体薄弱知识点，并结合实际错题题型、常见错误答案、标准答案或解析判断误区；\n"
            "2. 给出适合该误区的具体教学活动、讲解切入点和当堂检验方式，不要套用统一教学流程；\n"
            "3. 薄弱率达到50%时面向全班，低于50%时安排分组或个别辅导；\n"
            "4. 禁止输出‘先用诊断问题定位误区，再做典型例题示范、变式练习和错因复盘’以及同义套话；\n"
            "5. 不得编造统计中没有出现的学生表现或知识点；每条60至140字，最多5条；\n"
            "6. 只返回 JSON：{\"teaching_focus\":[\"建议1\",\"建议2\"]}。\n\n"
            f"班级诊断数据：{json.dumps(diagnostic_context, ensure_ascii=False)}"
        )
        try:
            response = self.legacy_structured(prompt, TeachingFocusPayload)
            parsed = response.parsed
            if not isinstance(parsed, TeachingFocusPayload):
                parsed = TeachingFocusPayload.model_validate(parsed)
            suggestions = [str(item).strip() for item in parsed.teaching_focus if str(item).strip()]
            forbidden = ("诊断问题定位误区", "典型例题示范、变式练习和错因复盘")
            suggestions = [item for item in suggestions if not any(marker in item for marker in forbidden)]
            if suggestions:
                return list(dict.fromkeys(suggestions))[:5]
        except Exception:
            # Class diagnostics must remain available if the optional model call fails.
            pass
        return fallback

    def _test_generation_prompt(
        self,
        *,
        topic: str,
        difficulty: str,
        question_count: int,
        question_types: list[str],
        knowledge_points: list[str],
        evidence_context: str = "",
    ) -> str:
        points = "\n".join(f"- {self._topic_label(point)}" for point in knowledge_points[:12]) or "- 未提供，围绕主题生成"
        types = "、".join(question_types)
        evidence_prefix = f"Actual evidence supplied to the model:\n{evidence_context}\n\n" if evidence_context else "No evidence selected; generate a general-topic test.\n\n"
        return evidence_prefix + (
            "请为课程作业/测试生成题目。\n"
            f"主题：{topic}\n"
            f"难度：{difficulty}\n"
            f"题目数量：{question_count}\n"
            f"允许题型：{types}\n"
            f"课程知识库片段或知识点：\n{points}\n\n"
            "要求：\n"
            "1. 全部题干、选项、解析和关键词使用中文。\n"
            "2. 题型必须从允许题型中选择。\n"
            "3. 每道题都要有 answer_key，选择题答案用选项 key，判断题答案用 true/false。\n"
            "4. 不要输出数据库 ID、课程 ID、文档 ID 等内部标识。\n"
            "5. 不要编造资料来源；知识库片段不足时，基于主题生成通用教学题。\n"
            "6. 每道题的 knowledge_points 必须填写该题实际考查的具体概念（如“哈希冲突”“快速排序复杂度”），"
            "禁止填写课程名、文档名、“基本知识”或整段资料摘要。\n"
            "7. 每道题必须给出明确标准答案、中文原因解析和可用于简答题判分的核心关键词。"
        )

    def _parse_generated_test(
        self,
        content: str,
        *,
        question_count: int,
        question_types: list[str],
        scores: list[float],
        topic: str,
        difficulty: str,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]] | None:
        try:
            payload = json.loads(self._strip_json_code_fence(content))
        except json.JSONDecodeError:
            return None
        if not isinstance(payload, dict):
            return None
        raw_questions = payload.get("questions")
        raw_answer_key = payload.get("answer_key") or payload.get("answers") or {}
        if not isinstance(raw_questions, list) or not isinstance(raw_answer_key, dict):
            return None

        questions: list[dict[str, Any]] = []
        answers: dict[str, Any] = {}
        for index, raw_question in enumerate(raw_questions[:question_count], start=1):
            if not isinstance(raw_question, dict):
                return None
            question_id = f"q{index}"
            requested_type = question_types[(index - 1) % len(question_types)]
            question_type = str(raw_question.get("question_type") or requested_type)
            if question_type not in SUPPORTED_QUESTION_TYPES:
                question_type = requested_type if requested_type in SUPPORTED_QUESTION_TYPES else "short_answer"
            stem = str(raw_question.get("stem") or "").strip()
            if not stem:
                return None
            options = self._normalize_options(raw_question.get("options") or [])
            if question_type == "true_false" and not options:
                options = [{"key": "true", "text": "正确"}, {"key": "false", "text": "错误"}]
            if question_type in {"single_choice", "multiple_choice"} and not options:
                return None
            points = [self._topic_label(str(item)) for item in raw_question.get("knowledge_points") or [topic]]
            question = {
                "id": question_id,
                "question_type": question_type,
                "stem": stem,
                "options": options,
                "knowledge_points": points,
                "score": scores[index - 1],
            }
            original_id = str(raw_question.get("id") or question_id)
            answer_detail = raw_answer_key.get(original_id) or raw_answer_key.get(question_id) or raw_question.get("answer")
            normalized_answer = self._normalize_generated_answer(answer_detail, question_type, raw_question)
            if normalized_answer is None:
                return None
            questions.append(question)
            answers[question_id] = normalized_answer

        if len(questions) != question_count:
            return None
        return questions, answers

    def _normalize_generated_answer(
        self,
        answer_detail: Any,
        question_type: str,
        raw_question: dict[str, Any],
    ) -> dict[str, Any] | None:
        if isinstance(answer_detail, dict):
            answer = answer_detail.get("answer")
            analysis = answer_detail.get("analysis") or raw_question.get("analysis")
            keywords = answer_detail.get("keywords") or raw_question.get("keywords") or []
        else:
            answer = answer_detail
            analysis = raw_question.get("analysis")
            keywords = raw_question.get("keywords") or []
        if answer is None:
            return None
        if question_type == "multiple_choice" and not isinstance(answer, list):
            answer = [item.strip().upper() for item in str(answer).replace(";", ",").split(",") if item.strip()]
        if question_type == "true_false":
            answer = self._as_bool(answer)
            if answer is None:
                return None
        if question_type == "single_choice":
            answer = str(answer).strip().upper()
        if not isinstance(keywords, list):
            keywords = self._keywords_from_answer(str(answer))
        return {
            "answer": answer,
            "analysis": str(analysis or "本题解析由模型生成，并已按当前题目结构校验。"),
            "keywords": [str(item) for item in keywords][:8],
        }

    def _enhance_grade_feedback(self, base_result: dict[str, Any]) -> dict[str, Any]:
        fallback_json = json.dumps(
            {"analysis": base_result["analysis"], "feedback": base_result["feedback"]},
            ensure_ascii=False,
        )
        prompt = (
            "请基于学生测验结果生成中文学习反馈。\n"
            f"得分：{base_result['score']}\n"
            f"薄弱知识点：{base_result['incorrect_topics']}\n"
            f"优势知识点：{base_result['correct_topics']}\n"
            "要求输出 JSON，包含 analysis 和 feedback。不要输出英文 Review/high/weak-topic 等词。"
        )
        result = self._legacy_generate_json(
            prompt,
            system_prompt="你是个性化学习评估助手。请使用中文，给出具体、温和、可执行的学习建议。",
            schema_hint='{"analysis":"当前表现分析","feedback":"下一步学习建议"}',
            temperature=0.2,
            fallback=fallback_json,
        )
        try:
            payload = json.loads(self._strip_json_code_fence(result.content))
        except json.JSONDecodeError:
            return base_result
        if isinstance(payload, dict):
            analysis = str(payload.get("analysis") or "").strip()
            feedback = str(payload.get("feedback") or "").strip()
            if analysis:
                base_result["analysis"] = analysis
            if feedback:
                base_result["feedback"] = feedback
        return base_result

    def _strip_json_code_fence(self, content: str) -> str:
        text = str(content or "").strip()
        if text.startswith("```"):
            text = text.removeprefix("```json").removeprefix("```").strip()
            if text.endswith("```"):
                text = text[:-3].strip()
        return text

    def _from_question_bank(self, question: QuestionBank, *, question_id: str, score: float) -> dict[str, Any]:
        question_type = question.question_type if question.question_type in SUPPORTED_QUESTION_TYPES else "short_answer"
        options = self._normalize_options(question.options or [])
        if question_type == "true_false" and not options:
            options = [{"key": "true", "text": "正确"}, {"key": "false", "text": "错误"}]
        return {
            "id": question_id,
            "question_type": question_type,
            "stem": self._localize_text(question.stem),
            "options": options,
            "knowledge_points": [self._topic_label(str(item)) for item in question.knowledge_points or []],
            "score": score,
        }

    def _answer_from_bank(self, question: QuestionBank) -> dict[str, Any]:
        question_type = question.question_type if question.question_type in SUPPORTED_QUESTION_TYPES else "short_answer"
        return {
            "answer": self._parse_answer(question.answer, question_type),
            "analysis": self._localize_text(question.analysis) if question.analysis else "该解析来自题库。",
            "keywords": self._keywords_from_answer(question.answer),
        }

    def _mock_question(
        self,
        *,
        question_id: str,
        question_type: str,
        topic: str,
        point: str,
        difficulty: str,
        score: float,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        base = {
            "id": question_id,
            "question_type": question_type,
            "knowledge_points": [self._topic_label(point)],
            "score": score,
        }
        topic_label = self._topic_label(topic)
        point_label = self._topic_label(point)
        difficulty_label = {
            "easy": "基础",
            "normal": "常规",
            "medium": "中等",
            "hard": "困难",
            "mixed": "混合",
        }.get(difficulty, difficulty)
        if question_type == "single_choice":
            question = {
                **base,
                "stem": f"在“{topic_label}”学习中，哪一项最能准确描述“{point_label}”？",
                "options": CHOICE_OPTIONS,
            }
            answer = {
                "answer": "A",
                "analysis": f"选项 A 概括了“{point_label}”的核心含义，其余选项要么不完整，要么容易造成误解。",
                "keywords": [point_label],
            }
        elif question_type == "multiple_choice":
            question = {
                **base,
                "stem": f"学习“{point_label}”时，哪些做法有助于巩固理解？请选择所有合适选项。",
                "options": [
                    {"key": "A", "text": "先明确概念定义"},
                    {"key": "B", "text": "结合例子理解应用场景"},
                    {"key": "C", "text": "忽略相关前置概念"},
                    {"key": "D", "text": "练习后复盘错因"},
                ],
            }
            answer = {
                "answer": ["A", "B", "D"],
                "analysis": "明确概念、结合例子和复盘错因都能帮助形成稳定理解；忽略前置概念会增加后续学习难度。",
                "keywords": [point_label, "定义", "例子", "复盘"],
            }
        elif question_type == "true_false":
            question = {
                **base,
                "stem": f"判断题：理解“{point_label}”通常需要概念讲解和练习应用相结合。",
                "options": [{"key": "true", "text": "正确"}, {"key": "false", "text": "错误"}],
            }
            answer = {
                "answer": True,
                "analysis": "概念讲解帮助建立理解框架，练习应用可以检验并巩固掌握程度。",
                "keywords": [point_label, "练习"],
            }
        else:
            question = {
                **base,
                "stem": f"请简要说明“{topic_label}”中的“{point_label}”，并举一个例子。难度：{difficulty_label}。",
                "options": [],
            }
            answer = {
                "answer": f"可以从定义、适用条件和具体例子三个方面说明{point_label}。",
                "analysis": "简答题采用关键词覆盖度进行规则评分，重点关注概念、条件和例子是否表达清楚。",
                "keywords": [point_label, "定义", "例子"],
            }
        return question, answer

    def _grade_one(
        self,
        *,
        question: dict[str, Any],
        answer_detail: dict[str, Any],
        user_answer: Any,
        max_score: float,
    ) -> dict[str, Any]:
        qtype = str(question.get("question_type"))
        correct_answer = answer_detail.get("answer")
        is_correct = False
        earned = 0.0
        analysis = answer_detail.get("analysis") or ""
        diagnostic_topics = self._diagnostic_topics(question, answer_detail)

        if qtype == "single_choice":
            is_correct = str(user_answer).strip().upper() == str(correct_answer).strip().upper()
            earned = max_score if is_correct else 0.0
        elif qtype == "multiple_choice":
            is_correct = self._as_set(user_answer) == self._as_set(correct_answer)
            earned = max_score if is_correct else 0.0
        elif qtype == "true_false":
            is_correct = self._as_bool(user_answer) == self._as_bool(correct_answer)
            earned = max_score if is_correct else 0.0
        else:
            keywords = [str(item).lower() for item in answer_detail.get("keywords") or []]
            answer_text = str(user_answer or "").lower()
            if keywords:
                hits = sum(1 for keyword in keywords if keyword and keyword in answer_text)
                ratio = hits / len(keywords)
                earned = round(max_score * ratio, 2)
                is_correct = ratio >= 0.8
                analysis = f"{analysis} 系统采用关键词覆盖度进行规则评分：命中 {hits}/{len(keywords)}。"
            else:
                earned = 0.0
                is_correct = False
                analysis = f"{analysis} 未配置可用关键词，简答题按规则计 0 分。"

        return {
            "question_id": question.get("id"),
            "question_type": qtype,
            "user_answer": user_answer,
            "correct_answer": correct_answer,
            "is_correct": is_correct,
            "score": round(earned, 2),
            "max_score": max_score,
            "analysis": "回答正确。" if is_correct and not analysis else self._localize_text(analysis),
            "knowledge_points": diagnostic_topics,
        }

    def _diagnostic_topics(self, question: dict[str, Any], answer_detail: dict[str, Any]) -> list[str]:
        """Return the concrete concept tested, not a broad course/document label."""
        stem = str(question.get("stem") or "").strip()
        concept_patterns = (
            r"([A-Za-z][A-Za-z0-9+.#\- ]{1,24}|[\u4e00-\u9fff]{2,18})的(?:特点|核心|性质|平均|时间复杂度|主要|作用|定义|实现|区别)",
            r"属于([A-Za-z][A-Za-z0-9+.#\- ]{1,24}|[\u4e00-\u9fff]{2,18})",
            r"(?:关于|针对)[“\"]?([A-Za-z][A-Za-z0-9+.#\- ]{1,24}|[\u4e00-\u9fff]{2,18})[”\"]?",
        )
        for pattern in concept_patterns:
            matched = re.search(pattern, stem)
            if matched:
                candidate = matched.group(1).strip(" ：:，,。？?‘’“”\"")
                if self._is_specific_diagnostic_topic(candidate):
                    return [candidate]

        for raw_keyword in answer_detail.get("keywords") or []:
            candidate = str(raw_keyword).strip()
            if self._is_specific_diagnostic_topic(candidate):
                return [candidate]

        original = [
            str(item).strip()
            for item in question.get("knowledge_points") or []
            if self._is_specific_diagnostic_topic(str(item).strip())
        ]
        return original[:2] or ["当前题目对应知识点"]

    def _is_specific_diagnostic_topic(self, value: str) -> bool:
        normalized = str(value or "").strip()
        if not 2 <= len(normalized) <= 30:
            return False
        generic_markers = (
            "基本知识", "知识总结", "课程知识", "全部内容", "当前知识点",
            "定义", "例子", "特点", "原理", "应用", "复盘", "条件",
        )
        return not any(marker == normalized or marker in normalized for marker in generic_markers)

    def _score_distribution(self, count: int) -> list[float]:
        base = round(100 / count, 2)
        scores = [base for _ in range(count)]
        scores[-1] = round(100 - sum(scores[:-1]), 2)
        return scores

    def _normalize_options(self, options: list[Any]) -> list[dict[str, str]]:
        normalized: list[dict[str, str]] = []
        for index, option in enumerate(options):
            if isinstance(option, dict):
                key = str(option.get("key") or chr(65 + index))
                text = str(option.get("text") or option.get("label") or option.get("value") or "")
            else:
                key = chr(65 + index)
                text = str(option)
            if text:
                normalized.append({"key": key, "text": text})
        return normalized

    def _parse_answer(self, answer: str | None, question_type: str) -> Any:
        if answer is None:
            return None
        value = answer.strip()
        if question_type == "multiple_choice":
            return [item.strip().upper() for item in value.replace(";", ",").split(",") if item.strip()]
        if question_type == "true_false":
            return self._as_bool(value)
        return value

    def _keywords_from_answer(self, answer: str | None) -> list[str]:
        if not answer:
            return []
        return [item.strip() for item in answer.replace(";", ",").replace(" ", ",").split(",") if len(item.strip()) > 1][:5]

    def _as_set(self, value: Any) -> set[str]:
        if isinstance(value, list):
            return {str(item).strip().upper() for item in value}
        if isinstance(value, (tuple, set)):
            return {str(item).strip().upper() for item in value}
        return {item.strip().upper() for item in str(value or "").replace(";", ",").split(",") if item.strip()}

    def _as_bool(self, value: Any) -> bool | None:
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"true", "t", "1", "yes", "y", "right", "correct"}:
            return True
        if text in {"false", "f", "0", "no", "n", "wrong", "incorrect"}:
            return False
        return None

    def _analysis(self, score: float, results: list[dict[str, Any]]) -> str:
        correct = sum(1 for item in results if item["is_correct"])
        return f"本次测试得分 {score} 分，共有 {correct}/{len(results)} 道题完全答对；简答题采用关键词覆盖度进行规则评分。"

    def _feedback(self, score: float, incorrect_topics: list[str]) -> str:
        if score >= 85:
            return "本次表现较好，可以尝试更高难度练习，并用自己的话复述关键概念和解题思路。"
        if score >= 60:
            topics = self._topic_list(incorrect_topics[:3]) if incorrect_topics else "本次错题"
            return f"基础掌握基本稳定，建议重点复习{topics}，并完成一道针对性巩固练习。"
        topics = self._topic_list(incorrect_topics[:3]) if incorrect_topics else "核心前置知识"
        return f"仍需加强复习，建议先回顾{topics}，再推进下一步学习路径。"

    def _topic_label(self, topic: str | None) -> str:
        value = str(topic or "").strip()
        if not value:
            return "当前知识点"
        lowered = value.lower()
        if lowered in TOPIC_LABELS:
            return TOPIC_LABELS[lowered]
        if value.isdigit():
            return f"知识点 {value}"
        return value

    def _topic_list(self, topics: list[str]) -> str:
        return "、".join(self._topic_label(topic) for topic in topics)

    def _localize_text(self, value: str | None) -> str:
        text = str(value or "").strip()
        if not text:
            return text
        exact = {
            "This answer comes from the question bank.": "该解析来自题库。",
            "Correct.": "回答正确。",
        }
        return exact.get(text, text)


test_agent = TestAgent()
