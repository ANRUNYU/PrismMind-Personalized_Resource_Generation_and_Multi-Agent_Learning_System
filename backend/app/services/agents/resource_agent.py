from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable
import asyncio

from app.services.llm.prompt_registry import render_prompt
from app.services.agents.base import BaseAgent, ResourceGeneration
from app.services.knowledge.models import GroundingPolicy
from app.services.llm.base import ChatMessage, StreamChunkType
from app.services.llm.model_registry import AgentRole


RESOURCE_TYPE_TITLES = {
    "course_document": "课程文档",
    "mind_map": "思维导图",
    "concept_explanation": "概念讲解",
    "case_study": "案例分析",
    "further_reading": "拓展阅读",
    "video_script": "视频脚本",
    "code_example": "代码案例",
    "practice_task": "实践任务",
    "summary_notes": "知识总结",
    "quiz": "自测题",
    "project_hint": "项目提示",
}


@dataclass(frozen=True)
class GeneratedLearningResource:
    resource_type: str
    title: str
    content: str
    tags: list[str]


class ResourceAgent(BaseAgent[ResourceGeneration]):
    role = AgentRole.RESOURCE
    policy = GroundingPolicy.STRICT
    output_schema = ResourceGeneration
    system_prompt = "生成 ResourceGeneration JSON；每个章节必须有有效 source_ids，通用补充必须单独标记。"
    def generate_resources(
        self,
        *,
        topic: str,
        resource_types: list[str],
        difficulty: str,
        knowledge_points: list[str] | None,
        profile_context: str,
        reference_context: str,
        additional_requirements: str | None,
        on_delta: Callable[[str], None] | None = None,
    ) -> list[GeneratedLearningResource]:
        return [
            self.generate_single_resource(
                topic=topic,
                resource_type=resource_type,
                difficulty=difficulty,
                knowledge_points=knowledge_points,
                profile_context=profile_context,
                reference_context=reference_context,
                additional_requirements=additional_requirements,
                on_delta=on_delta,
            )
            for resource_type in resource_types
        ]

    def generate_single_resource(
        self,
        *,
        topic: str,
        resource_type: str,
        difficulty: str,
        knowledge_points: list[str] | None,
        profile_context: str,
        reference_context: str,
        additional_requirements: str | None,
        on_delta: Callable[[str], None] | None = None,
    ) -> GeneratedLearningResource:
        prompt = self.build_resource_prompt(
            topic=topic,
            resource_type=resource_type,
            difficulty=difficulty,
            knowledge_points=knowledge_points,
            profile_context=profile_context,
            reference_context=reference_context,
            additional_requirements=additional_requirements,
        )
        if on_delta is not None:
            async def collect() -> str:
                chunks: list[str] = []
                async for chunk in self.router.stream_chat(role=self.role, messages=[ChatMessage(role="user", content=prompt)]):
                    if chunk.type == StreamChunkType.error:
                        raise RuntimeError(chunk.error or "Resource stream interrupted")
                    if chunk.type == StreamChunkType.delta and chunk.delta:
                        chunks.append(chunk.delta)
                        on_delta(chunk.delta)
                return "".join(chunks)
            content = asyncio.run(collect())
        else:
            content = self.legacy_text(prompt).content
        readable_type = RESOURCE_TYPE_TITLES.get(resource_type, resource_type)
        return GeneratedLearningResource(
            resource_type=resource_type,
            title=f"{topic}{readable_type}",
            content=content,
            tags=self._tags(topic, resource_type, knowledge_points),
        )

    def build_resource_prompt(
        self,
        *,
        topic: str,
        resource_type: str,
        difficulty: str,
        knowledge_points: list[str] | None,
        profile_context: str,
        reference_context: str,
        additional_requirements: str | None,
    ) -> str:
        return render_prompt(
            "student_single_resource_generation",
            {
                "topic": topic,
                "resource_type": resource_type,
                "resource_type_name": RESOURCE_TYPE_TITLES.get(resource_type, resource_type),
                "difficulty": difficulty,
                "knowledge_points": knowledge_points or [],
                "profile_context": profile_context,
                "reference_context": reference_context,
                "additional_requirements": additional_requirements or "",
            },
        )

    def build_mock_resource(
        self,
        *,
        topic: str,
        resource_type: str,
        difficulty: str,
        knowledge_points: list[str] | None,
        profile_context: str,
        reference_context: str,
    ) -> str:
        intro = self.adapt_to_profile(profile_context)
        points = "、".join(knowledge_points or [topic])
        if resource_type == "course_document":
            return (
                f"# {topic}课程文档\n\n"
                "## 学习目标\n明确需要掌握的概念、方法与应用能力。\n\n"
                f"## 核心内容\n围绕{points}按由浅入深的顺序组织定义、原理、示例与注意事项。\n\n"
                "## 课堂与自学任务\n完成知识检查、示例复现和课后复盘。\n\n"
                "## 小结\n归纳本节关键结论与后续学习衔接。"
                + self._reference_note(reference_context)
            )
        if resource_type == "mind_map":
            return (
                f"# {topic}思维导图\n\n"
                f"- {topic}\n  - 核心概念\n    - 定义与特征\n    - 适用条件\n"
                "  - 原理与关系\n    - 前置知识\n    - 关键流程\n"
                "  - 应用\n    - 典型案例\n    - 常见误区\n"
                "  - 复习\n    - 自测问题\n    - 延伸方向"
                + self._reference_note(reference_context)
            )
        if resource_type == "concept_explanation":
            return (
                f"# {topic}概念讲解\n\n"
                f"## 一、概念定义\n围绕{points}建立基础理解，难度定位为{difficulty}。\n\n"
                f"## 二、直观理解\n{intro}\n\n"
                "## 三、简单例子\n可以从一个小数据集或课堂案例出发，观察现象、分析原因，再总结规律。\n\n"
                "## 四、学习建议\n先复述概念，再完成一个小例题，最后用自己的语言总结易错点。"
                + self._reference_note(reference_context)
            )
        if resource_type == "case_study":
            return (
                f"# {topic}案例分析\n\n"
                "## 一、案例背景\n选择一个贴近课程实践的场景，观察问题如何出现。\n\n"
                "## 二、问题分析\n从输入条件、关键变量和结果表现三个角度分析。\n\n"
                "## 三、解决思路\n先建立判断标准，再比较不同方案的优缺点。\n\n"
                "## 四、反思总结\n总结该案例可迁移到哪些类似问题。"
                + self._reference_note(reference_context)
            )
        if resource_type == "further_reading":
            return (
                f"# {topic}拓展阅读\n\n"
                "## 阅读导引\n说明本主题与课程核心内容的联系，以及适合继续探索的问题。\n\n"
                "## 拓展主题\n从历史演进、前沿应用和跨学科联系三个方向延伸。\n\n"
                "## 带着问题阅读\n1. 该方法解决了什么限制？\n2. 在不同场景下有哪些取舍？\n3. 哪些问题仍值得研究？\n\n"
                "## 阅读后任务\n整理三条新认识，并写出一个待验证问题。"
                + self._reference_note(reference_context)
            )
        if resource_type == "video_script":
            return (
                f"# {topic}视频脚本\n\n"
                "## 开场（0:00-0:30）\n用真实问题引出本期学习目标。\n\n"
                "## 概念讲解（0:30-2:30）\n配合画面、字幕和旁白解释核心概念。\n\n"
                "## 示例演示（2:30-4:30）\n逐步展示问题分析和解决过程。\n\n"
                "## 总结与互动（4:30-5:00）\n回顾要点并给出一道思考题。"
                + self._reference_note(reference_context)
            )
        if resource_type == "code_example":
            return (
                f"# {topic}代码案例\n\n"
                "## 案例目标\n通过一个可运行的最小示例理解核心流程。\n\n"
                "## 实现步骤\n1. 准备输入数据与运行环境。\n2. 编写核心逻辑。\n3. 运行并核对输出。\n\n"
                "## 关键代码说明\n逐段解释变量、控制流程、异常处理和复杂度。\n\n"
                "## 修改练习\n调整输入规模或实现方案，比较结果并记录原因。"
                + self._reference_note(reference_context)
            )
        if resource_type == "practice_task":
            return (
                f"# {topic}实践任务\n\n"
                "## 一、任务目标\n通过动手完成一个小任务理解核心知识点。\n\n"
                "## 二、操作步骤\n1. 明确输入和输出。\n2. 完成基础实现。\n3. 记录结果并解释原因。\n\n"
                "## 三、提交要求\n提交过程记录、关键代码或截图，以及 200 字以内的总结。\n\n"
                "## 四、评价标准\n关注完整性、正确性、解释质量和反思深度。"
                + self._reference_note(reference_context)
            )
        if resource_type == "summary_notes":
            return (
                f"# {topic}知识总结\n\n"
                "## 一、核心知识\n梳理关键词、概念关系和适用条件。\n\n"
                "## 二、易错点\n区分相近概念，避免只背定义不看场景。\n\n"
                "## 三、复习建议\n用三句话复述知识点，并完成一道自测题。"
                + self._reference_note(reference_context)
            )
        if resource_type == "quiz":
            return (
                f"# {topic}自测题\n\n"
                "## 一、题目\n1. 简述核心概念及其适用场景。\n2. 判断一个案例是否符合该概念，并说明理由。\n3. 给出一个避免常见错误的方法。\n\n"
                "## 二、参考答案\n1. 答案应包含定义、条件和作用。\n2. 应结合案例中的关键特征判断。\n3. 应从理解、练习或复盘角度提出方法。"
                + self._reference_note(reference_context)
            )
        return (
            f"# {topic}项目提示\n\n"
            "## 一、项目目标\n围绕主题设计一个可完成的小型项目任务。\n\n"
            "## 二、技术路线\n先完成最小功能，再补充分析、展示和优化。\n\n"
            "## 三、实施建议\n控制范围，保留过程记录，最后总结可改进点。"
            + self._reference_note(reference_context)
        )

    def adapt_to_profile(self, profile_context: str) -> str:
        if not profile_context:
            return "尚未发现完整学习画像，内容按通用学习节奏组织。"
        if "知识基础偏弱" in profile_context:
            return "学习者知识基础偏弱，讲解需要从前置概念开始，减少跳步。"
        if "实践能力较强" in profile_context:
            return "学习者具备一定实践经验，可以增加动手任务和项目迁移。"
        return "根据学习画像，内容将兼顾基础讲解、练习巩固和学习建议。"

    def _tags(self, topic: str, resource_type: str, knowledge_points: list[str] | None) -> list[str]:
        return list(dict.fromkeys([topic, resource_type, *(knowledge_points or [])]))

    def _reference_note(self, reference_context: str) -> str:
        if reference_context:
            return "\n\n## 参考资料使用说明\n以上内容已结合知识库检索材料进行整理，但没有逐字照抄。"
        return "\n\n## 参考资料使用说明\n尚未检索到可用知识库材料，当前内容基于通用学习设计原则生成。"


resource_agent = ResourceAgent()
