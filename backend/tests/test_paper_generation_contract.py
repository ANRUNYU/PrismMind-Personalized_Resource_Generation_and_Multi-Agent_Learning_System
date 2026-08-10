from app.services.generation.question_generation_service import question_generation_service


DISTRIBUTION = "\n".join([
    "单项选择题：20题，每题2分",
    "填空题：10题，每题2分",
    "综合题：3题，每题10分",
    "简答题：2题，每题5分",
])


def test_paper_count_contract_contains_exact_counts():
    contract = question_generation_service.build_paper_count_contract(DISTRIBUTION)

    assert "完整生成 35 道题" in contract
    assert "单项选择题：恰好 20 道" in contract
    assert "简答题：恰好 2 道" in contract


def test_paper_content_validator_rejects_incomplete_sections():
    content = """## 三、试题正文
### 第一部分：单项选择题（每题2分）
1. 示例题
2. 示例题
### 第二部分：填空题（每题2分）
1. 示例题
### 第三部分：综合题（每题10分）
1. 示例题
### 第四部分：简答题（每题5分）
1. 示例题
2. 示例题
## 四、参考答案
略
"""

    issues = question_generation_service.validate_paper_content(content, DISTRIBUTION)

    assert "单项选择题实际识别到 2 道，要求 20 道" in issues
    assert "填空题实际识别到 1 道，要求 10 道" in issues
    assert "综合题实际识别到 1 道，要求 3 道" in issues


def test_paper_content_validator_accepts_exact_numbered_sections():
    parts = ["## 三、试题正文"]
    for label, count in (("单项选择题", 20), ("填空题", 10), ("综合题", 3), ("简答题", 2)):
        parts.append(f"### {label}")
        parts.extend(f"{index}. {label}第{index}题" for index in range(1, count + 1))
    parts.extend(["## 四、参考答案", "答案略"])

    assert question_generation_service.validate_paper_content("\n".join(parts), DISTRIBUTION) == []


def test_paper_content_validator_does_not_count_indented_sub_questions():
    distribution = "综合题：1题，每题10分"
    content = """## 三、试题正文
### 综合题
1. 流媒体系统设计
   1. 分析网络时延
   2. 给出优化方案
## 四、参考答案
略
"""

    assert question_generation_service.validate_paper_content(content, distribution) == []
