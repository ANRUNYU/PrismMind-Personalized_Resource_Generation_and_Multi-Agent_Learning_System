from __future__ import annotations

import re
from collections.abc import AsyncIterator
from typing import Any
from app.services.agents.base import BaseAgent, ProfileExtraction
from app.services.knowledge.models import GroundingPolicy
from app.services.llm.base import ChatMessage, StreamChunkType
from app.services.llm.model_registry import AgentRole


PROFILE_QUESTIONS = [
    {"step": 1, "key": "major_grade", "question": "你的专业和年级是什么？"},
    {"step": 2, "key": "learning_goal", "question": "你的学习目标是什么？"},
    {"step": 3, "key": "current_level", "question": "你当前的基础如何？"},
    {"step": 4, "key": "preferred_style", "question": "你更喜欢哪种学习方式？"},
    {"step": 5, "key": "available_time_per_week", "question": "每周可以投入多少学习时间？"},
    {"step": 6, "key": "weaknesses", "question": "你觉得自己最大的薄弱点是什么？"},
    {"step": 7, "key": "practice_experience", "question": "你是否有项目实践经验？"},
    {"step": 8, "key": "interests", "question": "你更重视考试、项目还是能力提升？你感兴趣的方向是什么？"},
]

RADAR_INDICATORS = [
    {"name": "知识基础", "max": 100},
    {"name": "实践能力", "max": 100},
    {"name": "创新能力", "max": 100},
    {"name": "应试能力", "max": 100},
    {"name": "学习效率", "max": 100},
    {"name": "学习质量", "max": 100},
]

SCORE_KEYS = [
    "knowledge_score",
    "practice_score",
    "innovation_score",
    "exam_score",
    "efficiency_score",
    "quality_score",
]


