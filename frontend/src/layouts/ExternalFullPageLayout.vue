<template>
  <main
    class="external-full-page-layout"
    :class="{
      'external-full-page-layout--student': isStudentExternalRoute,
      'external-full-page-layout--student-main': isStudentMainRoute,
      'external-full-page-layout--student-portrait': isStudentPortraitRoute,
      'external-full-page-layout--student-resources': isStudentResourcesRoute,
      'external-full-page-layout--teacher-main': isTeacherMainRoute,
      'external-full-page-layout--teacher-training-program': isTeacherTrainingProgramRoute,
      'external-full-page-layout--teacher-curriculum-design': isTeacherCurriculumDesignRoute,
      'external-full-page-layout--teacher-exercise-generation': isTeacherExerciseGenerationRoute,
      'external-full-page-layout--teacher-test-generation': isTeacherTestGenerationRoute,
      'external-full-page-layout--teacher-courses': isTeacherCoursesRoute
    }"
    data-testid="external-full-page-layout"
    @click.capture="handleExternalNavigation"
  >
    <RouterView />
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
let accountMenuObserver: MutationObserver | null = null

function ensureAccountCenterEntries() {
  const popovers = document.querySelectorAll<HTMLElement>(
    '.top-user-popover, .user-popover, [data-nav-popover], #user-popover'
  )
  popovers.forEach((popover) => {
    if (popover.querySelector('[data-account-center-entry]')) return
    const entry = document.createElement('button')
    entry.type = 'button'
    entry.className = 'external-account-center-entry'
    entry.setAttribute('data-account-center-entry', 'true')
    entry.innerHTML = '<strong>个人中心</strong><small>查看基本信息、修改姓名或密码</small>'
    popover.appendChild(entry)
  })
}

function handleExternalNavigation(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return

  const accountEntry = target.closest('[data-account-center-entry]')
  if (accountEntry) {
    event.preventDefault()
    event.stopPropagation()
    router.push('/account')
    return
  }
}

onMounted(() => {
  ensureAccountCenterEntries()
  accountMenuObserver = new MutationObserver(ensureAccountCenterEntries)
  accountMenuObserver.observe(document.body, { childList: true, subtree: true })
})

onBeforeUnmount(() => {
  accountMenuObserver?.disconnect()
  accountMenuObserver = null
})
const isStudentExternalRoute = computed(() => route.path.startsWith('/student/'))
const isStudentMainRoute = computed(() => route.path === '/student/dashboard')
const isStudentPortraitRoute = computed(() => route.path === '/student/profile')
const isStudentResourcesRoute = computed(() => route.path === '/student/resources')
const isTeacherMainRoute = computed(() => route.path === '/teacher/dashboard')
const isTeacherTrainingProgramRoute = computed(() => route.path === '/teacher/training-plans')
const isTeacherCurriculumDesignRoute = computed(() => route.path === '/teacher/course-designs')
const isTeacherExerciseGenerationRoute = computed(() => route.path === '/teacher/exercises')
const isTeacherTestGenerationRoute = computed(() => route.path === '/teacher/papers')
const isTeacherCoursesRoute = computed(() => route.path === '/teacher/courses')
</script>

<style scoped>
.external-full-page-layout {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
  overflow-y: visible;
  background: #020617;
  scrollbar-gutter: stable;
}

.external-full-page-layout--student {
  max-width: 100%;
  overflow-x: clip;
  background: #000;
  scrollbar-gutter: auto;
}

.external-full-page-layout--student-main {
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
}

.external-full-page-layout--student-portrait {
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
}

.external-full-page-layout--student-resources {
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  background: #f3f5ef;
}

.external-full-page-layout--teacher-main {
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  background: #000;
  scrollbar-gutter: auto;
}

.external-full-page-layout--teacher-training-program {
  max-width: 100%;
  overflow-x: clip;
  background: #f5f2ea;
  scrollbar-gutter: auto;
}

.external-full-page-layout--teacher-curriculum-design {
  max-width: 100%;
  overflow-x: clip;
  background: #f5f2ea;
  scrollbar-gutter: auto;
}

.external-full-page-layout--teacher-exercise-generation {
  max-width: 100%;
  overflow-x: clip;
  background: #f5f2ea;
  scrollbar-gutter: auto;
}

.external-full-page-layout--teacher-test-generation {
  max-width: 100%;
  overflow-x: clip;
  background: #f5f2ea;
  scrollbar-gutter: auto;
}

.external-full-page-layout--teacher-courses {
  max-width: 100%;
  overflow: hidden;
  background: #f5f2ea;
  scrollbar-gutter: auto;
}

.external-full-page-layout :deep(.external-react-page-host),
.external-full-page-layout :deep(.external-vanilla-tree-host) {
  width: 100%;
  min-width: 0;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
}

.external-full-page-layout :deep(.external-account-center-entry) {
  display: flex;
  width: 100%;
  margin-top: 10px;
  padding: 10px 12px;
  flex-direction: column;
  gap: 3px;
  border: 1px solid rgba(42, 91, 101, 0.2);
  border-radius: 8px;
  color: #183b43;
  text-align: left;
  background: rgba(238, 247, 245, 0.94);
  cursor: pointer;
}

.external-full-page-layout :deep(.external-account-center-entry:hover) {
  border-color: #4d9299;
  background: #e3f2ef;
}

.external-full-page-layout :deep(.external-account-center-entry strong) {
  font-size: 14px;
}

.external-full-page-layout :deep(.external-account-center-entry small) {
  color: #688489;
  font-size: 11px;
}

.external-full-page-layout--student :deep(.external-react-page-host),
.external-full-page-layout--student :deep(.external-vanilla-tree-host) {
  max-width: 100%;
  overflow-x: clip;
  background: #000;
  scrollbar-gutter: auto;
}

.external-full-page-layout--student-main :deep(.external-react-page-host),
.external-full-page-layout--student-main :deep(.external-vanilla-tree-host) {
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
}

.external-full-page-layout--student-portrait :deep(.external-react-page-host) {
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
}

.external-full-page-layout--student-resources :deep(.external-react-page-host) {
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  background: #f3f5ef;
}

.external-full-page-layout--teacher-main :deep(.external-vanilla-tree-host) {
  max-width: 100%;
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  background: #000;
  scrollbar-gutter: auto;
}

.external-full-page-layout--teacher-training-program :deep(.external-react-page-host) {
  max-width: 100%;
  overflow-x: clip;
  background: #f5f2ea;
  scrollbar-gutter: auto;
}

.external-full-page-layout--teacher-curriculum-design :deep(.external-react-page-host) {
  max-width: 100%;
  overflow-x: clip;
  background: #f5f2ea;
  scrollbar-gutter: auto;
}

.external-full-page-layout--teacher-exercise-generation :deep(.external-react-page-host) {
  max-width: 100%;
  overflow-x: clip;
  background: #f5f2ea;
  scrollbar-gutter: auto;
}

.external-full-page-layout--teacher-test-generation :deep(.external-react-page-host) {
  max-width: 100%;
  overflow-x: clip;
  background: #f5f2ea;
  scrollbar-gutter: auto;
}

.external-full-page-layout--teacher-courses :deep(.external-react-page-host) {
  max-width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: #f5f2ea;
  scrollbar-gutter: auto;
}
</style>
