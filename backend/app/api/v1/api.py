from fastapi import APIRouter, Request

from app.api.v1 import (
    agents,
    assessments,
    assistant,
    auth,
    courses,
    files,
    knowledge,
    learning_paths,
    llm,
    resources,
    student_dashboard,
    student_exercises,
    student_profile,
    tasks,
    teacher_generation,
    tests,
    tutoring,
    users,
)
from app.utils.response import success_response

router = APIRouter()


@router.get("/health", summary="Health check")
def health_check(request: Request):
    return success_response(
        data={"status": "ok", "service": "backend"},
        request=request,
    )


router.include_router(auth.router, prefix="/auth", tags=["Auth"])
router.include_router(assistant.router, prefix="/assistant", tags=["Assistant"])
router.include_router(courses.router, prefix="/courses", tags=["Courses"])
router.include_router(users.router, prefix="/users", tags=["Users"])
router.include_router(teacher_generation.router, prefix="/teacher", tags=["Teacher Generation"])
router.include_router(student_dashboard.router, prefix="/student/dashboard", tags=["student-dashboard"])
router.include_router(student_exercises.router, prefix="/student/exercises", tags=["student-exercises"])
router.include_router(student_profile.router, prefix="/student/profile", tags=["student-profile"])
router.include_router(resources.router, prefix="/student/resources", tags=["Student Resources"])
router.include_router(learning_paths.router, prefix="/student/learning-paths", tags=["Student Learning Paths"])
router.include_router(llm.router, prefix="/llm", tags=["LLM"])
router.include_router(tutoring.router, prefix="/student/tutoring", tags=["Student Tutoring"])
router.include_router(assessments.router, prefix="/student/assessments", tags=["assessments"])
router.include_router(tests.router, prefix="/student/tests", tags=["student-tests"])
router.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
router.include_router(files.router, prefix="/files", tags=["Files"])
router.include_router(knowledge.router, prefix="/knowledge", tags=["Knowledge"])
router.include_router(agents.router, prefix="/agents", tags=["agents"])
