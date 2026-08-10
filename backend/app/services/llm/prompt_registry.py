from __future__ import annotations

from collections import defaultdict
from typing import Any


class SafeFormatDict(defaultdict):
    def __missing__(self, key: str) -> str:
        return "未提供"


def _format_value(value: Any) -> str:
    if value is None or value == "":
        return "未提供"
    if isinstance(value, list):
        return "、".join(str(item) for item in value) if value else "未提供"
    return str(value)


PROMPT_REGISTRY: dict[str, str] = {
    "training_plan": """请面向高校专业建设场景，生成一份完整、可直接给教师修改使用的人才培养方案。

要求：
- 输出 Markdown。
- 不要出现“作为一个 AI”等表述。
- 内容应体现专业定位、目标、毕业要求、课程体系、实践体系和实施建议。
- 语言正式、结构清晰、可用于后续导出。

输入信息：
- 方案名称：{program_name}
- 教育层次：{education_level}
- 专业名称：{major_name}
- 培养目标：{training_objectives}
- 毕业要求：{graduation_requirements}
- 核心课程：{core_courses}
- 行业需求：{industry_requirements}
- 其他要求：{additional_requirements}
- 所选班级实时学情：{class_profile_context}

请根据班级整体水平调整培养起点、能力梯度、分层培养任务和评价要求；画像数据不足时明确采用通用方案，不得虚构学生情况。

请按以下结构输出：
# {major_name}专业人才培养方案
## 一、专业定位
## 二、培养目标
## 三、毕业要求
## 四、课程体系设计
## 五、实践教学体系
## 六、能力达成关系
## 七、实施建议
""",
    "course_design": """请生成一份高校课程层面的课程教学设计，供教师进行课程建设和教学实施。

要求：
- 输出 Markdown。
- 内容要包含课程目标、教学内容、学时安排、教学方法、考核方式和课程资源建议。
- 结构完整，不要只给提纲。

输入信息：
- 课程名称：{course_name}
- 面向学生：{target_students}
- 总学时：{total_hours}
- 课程目标：{course_objectives}
- 重点主题：{key_topics}
- 参考资料：{references}
- 其他要求：{additional_requirements}
- 所选班级实时学情：{class_profile_context}

课程目标、内容难度、教学活动和评价设计必须响应所选班级的整体水平与高频薄弱点。

请按以下结构输出：
# {course_name}课程教学设计
## 一、课程基本信息
## 二、课程目标
## 三、教学内容与学时安排
## 四、教学方法
## 五、考核方式
## 六、课程资源建议
""",
    "teaching_design": """请生成一份面向课堂实施的教学活动设计，强调学情分析、教学目标、流程与评价。

要求：
- 输出 Markdown。
- 适合教师直接用于备课。
- 教学流程要包含导入、讲授、活动、练习、总结与课后任务。

输入信息：
- 课程名称：{course_name}
- 教学主题：{lesson_topic}
- 面向学生：{target_students}
- 教学目标：{teaching_objectives}
- 重点：{key_points}
- 难点：{difficult_points}
- 学时：{teaching_hours}
- 教学方法：{teaching_methods}
- 其他要求：{additional_requirements}

请按以下结构输出：
# {lesson_topic}教学活动设计
## 一、教学主题
## 二、学情分析
## 三、教学目标
## 四、重点与难点
## 五、教学流程
## 六、课堂活动设计
## 七、评价方式
""",
    "exercise": """请基于课程知识点批量生成习题，题目应有层次、有解析，便于教师筛选后进入题库。

要求：
- 输出 Markdown。
- 根据题型要求组织内容。
- 必须包含参考答案与解析。
- 难度和数量要与输入一致。
- 标题、加粗、列表、表格和代码块必须使用合法 Markdown，不要转义 Markdown 标记。
- 数学公式使用合法 LaTeX：行内公式用 $...$，独立公式用 $$...$$；上下标必须使用 _{{...}} 或 ^{{...}}。

输入信息：
- 课程名称：{course_name}
- 知识点：{knowledge_points}
- 难度：{difficulty}
- 题型：{question_types}
- 题目数量：{question_count}
- 参考材料：{reference_context}
- 其他要求：{additional_requirements}
- 所选班级实时学情：{class_profile_context}

请依据班级整体达成率和画像水平调整基础题、巩固题与提高题的比例，并优先覆盖班级高频薄弱点。

请按以下结构输出：
# {course_name}课程习题
## 一、知识点范围
## 二、选择题
## 三、填空题
## 四、简答题
## 五、应用题/编程题
## 六、参考答案与解析
""",
    "paper": """请生成一份高校课程考试试卷，需体现考试范围、题型分布、难度比例、参考答案和评分标准。

要求：
- 输出 Markdown。
- 试题正文要清晰分题号。
- 评分标准要可操作。
- 试卷总分和考试时长要与输入一致。
- 标题、加粗、列表、表格和代码块必须使用合法 Markdown，不要转义 Markdown 标记。
- 数学公式使用合法 LaTeX：行内公式用 $...$，独立公式用 $$...$$；上下标必须使用 _{{...}} 或 ^{{...}}。

输入信息：
- 课程名称：{course_name}
- 考试范围：{exam_scope}
- 总分：{total_score}
- 时长：{duration_minutes}
- 题型分布：{question_distribution}
- 难度比例：{difficulty_ratio}
- 参考材料：{reference_context}
- 其他要求：{additional_requirements}
- 所选班级实时学情：{class_profile_context}

请结合班级整体水平校准试卷难度、认知层次和薄弱知识点覆盖，不得只机械采用通用难度模板。

题量硬性契约：
{paper_count_contract}

请按以下结构输出：
# {course_name}课程试卷
## 一、试卷说明
## 二、题型分布
## 三、试题正文
## 四、参考答案
## 五、评分标准
""",
    "project_practice": """请生成一份项目式实践教学方案，强调真实任务、团队协作、成果提交和评价标准。

要求：
- 输出 Markdown。
- 内容要适用于高校课程实践或综合实训。
- 任务拆解要具体，评价标准要可量化。

输入信息：
- 课程名称：{course_name}
- 面向学生：{target_students}
- 项目主题：{project_topic}
- 预期能力：{expected_skills}
- 项目周期：{project_duration}
- 团队规模：{team_size}
- 交付物：{deliverables}
- 评价标准：{evaluation_criteria}
- 其他要求：{additional_requirements}

请按以下结构输出：
# {project_topic}项目实践方案
## 一、项目背景
## 二、项目目标
## 三、项目任务
## 四、团队分工
## 五、实施步骤
## 六、成果提交要求
## 七、评价标准
## 八、拓展方向
""",
}


