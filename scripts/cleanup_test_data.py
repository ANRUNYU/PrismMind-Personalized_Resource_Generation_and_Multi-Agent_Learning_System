from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib import error, request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


DEFAULT_PREFIXES = ("smoke_", "audit_", "test_", "tmp_")
PROTECTED_USERNAMES = {"admin", "demo_teacher", "demo_student"}
PROTECTED_COURSE_NAMES = {"FastAPI 后端开发"}
PROTECTED_COURSE_CODES = {"DEMO-PRISMMIND-PERSONALIZED-LEARNING"}


@dataclass(frozen=True)
class CleanupPlan:
    user_ids: list[int]
    usernames: list[str]
    course_ids: list[int]
    assistant_session_ids: list[int]
    counts: dict[str, int]


def configure_backend_imports() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    backend_dir = repo_root / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))


def health_check(api_base_url: str | None) -> None:
    if not api_base_url:
        return
    url = api_base_url.rstrip("/") + "/health"
    try:
        with request.urlopen(url, timeout=10) as resp:
            if resp.status != 200:
                print(f"[WARN] API health check returned HTTP {resp.status}: {url}")
    except (error.URLError, TimeoutError) as exc:
        print(f"[WARN] API health check failed: {exc}")


def load_models():
    configure_backend_imports()

    from sqlalchemy import delete, func, or_, select

    from app.db.session import SessionLocal
    from app.models import (
        AgentRun,
        AssistantMessage,
        AssistantSession,
        AuditLog,
        Course,
        CourseAssignment,
        CourseAssignmentSubmission,
        CourseMember,
        FileAsset,
        GeneratedArtifact,
        GenerationTask,
        KnowledgeChunk,
        KnowledgeDocument,
        LearningAssessment,
        LearningPath,
        LearningResource,
        Paper,
        PaperItem,
        QuestionBank,
        StudentProfile,
        StudentTest,
        TutoringSession,
        User,
    )

    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured; cannot clean test data.")

    return {
        "delete": delete,
        "func": func,
        "or_": or_,
        "select": select,
        "SessionLocal": SessionLocal,
        "AgentRun": AgentRun,
        "AssistantMessage": AssistantMessage,
        "AssistantSession": AssistantSession,
        "AuditLog": AuditLog,
        "Course": Course,
        "CourseAssignment": CourseAssignment,
        "CourseAssignmentSubmission": CourseAssignmentSubmission,
        "CourseMember": CourseMember,
        "FileAsset": FileAsset,
        "GeneratedArtifact": GeneratedArtifact,
        "GenerationTask": GenerationTask,
        "KnowledgeChunk": KnowledgeChunk,
        "KnowledgeDocument": KnowledgeDocument,
        "LearningAssessment": LearningAssessment,
        "LearningPath": LearningPath,
        "LearningResource": LearningResource,
        "Paper": Paper,
        "PaperItem": PaperItem,
        "QuestionBank": QuestionBank,
        "StudentProfile": StudentProfile,
        "StudentTest": StudentTest,
        "TutoringSession": TutoringSession,
        "User": User,
    }


def count_rows(db, select, func, model, condition) -> int:
    return int(db.scalar(select(func.count()).select_from(model).where(condition)) or 0)


