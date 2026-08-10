from __future__ import annotations

import re
from typing import Any

from app.models.test import QuestionBank
from app.services.agents.test_agent import test_agent
from app.services.generation.reference_context_service import ReferenceContext


class QuestionGenerationService:
    """Shared question engine for student tests, path quizzes and teacher artifacts."""

    def generate(
        self, *, topic: str, difficulty: str, question_count: int, question_types: list[str],
        knowledge_points: list[str], bank_questions: list[QuestionBank],
        reference_context: ReferenceContext | None = None,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        return test_agent.generate_test(
            topic=topic, difficulty=difficulty, question_count=question_count,
            question_types=question_types, knowledge_points=knowledge_points,
            bank_questions=bank_questions,
            evidence_context=reference_context.text if reference_context else "",
        )

    def apply_teacher_spec(self, *, prompt_key: str, payload: dict[str, Any], evidence_text: str) -> dict[str, Any]:
        if prompt_key not in {"exercise", "paper"}:
            return payload
        result = dict(payload)
        result["reference_context"] = evidence_text
        result["evidence_instruction"] = (
            "Questions must be grounded in the supplied reference context; do not claim unsupported provenance."
            if evidence_text else "No reference evidence was selected; generate only from the explicit topic and label it as general generation."
        )
        if prompt_key == "paper":
            result["paper_count_contract"] = self.build_paper_count_contract(
                str(payload.get("question_distribution") or "")
            )
        return result

    def parse_paper_distribution(self, value: str) -> list[dict[str, Any]]:
        specs: list[dict[str, Any]] = []
        for line in str(value or "").splitlines():
            matched = re.search(
                r"^\s*(?P<label>[^：:\n]+?)\s*[：:]\s*(?P<count>\d+)\s*题"
                r"(?:\s*[,，、]\s*每题\s*(?P<score>\d+(?:\.\d+)?)\s*分)?",
                line,
            )
            if not matched:
                continue
            label = self._canonical_paper_type(matched.group("label"))
            specs.append({
                "label": label,
                "count": int(matched.group("count")),
                "score": float(matched.group("score")) if matched.group("score") else None,
            })
        return specs

    def build_paper_count_contract(self, distribution: str) -> str:
        specs = self.parse_paper_distribution(distribution)
        if not specs:
            return "严格按照题型分布逐题生成，不得省略任何题目。"
        total = sum(int(item["count"]) for item in specs)
        lines = [
            f"本试卷必须完整生成 {total} 道题，禁止只生成示例、节选或使用省略号。",
            "各题型必须单独成节，每节从 1 开始连续编号；每一道题都必须有显式题号。",
        ]
        for item in specs:
            score = f"，每题 {item['score']:g} 分" if item["score"] is not None else ""
            lines.append(f"- {item['label']}：恰好 {item['count']} 道{score}，题号 1-{item['count']}。")
        lines.extend([
            "参考答案必须与上述全部题号一一对应。",
            "输出前自行核对各节最后一个题号；题量不一致时必须先补齐再输出。",
        ])
        return "\n".join(lines)

    def validate_paper_content(self, content: str, distribution: str) -> list[str]:
        specs = self.parse_paper_distribution(distribution)
        if not specs:
            return []
        body = self._paper_question_body(content)
        headings = list(re.finditer(r"(?m)^\s{0,3}#{2,6}\s+(.+?)\s*$", body))
        sections: dict[str, str] = {}
        for index, heading in enumerate(headings):
            label = self._canonical_paper_type(heading.group(1))
            if not any(label == spec["label"] for spec in specs):
                continue
            end = headings[index + 1].start() if index + 1 < len(headings) else len(body)
            sections[label] = body[heading.end():end]

        issues: list[str] = []
        for spec in specs:
            label = str(spec["label"])
            section = sections.get(label, "")
            # Only count top-level question numbers; indented numeric sub-questions must not inflate the total.
            actual = len(re.findall(r"(?m)^[ \t]{0,1}(?:\*\*)?\d+\s*[.、．)]\s*", section))
            if not section:
                issues.append(f"缺少“{label}”试题章节（要求 {spec['count']} 道）")
            elif actual != spec["count"]:
                issues.append(f"{label}实际识别到 {actual} 道，要求 {spec['count']} 道")
        return issues

    def build_paper_repair_prompt(self, original_prompt: str, issues: list[str]) -> str:
        return (
            "上一版试卷未通过题量验收，不能保存。请重新生成一份完整试卷，不要解释修正过程。\n"
            f"验收问题：{'；'.join(issues)}\n"
            "必须逐题显式编号并完整输出题干、选项（如适用）、参考答案和评分标准。\n\n"
            f"原始生成要求如下：\n{original_prompt}"
        )

    def _paper_question_body(self, content: str) -> str:
        body_match = re.search(r"(?m)^\s*#{1,6}\s*(?:三[、.．]\s*)?试题正文.*$", content)
        start = body_match.end() if body_match else 0
        answer_match = re.search(r"(?m)^\s*#{1,6}\s*(?:四[、.．]\s*)?参考答案.*$", content[start:])
        end = start + answer_match.start() if answer_match else len(content)
        return content[start:end]

    def _canonical_paper_type(self, value: str) -> str:
        normalized = re.sub(r"[\s*_#]", "", str(value or ""))
        normalized = re.sub(r"^(?:第[一二三四五六七八九十]+部分[：:]?)", "", normalized)
        normalized = re.sub(r"^(?:[一二三四五六七八九十\d]+[、.．])", "", normalized)
        aliases = (
            ("不定项选择题", "不定项选择题"),
            ("多项选择题", "多项选择题"),
            ("多选题", "多项选择题"),
            ("单项选择题", "单项选择题"),
            ("单选题", "单项选择题"),
            ("选择题", "选择题"),
            ("判断题", "判断题"),
            ("填空题", "填空题"),
            ("案例分析题", "案例分析题"),
            ("综合题", "综合题"),
            ("计算题", "计算题"),
            ("编程题", "编程题"),
            ("简答题", "简答题"),
            ("论述题", "论述题"),
            ("名词解释题", "名词解释题"),
        )
        for alias, canonical in aliases:
            if alias in normalized:
                return canonical
        return re.sub(r"[（(].*$", "", normalized).strip("：:")


question_generation_service = QuestionGenerationService()
