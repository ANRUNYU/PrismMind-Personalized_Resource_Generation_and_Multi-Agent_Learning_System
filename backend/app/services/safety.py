import re
from typing import Dict, List


BLOCKED_TERMS = [
    "考试作弊",
    "代写论文",
    "绕过检测",
    "违法",
    "暴力",
    "歧视",
]


def check_user_input(text: str) -> Dict[str, object]:
    """Lightweight content safety guard before an agent starts working."""

    hits = [term for term in BLOCKED_TERMS if term in text]
    return {
        "passed": not hits,
        "blocked_terms": hits,
        "message": "输入通过安全检查" if not hits else "请求包含不适合生成的内容",
    }


def check_academic_content(content: str, references: List[str]) -> Dict[str, object]:
    """Return a transparent anti-hallucination report for generated learning content."""

    has_reference = bool(references)
    risky_patterns = [
        r"百分之百正确",
        r"绝对不会出错",
        r"无需验证",
    ]
    risky_hits = []
    for pattern in risky_patterns:
        risky_hits.extend(re.findall(pattern, content))

    return {
        "passed": not risky_hits,
        "reference_count": len(references),
        "has_knowledge_base_reference": has_reference,
        "risk_notes": risky_hits,
        "anti_hallucination_strategy": [
            "优先检索课程知识库内容作为生成上下文",
            "对推断性建议进行显式标注",
            "为学习资料附带核验清单与参考来源",
        ],
    }


def build_safety_report(input_text: str, generated_content: str, references: List[str]) -> Dict[str, object]:
    input_report = check_user_input(input_text)
    academic_report = check_academic_content(generated_content, references)
    return {
        "input": input_report,
        "academic": academic_report,
        "passed": bool(input_report["passed"]) and bool(academic_report["passed"]),
    }