PROMPT_REGISTRY.update(
    {
        "student_tutoring_ask": """You are a patient AI tutor for an education platform.
Task: answer the student's question with clear learning guidance.

Student question:
{question}

Difficulty level:
{difficulty}

Expected response format:
{response_format}

Reference context:
{reference_context}

Rules:
- Use the reference context when it is relevant, but do not copy it verbatim.
- If the reference context is insufficient, say that the available materials do not fully cover the question, then provide a general explanation.
- Explain step by step and help the student understand the idea, not just memorize an answer.
- For markdown format, use sections such as "简要解释", "核心概念", "例子", and "学习建议".
- For plain format, return concise plain text without markdown headings.
""",
        "student_tutoring_hint": """You are a Socratic tutor.
Task: give hints for the student's question without revealing a complete final answer.

Student question:
{question}

Student context:
{context}

Difficulty level:
{difficulty}

Expected response format:
{response_format}

Reference context:
{reference_context}

Rules:
- Do not give a full answer.
- Give thinking directions, key terms, and one or two guiding questions.
- Use reference context when helpful, but avoid long copying.
- For markdown format, use short sections like "思考方向", "关键词", and "下一步".
- For plain format, return concise plain text.
""",
        "student_tutoring_explain": """You are an AI tutor explaining a concept to a student.
Task: explain the concept clearly and help the student build intuition.

Concept:
{concept}

Difficulty level:
{difficulty}

Expected response format:
{response_format}

Reference context:
{reference_context}

Rules:
- Include definition, intuitive explanation, example, and common misconceptions.
- Use reference context when relevant, but do not copy it verbatim.
- If the available materials do not fully cover the concept, mention that limitation and provide a general explanation.
- For markdown format, use sections such as "概念定义", "直观理解", "例子", and "常见误区".
- For plain format, return concise plain text.
""",
        "student_resource_generation": """Generate personalized learning resources for a student.

Topic:
{topic}

Resource types:
{resource_types}

Difficulty:
{difficulty}

Knowledge points:
{knowledge_points}

Student profile:
{profile_context}

Reference context:
{reference_context}

Additional requirements:
{additional_requirements}

Rules:
- Output Markdown.
- The final answer must be written in Chinese for the student-facing interface.
- Adapt to the student's profile and weaknesses.
- Use reference context when relevant, but do not copy long passages verbatim.
- If reference context is insufficient, use general learning design principles.
- Do not use conversational phrases like "as an AI".
- Use valid Markdown and valid LaTeX. Put inline math in $...$ and display math in $$...$$; always brace subscripts and superscripts.
""",
        "student_single_resource_generation": """Generate one personalized learning resource for a student.

Topic:
{topic}

Resource type:
{resource_type} / {resource_type_name}

Difficulty:
{difficulty}

Knowledge points:
{knowledge_points}

Student profile:
{profile_context}

Reference context:
{reference_context}

Additional requirements:
{additional_requirements}

Rules:
- Output Markdown.
- The final answer must be written in Chinese for the student-facing interface.
- Make the resource suitable for self-study.
- Adapt the depth, examples, and tasks to the student profile.
- For course_document: produce a structured course document with objectives, sections, examples, tasks, and a summary.
- For mind_map: produce a hierarchical Markdown mind map with clear parent-child relationships, not prose notes.
- For concept_explanation: include definition, intuitive explanation, example, and learning advice.
- For case_study: include background, analysis, solution approach, and reflection.
- For further_reading: provide reading guidance, extension topics, inquiry questions, and a post-reading task.
- For video_script: provide timestamped scenes, narration, on-screen text, and visual directions.
- For code_example: provide a runnable code-oriented example, explanation, expected output, and modification exercises.
- For practice_task: include objective, steps, deliverables, and evaluation criteria.
- For summary_notes: include core knowledge, common mistakes, and review advice.
- For quiz: include 3-5 questions and reference answers.
- For project_hint: include project goal, technical route, and implementation advice.
- Use reference context when relevant, but do not copy long passages verbatim.
- Do not use conversational phrases like "as an AI".
""",
        "student_learning_path_generation": """Generate a structured personalized learning path.

Title:
{title}

Topic:
{topic}

Target goal:
{target_goal}

Knowledge points:
{knowledge_points}

Duration days:
{duration_days}

Daily minutes:
{daily_minutes}

Difficulty:
{difficulty}

Student profile:
{profile_context}

Existing resources:
{resource_context}

Student-selected knowledge base context:
{knowledge_context}

Additional requirements:
{additional_requirements}

Rules:
- The final answer must be written in Chinese for the student-facing interface.
- Produce executable steps, not vague advice.
- Each step should include objective, knowledge points, activity, practice task, estimated minutes, and completion criteria.
- Adapt to profile scores and existing resources.
- Treat the student-selected knowledge base context as the primary factual basis when it is provided.
- Keep the path aligned with the selected documents and do not invent document-specific facts.
- Do not use conversational phrases like "as an AI".
""",
        "student_learning_path_quiz": """Generate a short quiz for one learning path step.

Step:
{step}

Question count:
{question_count}

Difficulty:
{difficulty}

Rules:
- The final answer must be written in Chinese for the student-facing interface.
- Return concise questions and reference answers.
- Keep the quiz aligned with the step objective and knowledge points.
""",
        "student_learning_path_recommendation": """Recommend the next learning actions for a student.

Student profile:
{profile_context}

Active paths:
{active_paths}

Completed resources:
{completed_resources}

Recent resources:
{recent_resources}

Rules:
- The final answer must be written in Chinese for the student-facing interface.
- Return practical next actions.
- Explain why each recommendation is appropriate.
- Avoid vague suggestions.
""",
    }
)


def render_prompt(prompt_key: str, payload: dict[str, Any]) -> str:
    template = PROMPT_REGISTRY[prompt_key]
    values = SafeFormatDict(str)
    values.update({key: _format_value(value) for key, value in payload.items()})
    prompt = template.format_map(values)
    reference_context = str(payload.get("reference_context") or "").strip()
    if (
        not reference_context
        or prompt_key.startswith("student_tutoring_")
        or prompt_key.startswith("student_resource_")
        or prompt_key.startswith("student_single_resource_")
    ):
        return prompt
    return (
        f"{prompt}\n\n"
        "## Reference Materials\n"
        f"{reference_context}\n\n"
        "Reference usage rules:\n"
        "- Prioritize the reference materials when they are relevant.\n"
        "- Do not copy long passages verbatim; synthesize them into a formal teaching document.\n"
        "- Do not fabricate specific facts, numbers, standards, or source details that are not present.\n"
        "- If the reference materials are insufficient, supplement with general higher-education design principles.\n"
        "- Keep the final output in Markdown and avoid conversational wording."
    )