def build_plan(db, models, prefixes: Iterable[str]) -> CleanupPlan:
    select = models["select"]
    func = models["func"]
    or_ = models["or_"]
    User = models["User"]

    prefix_filters = [User.username.startswith(prefix) for prefix in prefixes]
    if not prefix_filters:
        return CleanupPlan(user_ids=[], usernames=[], course_ids=[], assistant_session_ids=[], counts={})

    users = list(
        db.scalars(
            select(User)
            .where(or_(*prefix_filters))
            .order_by(User.id.asc())
        )
    )
    users = [user for user in users if user.username not in PROTECTED_USERNAMES]
    user_ids = [int(user.id) for user in users]
    usernames = [str(user.username) for user in users]

    Course = models["Course"]
    course_filters = [Course.name.startswith(prefix) for prefix in prefixes]
    course_filters.extend(Course.code.startswith(prefix.upper()) for prefix in prefixes)
    if user_ids:
        course_filters.append(Course.owner_id.in_(user_ids))
    course_candidates = list(db.scalars(select(Course).where(or_(*course_filters))))
    course_ids = [
        int(course.id)
        for course in course_candidates
        if course.name not in PROTECTED_COURSE_NAMES and course.code not in PROTECTED_COURSE_CODES
    ]

    CourseMember = models["CourseMember"]
    CourseAssignment = models["CourseAssignment"]
    CourseAssignmentSubmission = models["CourseAssignmentSubmission"]
    AssistantMessage = models["AssistantMessage"]
    AssistantSession = models["AssistantSession"]
    KnowledgeChunk = models["KnowledgeChunk"]
    KnowledgeDocument = models["KnowledgeDocument"]
    Paper = models["Paper"]
    PaperItem = models["PaperItem"]
    QuestionBank = models["QuestionBank"]

    doc_filters = []
    if user_ids:
        doc_filters.append(KnowledgeDocument.owner_id.in_(user_ids))
    if course_ids:
        doc_filters.append(KnowledgeDocument.course_id.in_(course_ids))
    doc_ids = list(db.scalars(select(KnowledgeDocument.id).where(or_(*doc_filters)))) if doc_filters else []
    paper_ids = list(db.scalars(select(Paper.id).where(Paper.creator_id.in_(user_ids))))
    question_ids = list(db.scalars(select(QuestionBank.id).where(QuestionBank.creator_id.in_(user_ids))))
    assignment_filters = [CourseAssignment.title.startswith(prefix) for prefix in prefixes]
    if user_ids:
        assignment_filters.append(CourseAssignment.teacher_id.in_(user_ids))
    if course_ids:
        assignment_filters.append(CourseAssignment.course_id.in_(course_ids))
    assignment_ids = list(db.scalars(select(CourseAssignment.id).where(or_(*assignment_filters)))) if assignment_filters else []
    assistant_filters = [AssistantSession.title.startswith(prefix) for prefix in prefixes]
    if user_ids:
        assistant_filters.append(AssistantSession.user_id.in_(user_ids))
    if course_ids:
        assistant_filters.append(AssistantSession.course_id.in_(course_ids))
    assistant_session_ids = (
        list(db.scalars(select(AssistantSession.id).where(or_(*assistant_filters)))) if assistant_filters else []
    )

    submission_filters = []
    if assignment_ids:
        submission_filters.append(CourseAssignmentSubmission.assignment_id.in_(assignment_ids))
    if user_ids:
        submission_filters.append(CourseAssignmentSubmission.student_id.in_(user_ids))
    if course_ids:
        submission_filters.append(CourseAssignmentSubmission.course_id.in_(course_ids))

    member_filters = []
    if user_ids:
        member_filters.append(CourseMember.user_id.in_(user_ids))
    if course_ids:
        member_filters.append(CourseMember.course_id.in_(course_ids))

    counts = {
        "users": len(user_ids),
        "agent_runs": count_rows(db, select, func, models["AgentRun"], models["AgentRun"].user_id.in_(user_ids)),
        "audit_logs": count_rows(db, select, func, models["AuditLog"], models["AuditLog"].user_id.in_(user_ids)),
        "assistant_sessions": len(assistant_session_ids),
        "assistant_messages": count_rows(db, select, func, AssistantMessage, AssistantMessage.session_id.in_(assistant_session_ids))
        if assistant_session_ids
        else 0,
        "courses": len(course_ids),
        "course_assignments": len(assignment_ids),
        "course_assignment_submissions": count_rows(db, select, func, CourseAssignmentSubmission, or_(*submission_filters)) if submission_filters else 0,
        "course_members": count_rows(db, select, func, CourseMember, or_(*member_filters)) if member_filters else 0,
        "file_assets": count_rows(db, select, func, models["FileAsset"], models["FileAsset"].owner_id.in_(user_ids)),
        "generated_artifacts": count_rows(db, select, func, models["GeneratedArtifact"], models["GeneratedArtifact"].owner_id.in_(user_ids)),
        "generation_tasks": count_rows(db, select, func, models["GenerationTask"], models["GenerationTask"].owner_id.in_(user_ids)),
        "knowledge_documents": len(doc_ids),
        "knowledge_chunks": count_rows(db, select, func, KnowledgeChunk, KnowledgeChunk.document_id.in_(doc_ids)) if doc_ids else 0,
        "learning_assessments": count_rows(db, select, func, models["LearningAssessment"], models["LearningAssessment"].user_id.in_(user_ids)),
        "learning_paths": count_rows(db, select, func, models["LearningPath"], models["LearningPath"].user_id.in_(user_ids)),
        "learning_resources": count_rows(db, select, func, models["LearningResource"], models["LearningResource"].user_id.in_(user_ids)),
        "papers": len(paper_ids),
        "paper_items": count_rows(db, select, func, PaperItem, PaperItem.paper_id.in_(paper_ids)) if paper_ids else 0,
        "question_bank": len(question_ids),
        "question_paper_items": count_rows(db, select, func, PaperItem, PaperItem.question_id.in_(question_ids)) if question_ids else 0,
        "student_profiles": count_rows(db, select, func, models["StudentProfile"], models["StudentProfile"].user_id.in_(user_ids)),
        "student_tests": count_rows(db, select, func, models["StudentTest"], models["StudentTest"].user_id.in_(user_ids)),
        "tutoring_sessions": count_rows(db, select, func, models["TutoringSession"], models["TutoringSession"].user_id.in_(user_ids)),
    }
    return CleanupPlan(
        user_ids=user_ids,
        usernames=usernames,
        course_ids=course_ids,
        assistant_session_ids=assistant_session_ids,
        counts=counts,
    )