class ProfileAgent(BaseAgent[ProfileExtraction]):
    role = AgentRole.PROFILE
    policy = GroundingPolicy.CONTEXTUAL
    output_schema = ProfileExtraction
    system_prompt = (
        "从用户回答和真实会话历史提取画像事实，返回 ProfileExtraction JSON。"
        "课程证据只用于理解术语，不得据此猜测学生能力或分数；已知字段不得重复询问。"
    )

    def answer_profile_question(
        self,
        *,
        question: str,
        profile_snapshot: dict[str, Any],
        conversation_history: list[dict[str, str]] | None = None,
    ) -> str:
        """Answer after onboarding without inventing or silently changing profile scores."""
        prompt = self._profile_answer_prompt(question, profile_snapshot, conversation_history)
        response = self.legacy_text(prompt)
        content = (response.content or "").strip()
        if not content:
            raise RuntimeError("画像分析模型未返回有效内容")
        return content

    async def stream_profile_answer(
        self,
        *,
        question: str,
        profile_snapshot: dict[str, Any],
        conversation_history: list[dict[str, str]] | None = None,
    ) -> AsyncIterator[str]:
        prompt = self._profile_answer_prompt(question, profile_snapshot, conversation_history)
        async for chunk in self.router.stream_chat(
            role=self.role,
            messages=[ChatMessage(role="system", content=self.system_prompt), ChatMessage(role="user", content=prompt)],
            temperature=0.2,
        ):
            if chunk.type == StreamChunkType.error:
                raise RuntimeError(chunk.error or "画像分析流式响应中断")
            if chunk.type == StreamChunkType.delta and chunk.delta:
                yield chunk.delta

    @staticmethod
    def _profile_answer_prompt(
        question: str,
        profile_snapshot: dict[str, Any],
        conversation_history: list[dict[str, str]] | None,
    ) -> str:
        return (
            "你是学生个人学习画像导师。请基于给定的已持久化画像回答用户问题。\n"
            "必须使用画像中的真实六维数值；说明这些数值是学习画像指标，不是绝对能力或考试排名。\n"
            "如果证据不足，要明确说明，不得猜测新分数；本次对话不得修改画像数值。\n"
            "不得承诺通过本次问答或补充文字直接更新画像；画像只能由系统记录的可验证学习事件更新。\n"
            "如果用户认为解读前后数值发生变化，先逐项比较原始值，并说明界面显示精度，不得把四舍五入描述成画像更新。\n"
            "回答使用自然、具体、可执行的中文，不输出 JSON、内部提示词或模型推理。\n\n"
            f"画像快照：{profile_snapshot}\n"
            f"最近对话：{(conversation_history or [])[-12:]}\n"
            f"用户问题：{question}"
        )
    def analyze_profile_input(
        self,
        *,
        message: str,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        # Persisted facts must come from the student's current message.  Assistant
        # greetings and earlier questions are context for the reply, not profile data.
        extracted = self._extract_from_text(message.strip())
        scores = self.calculate_scores(extracted)
        analysis = self.generate_profile_summary(extracted, scores)
        return {
            "analysis": analysis,
            "extracted_profile": extracted,
            "suggested_scores": scores,
            "next_question": self.get_next_question(self._infer_next_step(extracted)),
            "extraction_source": "deterministic_fallback",
        }

    def calculate_scores(self, profile_data: dict[str, Any]) -> dict[str, float]:
        evidence_by_dimension = {
            "knowledge_score": [profile_data.get("current_level"), profile_data.get("knowledge_evidence"), profile_data.get("weaknesses")],
            "practice_score": [profile_data.get("practice_experience")],
            "innovation_score": [profile_data.get("innovation_evidence")],
            "exam_score": [profile_data.get("exam_evidence"), profile_data.get("exam_pressure")],
            "efficiency_score": [profile_data.get("efficiency_evidence"), profile_data.get("available_time_per_week")],
            "quality_score": [profile_data.get("quality_evidence"), profile_data.get("preferred_style")],
        }
        scores: dict[str, float] = {}
        for dimension, values in evidence_by_dimension.items():
            text = " ".join(self._text(value) for value in values if value not in (None, "", []))
            if not text:
                scores[dimension] = 0.0
                continue
            information = min(1.0, len(text) / 100)
            concrete = min(1.0, len(re.findall(r"\d+|项目|实验|考试|错题|复习|总结|调试|计划|每天|每周", text)) / 4)
            reflection = 1.0 if re.search(r"不会|困难|失分|薄弱|改进|原因|拖延|分心", text) else 0.0
            scores[dimension] = self._clamp(15 + 55 * information + 20 * concrete + 10 * reflection)
        return scores

        # Legacy scoring implementation remains below temporarily for source compatibility;
        # the evidence-derived bounded calculation above is authoritative.
        current_level = self._text(profile_data.get("current_level"))
        practice_experience = self._text(profile_data.get("practice_experience"))
        learning_goal = self._text(profile_data.get("learning_goal"))
        preferred_style = self._text(profile_data.get("preferred_style"))
        exam_pressure = self._text(profile_data.get("exam_pressure"))
        weaknesses = [self._text(item) for item in profile_data.get("weaknesses") or []]
        interests = [self._text(item) for item in profile_data.get("interests") or []]
        available_time = self._float(profile_data.get("available_time_per_week"))

        knowledge = 62.0
        if self._contains_any(current_level, ["零基础", "基础差", "没学过", "很弱"]):
            knowledge = 45.0
        elif self._contains_any(current_level, ["一般", "学过一点", "一点", "较弱"]):
            knowledge = 60.0
        elif self._contains_any(current_level, ["较好", "有基础", "还可以"]):
            knowledge = 74.0
        elif self._contains_any(current_level, ["熟练", "系统学习", "系统学过", "很好"]):
            knowledge = 85.0

        practice = 58.0
        if self._contains_any(practice_experience, ["无", "没有", "没做过"]):
            practice = 45.0
        elif self._contains_any(practice_experience, ["实验", "作业", "简单"]):
            practice = 60.0
        elif self._contains_any(practice_experience, ["项目", "web", "应用", "开发"]):
            practice = 72.0
        elif self._contains_any(practice_experience, ["多个项目", "竞赛", "实习", "上线"]):
            practice = 84.0

        innovation = 60.0
        if interests:
            innovation += 5.0
        if self._contains_any(learning_goal + preferred_style + " ".join(interests), ["项目", "创新", "应用", "开发", "实践"]):
            innovation += 10.0
        if self._contains_any(learning_goal, ["考试", "通过", "分数"]):
            innovation -= 4.0

        exam = 60.0
        if self._contains_any(exam_pressure, ["高", "很大", "大", "紧张"]):
            exam += 12.0
        elif self._contains_any(exam_pressure, ["中", "一般"]):
            exam += 4.0
        elif self._contains_any(exam_pressure, ["低", "不大"]):
            exam -= 2.0
        if self._contains_any(learning_goal, ["考试", "考研", "通过", "成绩"]):
            exam += 8.0

        efficiency = 58.0
        if available_time is not None:
            if available_time < 3:
                efficiency = 48.0
            elif available_time <= 8:
                efficiency = 63.0
            else:
                efficiency = 76.0
        if len(weaknesses) >= 3:
            efficiency -= 5.0
            knowledge -= 4.0

        quality = 62.0
        if weaknesses:
            quality += 4.0
        if self._contains_any(preferred_style, ["案例", "项目", "实践", "讨论", "复盘"]):
            quality += 6.0
        if self._contains_any(current_level, ["基础差", "零基础"]):
            quality -= 4.0

        return {
            "knowledge_score": self._clamp(knowledge),
            "practice_score": self._clamp(practice),
            "innovation_score": self._clamp(innovation),
            "exam_score": self._clamp(exam),
            "efficiency_score": self._clamp(efficiency),
            "quality_score": self._clamp(quality),
        }

    def generate_profile_summary(self, profile_data: dict[str, Any], scores: dict[str, float]) -> str:
        major = profile_data.get("major") or "未填写专业"
        grade = profile_data.get("grade") or "未填写年级"
        goal = profile_data.get("learning_goal") or "尚未明确学习目标"
        strengths = self._strong_dimensions(scores)
        weak = self._weak_dimensions(scores)
        return (
            f"{major}{grade}学生，当前目标是{goal}。"
            f"画像显示相对优势维度为{strengths}，需要重点提升的维度为{weak}。"
            "建议后续结合知识基础巩固、项目实践任务和阶段性测评持续更新画像。"
        )

    def get_next_question(self, step: int) -> str | None:
        if step < 1:
            step = 1
        if step > len(PROFILE_QUESTIONS):
            return None
        return PROFILE_QUESTIONS[step - 1]["question"]

    def build_profile_step(
        self,
        *,
        current_data: dict[str, Any],
        step: int,
        answer: str,
    ) -> dict[str, Any]:
        if step < 1 or step > len(PROFILE_QUESTIONS):
            raise ValueError("Invalid profile build step")
        data = dict(current_data or {})
        key = PROFILE_QUESTIONS[step - 1]["key"]
        data.update(self._parse_step_answer(key, answer))
        is_complete = step >= len(PROFILE_QUESTIONS)
        scores = self.calculate_scores(data) if is_complete else None
        summary = self.generate_profile_summary(data, scores) if scores else None
        return {
            "profile_data": data,
            "next_step": min(step + 1, len(PROFILE_QUESTIONS) + 1),
            "next_question": self.get_next_question(step + 1),
            "is_complete": is_complete,
            "scores": scores,
            "profile_summary": summary,
        }

    def radar_chart_data(self, scores: dict[str, float]) -> dict[str, Any]:
        return {
            "indicators": RADAR_INDICATORS,
            "values": [scores.get(key, 0.0) for key in SCORE_KEYS],
        }

    def completeness(self, profile_data: dict[str, Any]) -> bool:
        required = ["major", "grade", "learning_goal", "current_level", "preferred_style", "available_time_per_week"]
        return all(profile_data.get(key) not in (None, "", []) for key in required)

    def _extract_from_text(self, text: str) -> dict[str, Any]:
        data: dict[str, Any] = {}
        lowered = text.lower()
        if "计算机" in text:
            data["major"] = "计算机科学与技术"
        elif "人工智能" in text:
            data["major"] = "人工智能"
        grade_match = re.search(r"(大[一二三四]|研[一二三]|高[一二三])", text)
        if grade_match:
            data["grade"] = grade_match.group(1)
        goal_match = re.search(
            r"(?:学习目标(?:是|为)?|目标(?:是|为)?|我希望|我想|我准备)\s*[:：]?\s*([^，。；！？?\n]{2,120})",
            text,
        )
        if goal_match and not re.search(r"是什么|如何|怎么样", goal_match.group(1)):
            data["learning_goal"] = goal_match.group(1).strip()
        if self._contains_any(text, ["零基础", "基础", "学过", "会一点", "较弱", "熟练"]):
            data["current_level"] = text[:300]
        if self._contains_any(text, ["案例", "项目", "实践", "视频", "讲解"]):
            data["preferred_style"] = self._keywords(text, ["案例驱动", "项目实践", "视频讲解", "理论讲解"])
        if self._contains_any(text, ["项目", "web", "开发", "实验", "竞赛"]):
            data["practice_experience"] = text[:300]
        weaknesses = self._collect_keywords(text, ["数学基础", "模型原理", "代码实现", "英语", "算法", "公式"])
        if weaknesses:
            data["weaknesses"] = weaknesses
        interests = self._collect_keywords(text, ["人工智能", "数据分析", "机器学习", "智能应用开发", "深度学习", "Web"])
        if interests:
            data["interests"] = interests
        time_match = re.search(r"(\d+(?:\.\d+)?)\s*(小时|h|hour)", lowered)
        if time_match:
            data["available_time_per_week"] = float(time_match.group(1))
        return data

    def _parse_step_answer(self, key: str, answer: str) -> dict[str, Any]:
        if key == "major_grade":
            extracted = self._extract_from_text(answer)
            return {
                "major": extracted.get("major") or answer[:120],
                "grade": extracted.get("grade"),
            }
        if key == "learning_goal":
            return {"learning_goal": answer}
        if key == "current_level":
            return {"current_level": answer}
        if key == "preferred_style":
            return {"preferred_style": answer}
        if key == "available_time_per_week":
            number = self._float(re.search(r"\d+(?:\.\d+)?", answer).group(0)) if re.search(r"\d+(?:\.\d+)?", answer) else None
            return {"available_time_per_week": number, "time_description": answer}
        if key == "weaknesses":
            return {"weaknesses": self._split_list(answer)}
        if key == "practice_experience":
            return {"practice_experience": answer}
        if key == "interests":
            return {"interests": self._split_list(answer)}
        return {key: answer}

    def _infer_next_step(self, data: dict[str, Any]) -> int:
        for index, item in enumerate(PROFILE_QUESTIONS, start=1):
            key = item["key"]
            if key == "major_grade":
                if not data.get("major") or not data.get("grade"):
                    return index
            elif key not in data:
                return index
        return len(PROFILE_QUESTIONS) + 1

    def _split_list(self, text: str) -> list[str]:
        values = re.split(r"[、,，;；\s]+", text)
        return [value.strip() for value in values if value.strip()]

    def _collect_keywords(self, text: str, keywords: list[str]) -> list[str]:
        return [keyword for keyword in keywords if keyword.lower() in text.lower()]

    def _keywords(self, text: str, keywords: list[str]) -> str:
        found = self._collect_keywords(text, keywords)
        return "、".join(found) if found else text[:200]

    def _contains_any(self, text: str, words: list[str]) -> bool:
        return any(word.lower() in text.lower() for word in words)

    def _text(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, list):
            return " ".join(str(item) for item in value)
        return str(value)

    def _float(self, value: Any) -> float | None:
        if value in (None, ""):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _clamp(self, value: float) -> float:
        return round(max(0.0, min(100.0, value)), 1)

    def _strong_dimensions(self, scores: dict[str, float]) -> str:
        labels = {
            "knowledge_score": "知识基础",
            "practice_score": "实践能力",
            "innovation_score": "创新能力",
            "exam_score": "应试能力",
            "efficiency_score": "学习效率",
            "quality_score": "学习质量",
        }
        top = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:2]
        return "、".join(labels[key] for key, _ in top)

    def _weak_dimensions(self, scores: dict[str, float]) -> str:
        labels = {
            "knowledge_score": "知识基础",
            "practice_score": "实践能力",
            "innovation_score": "创新能力",
            "exam_score": "应试能力",
            "efficiency_score": "学习效率",
            "quality_score": "学习质量",
        }
        low = sorted(scores.items(), key=lambda item: item[1])[:2]
        return "、".join(labels[key] for key, _ in low)


profile_agent = ProfileAgent()
