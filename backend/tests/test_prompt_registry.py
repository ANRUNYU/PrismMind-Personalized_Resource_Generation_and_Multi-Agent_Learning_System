from app.services.llm.prompt_registry import render_prompt


def test_teacher_question_prompts_render_literal_latex_braces():
    shared = {
        "course_name": "Advanced mathematics",
        "reference_context": "",
        "additional_requirements": "",
    }
    exercise = render_prompt(
        "exercise",
        {
            **shared,
            "knowledge_points": ["gradient"],
            "difficulty": "medium",
            "question_types": ["short_answer"],
            "question_count": 1,
        },
    )
    paper = render_prompt(
        "paper",
        {
            **shared,
            "exam_scope": "gradient",
            "total_score": 100,
            "duration_minutes": 120,
            "question_distribution": {"short_answer": 2},
            "difficulty_ratio": {"medium": 1},
        },
    )

    assert "_{...}" in exercise and "^{...}" in exercise
    assert "_{...}" in paper and "^{...}" in paper