def delete_rows(db, models, plan: CleanupPlan) -> None:
    delete = models["delete"]
    select = models["select"]
    ids = plan.user_ids
    course_ids = plan.course_ids
    if not ids and not course_ids and not plan.assistant_session_ids:
        return

    AgentRun = models["AgentRun"]
    AssistantMessage = models["AssistantMessage"]
    AssistantSession = models["AssistantSession"]
    AuditLog = models["AuditLog"]
    Course = models["Course"]
    CourseAssignment = models["CourseAssignment"]
    CourseAssignmentSubmission = models["CourseAssignmentSubmission"]
    CourseMember = models["CourseMember"]
    KnowledgeChunk = models["KnowledgeChunk"]
    KnowledgeDocument = models["KnowledgeDocument"]
    Paper = models["Paper"]
    PaperItem = models["PaperItem"]
    QuestionBank = models["QuestionBank"]
    User = models["User"]

    paper_ids = list(db.scalars(select(Paper.id).where(Paper.creator_id.in_(ids))))
    question_ids = list(db.scalars(select(QuestionBank.id).where(QuestionBank.creator_id.in_(ids))))
    assignment_filters = []
    if ids:
        assignment_filters.append(CourseAssignment.teacher_id.in_(ids))
    if course_ids:
        assignment_filters.append(CourseAssignment.course_id.in_(course_ids))
    assignment_ids = list(db.scalars(select(CourseAssignment.id).where(models["or_"](*assignment_filters)))) if assignment_filters else []
    doc_filters = []
    if ids:
        doc_filters.append(KnowledgeDocument.owner_id.in_(ids))
    if course_ids:
        doc_filters.append(KnowledgeDocument.course_id.in_(course_ids))
    doc_ids = list(db.scalars(select(KnowledgeDocument.id).where(models["or_"](*doc_filters)))) if doc_filters else []
    assistant_session_ids = list(dict.fromkeys(plan.assistant_session_ids))

    if assistant_session_ids:
        db.execute(delete(AssistantMessage).where(AssistantMessage.session_id.in_(assistant_session_ids)))
        db.execute(delete(AssistantSession).where(AssistantSession.id.in_(assistant_session_ids)))

    if paper_ids:
        db.execute(delete(PaperItem).where(PaperItem.paper_id.in_(paper_ids)))
        db.execute(delete(Paper).where(Paper.id.in_(paper_ids)))
    if question_ids:
        db.execute(delete(PaperItem).where(PaperItem.question_id.in_(question_ids)))
        db.execute(delete(QuestionBank).where(QuestionBank.id.in_(question_ids)))
    if doc_ids:
        db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id.in_(doc_ids)))
        db.execute(delete(KnowledgeDocument).where(KnowledgeDocument.id.in_(doc_ids)))
    if assignment_ids:
        db.execute(delete(CourseAssignmentSubmission).where(CourseAssignmentSubmission.assignment_id.in_(assignment_ids)))
        db.execute(delete(CourseAssignment).where(CourseAssignment.id.in_(assignment_ids)))

    if ids:
        db.execute(delete(CourseAssignmentSubmission).where(CourseAssignmentSubmission.student_id.in_(ids)))
        db.execute(delete(CourseMember).where(CourseMember.user_id.in_(ids)))
    if course_ids:
        db.execute(delete(CourseMember).where(CourseMember.course_id.in_(course_ids)))

    db.execute(delete(AgentRun).where(AgentRun.user_id.in_(ids)))
    db.execute(delete(AuditLog).where(AuditLog.user_id.in_(ids)))
    if course_ids:
        db.execute(delete(Course).where(Course.id.in_(course_ids)))

    # Remaining rows are removed by database ON DELETE CASCADE / SET NULL rules from users.
    if ids:
        db.execute(delete(User).where(User.id.in_(ids)))


