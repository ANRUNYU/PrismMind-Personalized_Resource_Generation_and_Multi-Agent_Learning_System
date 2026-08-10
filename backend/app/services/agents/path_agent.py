from __future__ import annotations

import logging
import re
from typing import Any

from app.models.profile import StudentProfile
from app.models.resource import LearningResource
from app.services.agents.profile_agent import SCORE_KEYS
from app.services.llm.prompt_registry import render_prompt
from app.services.agents.base import BaseAgent, LearningPathPlan
from app.services.knowledge.models import GroundingPolicy
from app.services.llm.model_registry import AgentRole


logger = logging.getLogger(__name__)


# The path endpoint is synchronous. Keep each model attempt below common proxy
# idle timeouts so a provider outage falls back locally instead of dropping the
# browser connection after two consecutive 60-second waits.
PATH_MODEL_REQUEST_TIMEOUT_SECONDS = 25.0


DOMAIN_FALLBACK_UNITS: dict[str, list[dict[str, str]]] = {
    "机房": [
        {
            "point": "机房功能分区与机柜布局",
            "title": "认识机房功能分区与机柜布局",
            "activity": "学习主机区、配电区、制冷区、网络区和监控区的职责，理解机柜编号、承重、设备上架顺序以及冷热通道布局原则；结合一个小型机房平面图，标出服务器机柜、网络机柜、UPS 和空调的位置及气流方向。",
            "practice": "绘制一张包含至少 4 类功能区和 2 排机柜的机房布局草图，并说明设备位置不能随意安排的两个原因。",
            "criteria": "能够识别主要功能区，正确标注机柜、供电和制冷设备，并说明冷热通道与设备布局的关系。",
        },
        {
            "point": "市电、UPS、蓄电池与PDU供电链路",
            "title": "掌握机房供配电与 UPS 保障机制",
            "activity": "梳理市电输入、配电柜、UPS、蓄电池组、列头柜与机柜 PDU 的完整供电链路，理解 UPS 在线运行、旁路和电池供电三种状态，以及双路供电和冗余设计如何减少单点故障。",
            "practice": "画出一条从市电到服务器电源的供电链路，标出 UPS 旁路、蓄电池和 PDU，并分析市电中断时各设备的状态变化。",
            "criteria": "能够按顺序说明供电链路，区分 UPS 的三种工作状态，并找出图中的单点故障。",
        },
        {
            "point": "精密空调、冷热通道与温湿度控制",
            "title": "理解机房制冷与环境控制",
            "activity": "学习服务器发热、送风与回风路径，理解精密空调、架空地板或顶部送风、冷热通道封闭的作用；掌握温度、湿度异常对设备稳定性和静电风险的影响，并认识常见温湿度告警。",
            "practice": "针对一个局部温度持续升高的机柜，列出气流组织、空调运行和设备负载三个方向的排查步骤。",
            "criteria": "能够解释冷热通道的气流路径，并针对温度或湿度告警给出有顺序的排查方案。",
        },
        {
            "point": "核心、汇聚、接入网络与综合布线",
            "title": "梳理机房网络拓扑与综合布线",
            "activity": "学习核心交换、汇聚交换、接入交换的分层职责，区分光纤与双绞线、配线架与理线架的用途；理解链路冗余、端口标识和线缆标签如何支持快速定位网络故障。",
            "practice": "为服务器区设计一张简化的核心—接入网络拓扑，标明上联链路、服务器端口和配线架编号。",
            "criteria": "能够区分三层网络设备职责，正确选择基本传输介质，并通过标签定位一条服务器链路。",
        },
        {
            "point": "动环监控、消防、门禁与安全告警",
            "title": "掌握机房监控与安全保障系统",
            "activity": "认识动力环境监控采集的供电、温湿度、漏水、烟感和门禁数据，理解告警分级、通知升级和处置闭环；比较气体灭火与普通水消防在机房场景中的差异。",
            "practice": "设计一张“漏水告警”处置卡，写明确认现场、隔离风险、通知责任人、记录和复盘五个环节。",
            "criteria": "能够说出至少 5 类动环监控对象，并按告警确认、处置、恢复、复盘的顺序完成案例分析。",
        },
        {
            "point": "机房巡检、变更管理与故障应急",
            "title": "执行机房巡检与故障应急流程",
            "activity": "学习日常巡检中的设备指示灯、负载、温湿度、告警和线缆检查项，理解变更前评估、审批、备份、实施、验证和回退流程；结合停电、过温或网络中断场景建立故障分级与应急记录。",
            "practice": "编制一份 10 项机房巡检清单，并为“核心交换机上联中断”写出发现、隔离、恢复和复盘步骤。",
            "criteria": "能够独立完成巡检清单，说明变更回退条件，并按优先级组织一次典型故障处置。",
        },
    ],
}


