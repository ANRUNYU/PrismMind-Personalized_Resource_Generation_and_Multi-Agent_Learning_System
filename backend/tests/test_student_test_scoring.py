from __future__ import annotations

from app.services.agents.test_agent import test_agent


def test_student_test_scoring_core_question_types():
    questions = [
        {
            "id": "q1",
            "question_type": "single_choice",
            "score": 25,
            "knowledge_points": ["函数"],
        },
        {
            "id": "q2",
            "question_type": "multiple_choice",
            "score": 25,
            "knowledge_points": ["循环"],
        },
        {
            "id": "q3",
            "question_type": "true_false",
            "score": 25,
            "knowledge_points": ["判断"],
        },
        {
            "id": "q4",
            "question_type": "short_answer",
            "score": 25,
            "knowledge_points": ["变量"],
        },
    ]
    answers = {
        "q1": {"answer": "A", "analysis": "single", "keywords": []},
        "q2": {"answer": ["A", "C"], "analysis": "multi", "keywords": []},
        "q3": {"answer": True, "analysis": "tf", "keywords": []},
        "q4": {"answer": "变量用于保存数据", "analysis": "short", "keywords": ["变量", "数据"]},
    }
    user_answers = {
        "q1": "a",
        "q2": ["C", "A"],
        "q3": "true",
        "q4": "变量可以保存数据",
    }

    result = test_agent.grade(questions=questions, answers=answers, user_answers=user_answers)

    assert result["score"] == 100
    assert all(item["is_correct"] for item in result["question_results"])


def test_short_answer_keyword_partial_credit():
    questions = [
        {
            "id": "q1",
            "question_type": "short_answer",
            "score": 30,
            "knowledge_points": ["函数"],
        }
    ]
    answers = {
        "q1": {
            "answer": "函数封装可复用逻辑",
            "analysis": "short",
            "keywords": ["函数", "复用", "逻辑"],
        }
    }

    result = test_agent.grade(
        questions=questions,
        answers=answers,
        user_answers={"q1": "函数可以复用"},
    )

    question_result = result["question_results"][0]
    assert question_result["score"] == 20
    assert question_result["is_correct"] is False
    assert "关键词覆盖度" in question_result["analysis"]


def test_diagnostics_use_question_concepts_instead_of_broad_course_label():
    questions = [
        {
            "id": "q1",
            "question_type": "single_choice",
            "stem": "快速排序的平均时间复杂度是多少？",
            "score": 50,
            "knowledge_points": ["数据结构基本知识"],
        },
        {
            "id": "q2",
            "question_type": "short_answer",
            "stem": "哈希表的核心思想是什么？",
            "score": 50,
            "knowledge_points": ["数据结构基本知识"],
        },
    ]
    answers = {
        "q1": {"answer": "B", "analysis": "平均为 O(n log n)", "keywords": ["快速排序"]},
        "q2": {"answer": "哈希映射", "analysis": "使用哈希函数定位", "keywords": ["哈希表", "哈希函数"]},
    }
    result = test_agent.grade(
        questions=questions,
        answers=answers,
        user_answers={"q1": "A", "q2": "不知道"},
    )

    assert result["incorrect_topics"] == ["哈希表", "快速排序"]
    assert all("基本知识" not in topic for topic in result["incorrect_topics"])