def run(args: argparse.Namespace) -> int:
    if args.confirm and args.dry_run:
        print("[ERROR] Use either --dry-run or --confirm, not both.")
        return 2

    dry_run = not args.confirm
    health_check(args.api_base_url)
    models = load_models()
    SessionLocal = models["SessionLocal"]

    with SessionLocal() as db:
        plan = build_plan(db, models, DEFAULT_PREFIXES)
        print("=== PrismMind Test Data Cleanup ===")
        print(json.dumps(
            {
                "mode": "dry-run" if dry_run else "confirm",
                "prefixes": list(DEFAULT_PREFIXES),
                "protected_usernames": sorted(PROTECTED_USERNAMES),
                "protected_course_names": sorted(PROTECTED_COURSE_NAMES),
                "matched_user_count": len(plan.user_ids),
                "matched_usernames": plan.usernames,
                "matched_course_ids": plan.course_ids,
                "matched_assistant_session_ids": plan.assistant_session_ids,
                "counts": plan.counts,
                "storage_files": "not deleted",
                "chroma_persisted_data": "not deleted",
            },
            ensure_ascii=False,
            indent=2,
        ))

        if dry_run:
            print("[DRY-RUN] No database rows were deleted. Pass --confirm to execute cleanup.")
            return 0

        delete_rows(db, models, plan)
        db.commit()
        print(f"[DONE] Deleted {len(plan.user_ids)} test users and database-linked test records.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Safely clean PrismMind smoke/test database rows.")
    parser.add_argument("--api-base-url", default="http://127.0.0.1:8000/api/v1")
    parser.add_argument("--dry-run", action="store_true", help="Preview cleanup. This is the default.")
    parser.add_argument("--confirm", action="store_true", help="Actually delete matching test rows.")
    return parser


if __name__ == "__main__":
    raise SystemExit(run(build_parser().parse_args()))