class PathPlanningAgent(BaseAgent[LearningPathPlan]):
    role = AgentRole.PATH
    policy = GroundingPolicy.STRICT
    output_schema = LearningPathPlan
    system_prompt = (
        "生成 LearningPathPlan JSON。每一步必须绑定知识点和有效 source_ids，"
        "耗时依据画像、弱项和复杂度变化，最终综合测验覆盖所有路径知识点。"
    )
    def generate_learning_path(
        self,
        *,
        title: str,
        topic: str,
        course_id: int | None,
        target_goal: str,
        knowledge_points: list[str] | None,
        duration_days: int,
        daily_minutes: int,
        difficulty: str,
        profile: StudentProfile | None,
        resources: list[LearningResource],
        knowledge_context: str,
        additional_requirements: str | None,
    ) -> dict[str, Any]:
        generation_prompt = render_prompt(
            "student_learning_path_generation",
            {
                "title": title,
                "topic": topic,
                "target_goal": target_goal,
                "knowledge_points": knowledge_points or [],
                "duration_days": duration_days,
                "daily_minutes": daily_minutes,
                "difficulty": difficulty,
                "profile_context": self._profile_context(profile),
                "resource_context": self._resource_context(resources),
                "knowledge_context": knowledge_context,
                "additional_requirements": additional_requirements or "",
            },
        )
        generation_prompt += (
            "\n\n请只返回符合以下结构的 JSON："
            '{"title":"路径标题","steps":[{"title":"章节标题","knowledge_point":"具体知识点",'
            '"learning_objectives":["可验证目标"],"estimated_minutes":45,"source_ids":[],"description":"章节说明",'
            '"learning_content":"可直接学习的具体讲解，包含定义、原理、示例和易错点",'
            '"example":"具体示例","practice_task":"练习任务","completion_criteria":"完成标准"}],'
            '"final_assessment_knowledge_points":["全部知识点"]}。'
            "每一步内容必须具体且互不重复；最后一步必须是综合复习与综合测验。"
        )
        try:
            response = self.legacy_structured(
                generation_prompt,
                LearningPathPlan,
                timeout=PATH_MODEL_REQUEST_TIMEOUT_SECONDS,
            )
            plan = response.parsed
            if not isinstance(plan, LearningPathPlan):
                plan = LearningPathPlan.model_validate(plan)
            if len(plan.steps) < 2:
                raise ValueError("学习路径步骤不足")
            steps = self._normalize_model_steps(plan, topic=topic, course_id=course_id, target_goal=target_goal)
            return {
                "title": plan.title or title,
                "path_steps": steps,
                "milestones": self.build_milestones(steps),
                "generation_mode": "model",
                "model_name": response.model,
                "used_fallback": response.used_fallback,
            }
        except Exception as exc:
            logger.warning(
                "learning path model generation unavailable; using deterministic fallback error_type=%s",
                type(exc).__name__,
            )

        steps = self.build_path_steps(
            topic=topic,
            course_id=course_id,
            target_goal=target_goal,
            knowledge_points=knowledge_points or [topic],
            duration_days=duration_days,
            daily_minutes=daily_minutes,
            difficulty=difficulty,
            profile=profile,
            resources=resources,
            knowledge_context=knowledge_context,
        )
        return {
            "title": title,
            "path_steps": steps,
            "milestones": self.build_milestones(steps),
            "generation_mode": "deterministic_fallback",
            "generation_prompt_used": bool(generation_prompt),
        }

    def _normalize_model_steps(
        self,
        plan: LearningPathPlan,
        *,
        topic: str,
        course_id: int | None,
        target_goal: str,
    ) -> list[dict[str, Any]]:
        steps: list[dict[str, Any]] = []
        all_points = list(dict.fromkeys(
            [item.knowledge_point.strip() for item in plan.steps if item.knowledge_point.strip()]
            + [item.strip() for item in plan.final_assessment_knowledge_points if item.strip()]
        ))
        for index, item in enumerate(plan.steps):
            is_final = index == len(plan.steps) - 1
            content_parts = [item.description, item.learning_content]
            if item.example:
                content_parts.append(f"示例：{item.example}")
            learning_content = "\n\n".join(part.strip() for part in content_parts if part.strip())
            if not learning_content:
                raise ValueError(f"第 {index + 1} 步缺少学习正文")
            steps.append({
                "step_index": index,
                "title": "综合复习与综合测验" if is_final else item.title.strip(),
                "objective": "；".join(item.learning_objectives) or target_goal,
                "knowledge_point": item.knowledge_point.strip(),
                "knowledge_points": all_points if is_final else [item.knowledge_point.strip()],
                "suggested_resource_ids": [],
                "source_ids": item.source_ids,
                "learning_activity": learning_content,
                "practice_task": item.practice_task or f"围绕{item.knowledge_point}完成一次应用练习。",
                "estimated_minutes": max(20, min(240, item.estimated_minutes)),
                "completion_criteria": item.completion_criteria or "完成学习内容并通过对应步骤测验。",
                "status": "active" if index == 0 else "locked",
                "pass_score": 60,
                "reflection": None,
                "topic": topic,
                "course_id": course_id,
            })
        return steps

    def build_path_steps(
        self,
        *,
        topic: str,
        course_id: int | None,
        target_goal: str,
        knowledge_points: list[str],
        duration_days: int,
        daily_minutes: int,
        difficulty: str,
        profile: StudentProfile | None,
        resources: list[LearningResource],
        knowledge_context: str = "",
    ) -> list[dict[str, Any]]:
        step_count = self._step_count(duration_days, profile)
        learning_units = self._fallback_learning_units(
            topic=topic,
            knowledge_points=knowledge_points,
            knowledge_context=knowledge_context,
            count=max(1, step_count - 1),
        )
        resource_ids = [resource.id for resource in resources]
        resource_groups = self._distribute_resources(resource_ids, step_count)

        steps: list[dict[str, Any]] = []
        for index in range(step_count):
            is_final = index == step_count - 1
            unit = self._final_fallback_unit(topic, learning_units, target_goal) if is_final else learning_units[index]
            point = unit["point"]
            complexity = 1.0 + min(0.35, len(point) / 50) + (0.2 if difficulty == "hard" else 0)
            foundation = 1.0 + ((100 - profile.knowledge_score) / 250 if profile else 0.15)
            efficiency = 1.0 + ((100 - profile.efficiency_score) / 300 if profile else 0.1)
            weaknesses = (profile.profile_data or {}).get("weaknesses", []) if profile else []
            weak_factor = 1.25 if any(str(weak) in point or point in str(weak) for weak in weaknesses) else 1.0
            phase_factor = 0.85 + index * 0.06
            estimated = max(20, min(240, round(daily_minutes * complexity * foundation * efficiency * weak_factor * phase_factor)))
            activity = unit["activity"]
            if profile and profile.exam_score >= 70:
                activity += " 同时整理本知识点的常见考法与易错判断。"
            if difficulty == "hard":
                activity += " 进一步比较不同方案的适用条件、成本与风险。"
            steps.append(
                {
                    "step_index": index,
                    "title": unit["title"],
                    "objective": unit["objective"],
                    "knowledge_point": point,
                    "knowledge_points": [item["point"] for item in learning_units] if is_final else [point],
                    "suggested_resource_ids": resource_groups[index],
                    "learning_activity": activity,
                    "practice_task": unit["practice"],
                    "estimated_minutes": estimated,
                    "completion_criteria": unit["criteria"],
                    "status": "active" if index == 0 else "locked",
                    "pass_score": 60,
                    "reflection": None,
                    "topic": topic,
                    "course_id": course_id,
                }
            )
        return steps

    def _fallback_learning_units(
        self,
        *,
        topic: str,
        knowledge_points: list[str],
        knowledge_context: str,
        count: int,
    ) -> list[dict[str, str]]:
        explicit_candidates = [self._clean_point(item) for item in knowledge_points if self._clean_point(item)]
        context_candidates = self._extract_context_points(knowledge_context)

        domain_units: list[dict[str, str]] = []
        for keyword, units in DOMAIN_FALLBACK_UNITS.items():
            if keyword in topic:
                domain_units = [dict(item) for item in units]
                break

        resolved: list[dict[str, str]] = []
        seen: set[str] = set()
        for point in explicit_candidates:
            if point in seen or self._is_generic_point(point, topic):
                continue
            resolved.append(self._unit_from_point(point, topic, knowledge_context))
            seen.add(point)
            if len(resolved) >= count:
                return resolved

        # Curated domain units are deliberately concrete and stable even when OCR
        # text from a selected PDF contains broken headings.  They are preferred
        # over noisy context candidates for a recognized domain, while explicit
        # user-selected knowledge points still take precedence.
        for unit in domain_units:
            if unit["point"] in seen:
                continue
            unit["objective"] = f"理解{unit['point']}的组成、工作过程和应用边界，并完成对应分析任务。"
            resolved.append(unit)
            seen.add(unit["point"])
            if len(resolved) >= count:
                return resolved

        for point in context_candidates:
            if point in seen or self._is_generic_point(point, topic):
                continue
            resolved.append(self._unit_from_point(point, topic, knowledge_context))
            seen.add(point)
            if len(resolved) >= count:
                return resolved

        fallback_phases = [
            ("核心术语与组成要素", "建立术语表并画出组成结构"),
            ("工作流程与关键机制", "按输入、处理、输出梳理工作流程"),
            ("配置方法与典型场景", "比较两种典型配置并说明适用条件"),
            ("常见故障与排查顺序", "针对一个故障现象编写排查树"),
            ("安全规范与操作边界", "整理操作前、中、后的安全检查项"),
            ("综合案例与迁移应用", "完成一个包含约束条件的综合案例"),
        ]
        for phase, task in fallback_phases:
            point = f"{topic}的{phase}"
            if point in seen:
                continue
            resolved.append({
                "point": point,
                "title": f"掌握{point}",
                "objective": f"能够解释{point}，并将其用于一个具体场景。",
                "activity": f"围绕“{topic}”学习{phase}，形成结构图、流程图或对比表，明确每个要素的作用、先后关系和适用条件。",
                "practice": f"{task}，并用具体例子说明结论。",
                "criteria": f"产出可检查的图表或清单，准确说明{phase}中的关键关系，并完成练习。",
            })
            seen.add(point)
            if len(resolved) >= count:
                break
        return resolved

    def _unit_from_point(self, point: str, topic: str, knowledge_context: str) -> dict[str, str]:
        excerpt = self._related_context_excerpt(point, knowledge_context)
        evidence_text = f"资料中的相关要点包括：{excerpt} " if excerpt else ""
        return {
            "point": point,
            "title": f"掌握{point}",
            "objective": f"能够解释{point}的定义、组成和作用，并联系“{topic}”中的实际场景。",
            "activity": (
                f"{evidence_text}重点梳理“{point}”的定义、组成要素、工作过程、适用条件与常见误区；"
                "把资料内容整理成一张结构图或流程图，并为每个关键节点补充一个具体例子。"
            ),
            "practice": f"完成一个关于“{point}”的场景分析：说明已知条件、处理步骤、结论和可能风险。",
            "criteria": f"能够脱离资料准确解释“{point}”，完成结构图和场景分析，并指出至少一个易错点。",
        }

    def _final_fallback_unit(
        self,
        topic: str,
        learning_units: list[dict[str, str]],
        target_goal: str,
    ) -> dict[str, str]:
        point_names = "、".join(item["point"] for item in learning_units)
        return {
            "point": f"{topic}综合应用",
            "title": f"综合应用与测验：{topic}",
            "objective": f"串联全部知识点完成综合任务，并验证目标“{target_goal}”的达成情况。",
            "activity": (
                f"复习并串联以下知识点：{point_names}。先绘制一张完整知识结构图，再完成一个同时包含正常运行、异常告警和处置决策的综合案例，最后根据错题回到对应知识点复盘。"
            ),
            "practice": f"完成“{topic}”综合案例报告，报告需包含系统结构、运行流程、异常判断、处理步骤和复盘结论。",
            "criteria": "知识结构图覆盖全部步骤，综合案例的判断与处置顺序合理，并在最终测验中达到 60 分。",
        }

    def _extract_context_points(self, knowledge_context: str) -> list[str]:
        if not knowledge_context.strip():
            return []
        points: list[str] = []
        for raw_line in knowledge_context.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("["):
                continue
            is_marked_heading = bool(
                re.match(r"^#{1,6}\s*", line)
                or re.match(r"^(?:第[一二三四五六七八九十百0-9]+[章节部分]|[一二三四五六七八九十0-9]+[.、）)])\s*", line)
            )
            is_short_plain_heading = len(line) <= 36 and not re.search(r"[。！？；]", line)
            heading = re.sub(r"^#{1,6}\s*", "", line)
            heading = re.sub(r"^\d+(?:\.\d+)+\.?\s*", "", heading)
            heading = re.sub(r"^(?:第[一二三四五六七八九十百0-9]+[章节部分]|[一二三四五六七八九十0-9]+[.、）)])\s*", "", heading)
            heading = self._clean_point(heading)
            if 3 <= len(heading) <= 36 and (is_marked_heading or is_short_plain_heading):
                points.append(heading)
            for match in re.finditer(r"([\u4e00-\u9fffA-Za-z0-9、与和]{3,28})(?:是指|是|包括|分为|由)", line):
                point = self._clean_point(match.group(1))
                if point:
                    points.append(point)
        return list(dict.fromkeys(points))[:12]

    def _related_context_excerpt(self, point: str, knowledge_context: str) -> str:
        if not knowledge_context.strip():
            return ""
        tokens = [token for token in re.split(r"[、与和：:\s]+", point) if len(token) >= 2]
        sentences = [item.strip() for item in re.split(r"[\n。！？；]", knowledge_context) if item.strip() and not item.strip().startswith("[")]
        ranked = sorted(
            sentences,
            key=lambda sentence: sum(1 for token in tokens if token in sentence),
            reverse=True,
        )
        selected = [sentence for sentence in ranked if any(token in sentence for token in tokens)][:2]
        return "；".join(selected)[:240]

    @staticmethod
    def _clean_point(value: str) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip(" #*：:。；，、-—")

    @staticmethod
    def _is_generic_point(point: str, topic: str) -> bool:
        normalized = point.replace(" ", "")
        return normalized in {topic.replace(" ", ""), "基础概念", "综合复习与综合测验"}

    def build_milestones(self, steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not steps:
            return []
        last_index = len(steps) - 1
        midpoint = max(0, len(steps) // 2 - 1)
        milestones = [
            {
                "milestone_index": 0,
                "title": "完成基础概念学习",
                "target_step_index": midpoint,
                "description": "完成前半部分步骤后，能够说清核心概念和基本关系。",
                "is_reached": False,
            },
            {
                "milestone_index": 1,
                "title": "完成综合应用训练",
                "target_step_index": last_index,
                "description": "完成整条路径后，能够完成一个小任务并进行复盘总结。",
                "is_reached": False,
            },
        ]
        return milestones

    def generate_step_quiz(
        self,
        *,
        path_steps: list[dict[str, Any]],
        step_index: int,
        question_count: int,
        difficulty: str,
    ) -> dict[str, Any]:
        if step_index < 0 or step_index >= len(path_steps):
            raise ValueError("step_index is out of range")
        step = path_steps[step_index]
        point = (step.get("knowledge_points") or [step.get("title")])[0]
        count = max(1, min(question_count, 10))
        questions = []
        for index in range(count):
            questions.append(
                {
                    "question": f"{index + 1}. 围绕“{point}”，说明一个关键概念或应用判断。",
                    "answer": f"参考答案应包含“{point}”的定义、适用条件和一个简短例子。",
                }
            )
        quiz_lines = [f"## {step.get('title')} 自测题", f"难度：{difficulty}", ""]
        for item in questions:
            quiz_lines.append(f"- {item['question']}")
        quiz_lines.extend(["", "## 参考答案"])
        for item in questions:
            quiz_lines.append(f"- {item['answer']}")
        return {"quiz_markdown": "\n".join(quiz_lines), "questions": questions}

    def recommend_next_learning(
        self,
        *,
        profile: StudentProfile | None,
        active_paths: list[Any],
        completed_resources: list[LearningResource],
        recent_resources: list[LearningResource],
    ) -> list[dict[str, str]]:
        recommendations: list[dict[str, str]] = []
        if profile and profile.knowledge_score < 60:
            recommendations.append(
                {
                    "title": "补强基础概念",
                    "reason": "你的知识基础分数偏低，建议先巩固前置概念。",
                    "suggested_action": "选择一个核心概念，完成概念讲解资源和 3 道自测题。",
                }
            )
        if active_paths:
            path = active_paths[0]
            step = None
            if path.current_step < len(path.path_steps):
                step = path.path_steps[path.current_step]
            recommendations.append(
                {
                    "title": f"继续推进：{path.title}",
                    "reason": "你当前有进行中的学习路径。",
                    "suggested_action": f"完成当前步骤：{step.get('title') if step else '复盘已完成路径'}。",
                }
            )
        if recent_resources and not completed_resources:
            recommendations.append(
                {
                    "title": "完成最近生成的学习资源",
                    "reason": "你已有学习资源，但尚未形成完成记录。",
                    "suggested_action": f"优先完成“{recent_resources[0].title}”，并标记完成。",
                }
            )
        recommendations.append(
            {
                "title": "进行一次阶段复盘",
                "reason": "复盘可以帮助稳定学习质量并发现下一步薄弱点。",
                "suggested_action": "写下本周掌握的 3 个概念、1 个仍不清楚的问题和 1 个实践任务。",
            }
        )
        return recommendations[:3]

    def _step_count(self, duration_days: int, profile: StudentProfile | None) -> int:
        if duration_days <= 3:
            count = 3
        elif duration_days <= 10:
            count = 5
        else:
            count = 7
        if profile and profile.efficiency_score < 60:
            count = min(7, count + 1)
        return count

    def _expand_points(self, knowledge_points: list[str], step_count: int) -> list[str]:
        points = [point for point in knowledge_points if point]
        if not points:
            points = ["基础概念"]
        learning_slots = max(1, step_count - 1)
        expanded: list[str] = []
        phases = ["基础概念", "关键机制", "典型应用", "易错点与辨析", "实践迁移", "总结巩固"]
        for index in range(learning_slots):
            base = points[index % len(points)]
            cycle = index // len(points)
            expanded.append(base if cycle == 0 else f"{base}：{phases[min(cycle - 1, len(phases) - 1)]}")
        return [*expanded, "综合复习与综合测验"]

    def _distribute_resources(self, resource_ids: list[int], step_count: int) -> list[list[int]]:
        groups = [[] for _ in range(step_count)]
        for index, resource_id in enumerate(resource_ids):
            groups[index % step_count].append(resource_id)
        return groups

    def _step_title(self, index: int, point: str, step_count: int) -> str:
        if index == 0:
            return f"建立{point}基础理解"
        if index == step_count - 1:
            return f"综合应用与复盘：{point}"
        return f"深入学习：{point}"

    def _objective(self, index: int, point: str, target_goal: str) -> str:
        if index == 0:
            return f"理解{point}的基本含义，并能说出它与目标“{target_goal}”的关系。"
        return f"围绕{point}完成学习、练习和迁移应用。"

    def _activity_for_step(self, index: int, point: str, difficulty: str, profile: StudentProfile | None) -> str:
        activity = f"阅读或观看{point}相关资料，整理概念卡片，并完成一个小练习。"
        if profile and profile.exam_score >= 70:
            activity += " 额外整理常见考点和易错题。"
        if difficulty == "hard":
            activity += " 尝试比较不同方法的优缺点。"
        if index == 0:
            activity += " 先从定义和例子入手，不急于做复杂推导。"
        return activity

    def _practice_task(self, point: str, profile: StudentProfile | None) -> str:
        if profile and profile.practice_score >= 70:
            return f"设计一个小实验或代码任务，验证{point}在实际问题中的作用。"
        return f"完成一个与{point}相关的基础练习，并用 100 字解释答案。"

    def _completion_criteria(self, point: str, profile: StudentProfile | None) -> str:
        criteria = f"能够用自己的话解释{point}，并完成对应练习。"
        if profile and profile.quality_score < 60:
            criteria += " 需要补充学习笔记和错因总结。"
        return criteria

    def _profile_context(self, profile: StudentProfile | None) -> str:
        if profile is None:
            return "未提供学习画像。"
        data = dict(profile.profile_data or {})
        scores = {key: float(getattr(profile, key)) for key in SCORE_KEYS}
        return (
            f"目标：{profile.learning_goal or '未填写'}；"
            f"偏好：{data.get('preferred_style') or '未填写'}；"
            f"薄弱点：{'、'.join(data.get('weaknesses') or []) or '未填写'}；"
            f"六维分数：{scores}"
        )

    def _resource_context(self, resources: list[LearningResource]) -> str:
        if not resources:
            return "暂无可引用学习资源。"
        return "\n".join(
            f"- #{resource.id} {resource.title} ({resource.resource_type}, completed={resource.is_completed})"
            for resource in resources
        )


path_planning_agent = PathPlanningAgent()
