import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'
import { resolveApiBaseURL } from '@/api/baseUrl'

import blackHoleSource from './vanilla/black-hole-background.js?raw'
import studentHtml from './vanilla/student-main.html?raw'
import studentMainSource from './vanilla/student-main.cleaned.js?raw'

const BLACK_HOLE_FACTORY = new Function(
  `${blackHoleSource.replace('export function createBlackHoleBackground', 'function createBlackHoleBackground')}
return createBlackHoleBackground;`
)() as (container: Element | null) => () => void

const API_BASE_URL = resolveApiBaseURL()

const DASHBOARD_SUMMARY_STYLES = `
  .student-dashboard-summary-dock {
    position: absolute;
    left: max(28px, env(safe-area-inset-left));
    bottom: max(28px, env(safe-area-inset-bottom));
    z-index: 5;
    display: grid;
    width: min(520px, calc(100vw - 56px));
    gap: 12px;
    padding: 16px;
    border: 1px solid rgba(250, 204, 21, 0.18);
    border-radius: 18px;
    background:
      radial-gradient(circle at 12% 10%, rgba(250, 204, 21, 0.14), transparent 34%),
      rgba(3, 8, 18, 0.58);
    box-shadow: 0 20px 70px rgba(0, 0, 0, 0.28);
    color: rgba(255, 255, 255, 0.86);
    backdrop-filter: blur(16px);
  }

  .student-dashboard-summary-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .student-dashboard-summary-head strong {
    color: rgba(255, 255, 255, 0.95);
    font-size: 15px;
    letter-spacing: 0;
  }

  .student-dashboard-summary-head span,
  .student-dashboard-summary-error {
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
    line-height: 1.55;
  }

  .student-dashboard-summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .student-dashboard-summary-metric {
    display: grid;
    min-height: 64px;
    align-content: center;
    gap: 4px;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.075);
  }

  .student-dashboard-summary-metric span {
    color: rgba(255, 255, 255, 0.58);
    font-size: 11px;
  }

  .student-dashboard-summary-metric strong {
    color: #fff7cc;
    font-size: 20px;
    line-height: 1;
  }

  @media (max-width: 720px) {
    .student-dashboard-summary-dock {
      right: 14px;
      bottom: 18px;
      left: 14px;
      width: auto;
    }

    .student-dashboard-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .student-dashboard-summary-dock {
    display: none !important;
  }
`

const DASHBOARD_SUMMARY_INTEGRATION = `
state.dashboardSummary = null;
state.dashboardSummaryLoading = false;
state.dashboardSummaryError = "";

function dashboardApiUrl(endpoint) {
  if (/^https?:\\/\\//i.test(endpoint)) return endpoint;
  if (endpoint.startsWith("/api/v1")) return apiBaseUrl + endpoint.slice("/api/v1".length);
  if (endpoint.startsWith("/")) return apiBaseUrl + endpoint;
  return apiBaseUrl + "/" + endpoint;
}

function getDashboardAuthToken() {
  return window.localStorage.getItem("access_token")
    || window.localStorage.getItem("prismmind_access_token")
    || window.localStorage.getItem("edugenie_access_token");
}

function unwrapDashboardPayload(payload) {
  if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data")) {
    if (payload.code && payload.code !== 0) {
      throw new Error(payload.message || "学习概览加载失败");
    }
    return payload.data;
  }
  return payload;
}

async function requestDashboardSummary() {
  const token = getDashboardAuthToken();
  const response = await fetch(dashboardApiUrl("/student/dashboard/summary"), {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 401) throw new Error("登录已失效，请重新登录");
  if (response.status === 403) throw new Error("当前账号无权访问学习概览");
  if (!response.ok) throw new Error(payload?.message || "学习概览加载失败");
  return unwrapDashboardPayload(payload);
}

function ensureDashboardSummaryDock() {
  const root = document.querySelector(".page-root");
  if (!root) return null;
  let dock = root.querySelector(".student-dashboard-summary-dock");
  if (!dock) {
    dock = document.createElement("section");
    dock.className = "student-dashboard-summary-dock";
    dock.setAttribute("aria-label", "学生学习概览");
    root.appendChild(dock);
  }
  return dock;
}

function dashboardNumber(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function dashboardMetric(label, value) {
  return '<div class="student-dashboard-summary-metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
}

function renderDashboardSummaryDock() {
  const dock = ensureDashboardSummaryDock();
  if (!dock) return;
  if (state.dashboardSummaryLoading) {
    dock.innerHTML = '<div class="student-dashboard-summary-head"><strong>学习概览</strong><span>正在同步真实学习数据</span></div>';
    return;
  }
  if (state.dashboardSummaryError) {
    dock.innerHTML = '<div class="student-dashboard-summary-head"><strong>学习概览</strong><span>稍后可刷新页面重试</span></div><p class="student-dashboard-summary-error">' + escapeHtml(state.dashboardSummaryError) + '</p>';
    return;
  }
  const summary = state.dashboardSummary;
  if (!summary) {
    dock.innerHTML = '<div class="student-dashboard-summary-head"><strong>学习概览</strong><span>暂无学习数据</span></div>';
    return;
  }
  const metrics = [
    dashboardMetric("课程", dashboardNumber(summary.courses?.total)),
    dashboardMetric("资源", dashboardNumber(summary.resources?.total)),
    dashboardMetric("路径", dashboardNumber(summary.learning_paths?.total)),
    dashboardMetric("评估", dashboardNumber(summary.assessments?.total)),
    dashboardMetric("平均分", Math.round(dashboardNumber(summary.assessments?.average_score))),
    dashboardMetric("辅导", dashboardNumber(summary.tutoring?.sessions)),
  ].join("");
  const provider = summary.llm?.real_provider_enabled ? "真实模型已启用" : "本地模型模式";
  dock.innerHTML = '<div class="student-dashboard-summary-head"><strong>学习概览</strong><span>' + escapeHtml(provider) + '</span></div><div class="student-dashboard-summary-grid">' + metrics + '</div>';
}

function parseStoredDashboardUser() {
  const keys = ["edugenie_user_info", "prismmind_user_info", "user_info"];
  for (const key of keys) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function dashboardUserName(user) {
  const value = user?.username || user?.name || user?.full_name || user?.email;
  const text = String(value || "").trim();
  return text || "学生端";
}

function dashboardRoleText(user) {
  const role = String(user?.role || "").toLowerCase();
  if (role.includes("admin")) return "管理员代管";
  if (role.includes("teacher")) return "教师代管";
  return "学生端";
}

function dashboardSummaryText() {
  if (state.dashboardSummaryLoading) return "学习概览同步中";
  if (state.dashboardSummaryError) return "学习概览稍后可用";
  if (state.dashboardSummary) return "学习概览已同步";
  return "暂无学习概览";
}

function renderStudentMainUserPopover() {
  if (!userPopover) return;
  const user = parseStoredDashboardUser();
  userPopover.innerHTML = '<div>' + escapeHtml(dashboardUserName(user)) + '</div><div class="user-popover__role">' + escapeHtml(dashboardRoleText(user) + " · " + dashboardSummaryText()) + '</div><button class="user-popover__account" type="button"><strong>个人中心</strong><small>查看基本信息、修改姓名或密码</small></button>';
  userPopover.querySelector(".user-popover__account")?.addEventListener("click", () => {
    window.location.assign("/account");
  });
}

async function loadDashboardSummary() {
  state.dashboardSummaryLoading = true;
  state.dashboardSummaryError = "";
  renderDashboardSummaryDock();
  renderStudentMainUserPopover();
  try {
    state.dashboardSummary = await requestDashboardSummary();
  } catch (error) {
    state.dashboardSummary = null;
    state.dashboardSummaryError = error instanceof Error ? error.message : "学习概览加载失败";
  } finally {
    state.dashboardSummaryLoading = false;
    renderDashboardSummaryDock();
    renderStudentMainUserPopover();
  }
}

renderStudentMainUserPopover();
loadDashboardSummary();
`

const COURSE_PAGE_STYLES = `
  .function-panel.is-course-panel .panel-content {
    width: min(680px, 100%);
  }

  .function-panel.is-course-panel .panel-enter {
    display: none;
  }

  .student-course-workspace {
    display: grid;
    gap: 18px;
    padding-bottom: 28px;
  }

  .student-course-toolbar,
  .student-course-form,
  .student-course-pager,
  .student-course-meta,
  .student-course-card__actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .student-course-toolbar {
    justify-content: space-between;
    padding: 14px;
    border: 1px solid rgba(250, 204, 21, 0.18);
    border-radius: 18px;
    background: rgba(8, 12, 24, 0.56);
  }

  .student-course-toolbar strong,
  .student-course-empty strong {
    color: rgba(255, 255, 255, 0.92);
    font-size: 15px;
  }

  .student-course-toolbar span,
  .student-course-empty p,
  .student-course-message,
  .student-course-error,
  .student-course-meta {
    color: rgba(255, 255, 255, 0.68);
    font-size: 13px;
    line-height: 1.65;
  }

  .student-course-form {
    align-items: stretch;
  }

  .student-course-form input {
    flex: 1 1 190px;
    min-width: 0;
    height: 42px;
    padding: 0 14px;
    border: 1px solid rgba(250, 204, 21, 0.22);
    border-radius: 14px;
    outline: 0;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.92);
    font: inherit;
  }

  .student-course-form input::placeholder {
    color: rgba(255, 255, 255, 0.38);
  }

  .student-course-button {
    min-height: 42px;
    padding: 0 14px;
    border: 1px solid rgba(250, 204, 21, 0.32);
    border-radius: 14px;
    background: rgba(250, 204, 21, 0.1);
    color: #fff7cc;
    font: inherit;
    font-size: 13px;
    font-weight: 750;
    cursor: pointer;
    transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
  }

  .student-course-button:hover:not(:disabled),
  .student-course-button:focus-visible:not(:disabled) {
    border-color: rgba(250, 204, 21, 0.62);
    background: rgba(249, 115, 22, 0.18);
    transform: translateY(-1px);
  }

  .student-course-button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .student-course-button--primary {
    border-color: rgba(249, 115, 22, 0.66);
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.88), rgba(250, 204, 21, 0.54));
    color: #140900;
    box-shadow: 0 16px 42px rgba(249, 115, 22, 0.18);
  }

  .student-course-list {
    display: grid;
    gap: 14px;
  }

  .student-course-card,
  .student-course-empty,
  .student-course-loading {
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 20px;
    background:
      radial-gradient(circle at 0 0, rgba(250, 204, 21, 0.13), transparent 34%),
      rgba(255, 255, 255, 0.07);
    box-shadow: 0 22px 60px rgba(0, 0, 0, 0.22);
  }

  .student-course-card {
    display: grid;
    gap: 13px;
    padding: 16px;
  }

  .student-course-card h3 {
    margin: 0;
    color: rgba(255, 255, 255, 0.94);
    font-size: 18px;
    line-height: 1.3;
  }

  .student-course-card p {
    margin: 6px 0 0;
    color: rgba(255, 255, 255, 0.64);
    font-size: 13px;
    line-height: 1.7;
  }

  .student-course-status {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: 4px 10px;
    border: 1px solid rgba(117, 245, 223, 0.32);
    border-radius: 999px;
    background: rgba(117, 245, 223, 0.1);
    color: #c9fff6;
    font-size: 12px;
    font-weight: 750;
  }

  .student-course-empty,
  .student-course-loading {
    padding: 24px;
    text-align: center;
  }

  .student-course-loading {
    display: grid;
    place-items: center;
    gap: 12px;
    color: rgba(255, 255, 255, 0.76);
  }

  .student-course-loading span {
    width: 28px;
    height: 28px;
    border: 2px solid rgba(250, 204, 21, 0.18);
    border-top-color: rgba(250, 204, 21, 0.92);
    border-radius: 999px;
    animation: student-course-spin 0.8s linear infinite;
  }

  .student-course-message,
  .student-course-error {
    padding: 10px 12px;
    border-radius: 14px;
  }

  .student-course-message {
    border: 1px solid rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.12);
    color: #c7f9d4;
  }

  .student-course-error {
    border: 1px solid rgba(248, 113, 113, 0.34);
    background: rgba(248, 113, 113, 0.12);
    color: #fecaca;
  }

  .student-course-pager {
    justify-content: flex-end;
  }

  @keyframes student-course-spin {
    to {
      transform: rotate(360deg);
    }
  }
`

const COURSE_PANEL_INTEGRATION = `
state.courseList = [];
state.courseTotal = 0;
state.coursePage = 1;
state.coursePageSize = 12;
state.courseLoading = false;
state.courseJoining = false;
state.courseError = "";
state.courseMessage = "";
state.courseJoinCode = "";

function courseApiUrl(endpoint) {
  if (/^https?:\\/\\//i.test(endpoint)) return endpoint;
  if (endpoint.startsWith("/api/v1")) return apiBaseUrl + endpoint.slice("/api/v1".length);
  if (endpoint.startsWith("/")) return apiBaseUrl + endpoint;
  return apiBaseUrl + "/" + endpoint;
}

function getCourseAuthToken() {
  return window.localStorage.getItem("access_token")
    || window.localStorage.getItem("prismmind_access_token")
    || window.localStorage.getItem("edugenie_access_token");
}

function courseApiMessage(payload, fallback) {
  if (payload && typeof payload === "object") {
    return payload.message || payload.detail || payload.error || fallback;
  }
  return fallback;
}

function unwrapCoursePayload(payload) {
  if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data")) {
    return payload.data;
  }
  return payload;
}

async function requestCourseJson(url, options) {
  const token = getCourseAuthToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (response.status === 401) throw new Error("登录已失效，请重新登录");
  if (response.status === 403) throw new Error("权限不足，无法访问课程");
  if (response.status === 404) throw new Error("课程不存在或已被移除");
  if (!response.ok) throw new Error(courseApiMessage(payload, "课程服务暂时不可用"));
  if (payload && typeof payload === "object" && payload.code && payload.code !== 0) {
    throw new Error(courseApiMessage(payload, "课程请求失败"));
  }
  return unwrapCoursePayload(payload);
}

function normalizeCourseList(payload, fallbackPage) {
  if (Array.isArray(payload)) {
    return { items: payload, total: payload.length, page: fallbackPage, page_size: state.coursePageSize };
  }
  if (payload && typeof payload === "object") {
    const items = Array.isArray(payload.items) ? payload.items : [];
    return {
      items,
      total: Number(payload.total ?? items.length),
      page: Number(payload.page ?? fallbackPage),
      page_size: Number(payload.page_size ?? state.coursePageSize),
    };
  }
  return { items: [], total: 0, page: fallbackPage, page_size: state.coursePageSize };
}

function courseText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function compactCourseText(value, fallback) {
  const text = courseText(value, fallback);
  return text.length > 76 ? text.slice(0, 76) + "..." : text;
}

function formatCourseDate(value) {
  if (!value) return "暂无更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无更新";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function renderCourseWorkspace() {
  const totalPages = Math.max(1, Math.ceil(state.courseTotal / state.coursePageSize));
  const listMarkup = state.courseLoading
    ? '<div class="student-course-loading" data-testid="external-loading"><span></span><p>正在加载我的课程</p></div>'
    : state.courseList.length
      ? '<div class="student-course-list">' + state.courseList.map(renderCourseCard).join("") + '</div>'
      : '<div class="student-course-empty"><strong>暂无课程</strong><p>暂无课程，请输入教师提供的课程码加入课程。</p></div>';

  return \`
    <div class="student-course-workspace" data-testid="external-student-courses">
      <section class="student-course-toolbar">
        <div>
          <strong>课程总览</strong>
          <span>当前已加入 \${escapeHtml(state.courseTotal)} 门课程</span>
        </div>
        <button class="student-course-button" type="button" data-course-action="refresh" \${state.courseLoading ? "disabled" : ""}>
          刷新课程
        </button>
      </section>
      <form class="student-course-form" data-course-action="join">
        <input name="courseCode" value="\${escapeHtml(state.courseJoinCode)}" placeholder="例如：PM-AB12CD" autocomplete="off" />
        <button class="student-course-button student-course-button--primary" type="submit" \${state.courseJoining ? "disabled" : ""}>
          \${state.courseJoining ? "正在加入" : "加入课程"}
        </button>
      </form>
      \${state.courseMessage ? '<div class="student-course-message">' + escapeHtml(state.courseMessage) + '</div>' : ""}
      \${state.courseError ? '<div class="student-course-error">' + escapeHtml(state.courseError) + '</div>' : ""}
      \${listMarkup}
      <div class="student-course-pager">
        <button class="student-course-button" type="button" data-course-page="\${state.coursePage - 1}" \${state.coursePage <= 1 || state.courseLoading ? "disabled" : ""}>上一页</button>
        <span class="student-course-meta">第 \${escapeHtml(state.coursePage)} / \${escapeHtml(totalPages)} 页</span>
        <button class="student-course-button" type="button" data-course-page="\${state.coursePage + 1}" \${state.coursePage >= totalPages || state.courseLoading ? "disabled" : ""}>下一页</button>
      </div>
    </div>
  \`;
}

function renderCourseCard(course) {
  const id = course.id ?? course.course_id;
  const name = courseText(course.name || course.title, "未命名课程");
  const description = compactCourseText(course.description, "暂无课程简介");
  const code = courseText(course.code || course.invite_code || course.course_code, "暂无课程码");
  const teacher = courseText(course.teacher_name || course.teacher?.username || course.teacher?.name, "课程教师");
  const count = Number(course.student_count ?? course.member_count ?? 0);
  const status = course.status === "archived" ? "已归档" : "进行中";
  return \`
    <article class="student-course-card" data-course-id="\${escapeHtml(id)}">
      <div>
        <span class="student-course-status">\${escapeHtml(status)}</span>
        <h3>\${escapeHtml(name)}</h3>
        <p>\${escapeHtml(description)}</p>
      </div>
      <div class="student-course-meta">
        <span>授课教师：\${escapeHtml(teacher)}</span>
        <span>课程码：\${escapeHtml(code)}</span>
        <span>成员：\${escapeHtml(count)}</span>
        <span>更新：\${escapeHtml(formatCourseDate(course.updated_at || course.joined_at || course.created_at))}</span>
      </div>
      <div class="student-course-card__actions">
        <button class="student-course-button student-course-button--primary" type="button" data-course-enter="\${escapeHtml(id)}">进入学习</button>
      </div>
    </article>
  \`;
}

const originalRenderInfoBody = renderInfoBody;
renderInfoBody = function renderInfoBodyWithCourses(feature, info) {
  if (feature?.id === "my-courses") {
    const content = info || {};
    return \`
      <p class="panel-description">\${escapeHtml(content.body || feature.description)}</p>
      \${renderCourseWorkspace()}
    \`;
  }
  return originalRenderInfoBody(feature, info);
};

const originalRenderPanel = renderPanel;
renderPanel = function renderPanelWithCourseEvents() {
  originalRenderPanel();
  panel?.classList.toggle("is-course-panel", state.panelNodeId === "my-courses" || state.activeNodeId === "my-courses");
  bindStudentCoursePanel();
};

async function loadStudentCourses(nextPage) {
  state.courseLoading = true;
  state.courseError = "";
  renderPanel();
  try {
    const page = Math.max(1, Number(nextPage || state.coursePage || 1));
    const payload = await requestCourseJson(courseApiUrl(API_ENDPOINTS.userCourses) + "?page=" + page + "&page_size=" + state.coursePageSize, { method: "GET" });
    const normalized = normalizeCourseList(payload, page);
    state.courseList = normalized.items;
    state.courseTotal = normalized.total;
    state.coursePage = normalized.page;
    state.coursePageSize = normalized.page_size || state.coursePageSize;
  } catch (error) {
    state.courseError = error instanceof Error ? error.message : "课程列表加载失败";
    state.courseList = [];
    state.courseTotal = 0;
  } finally {
    state.courseLoading = false;
    renderPanel();
  }
}

async function joinStudentCourse(code) {
  state.courseJoining = true;
  state.courseError = "";
  state.courseMessage = "";
  renderPanel();
  try {
    const payload = await requestCourseJson(courseApiUrl("/courses/join"), {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    state.courseJoinCode = "";
    state.courseMessage = payload?.already_joined ? "你已加入该课程，课程列表已刷新。" : "课程加入成功，课程列表已刷新。";
    await loadStudentCourses(1);
  } catch (error) {
    state.courseError = error instanceof Error ? error.message : "加入课程失败，请检查课程码";
  } finally {
    state.courseJoining = false;
    renderPanel();
  }
}

function bindStudentCoursePanel() {
  const root = panel?.querySelector('[data-testid="external-student-courses"]');
  if (!root) return;

  root.querySelector('[data-course-action="refresh"]')?.addEventListener("click", () => loadStudentCourses(state.coursePage));
  root.querySelectorAll("[data-course-page]").forEach((button) => {
    button.addEventListener("click", () => loadStudentCourses(Number(button.dataset.coursePage)));
  });
  root.querySelectorAll("[data-course-enter]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.courseEnter;
      if (id) window.location.href = "/student/courses/" + encodeURIComponent(id);
    });
  });
  root.querySelector('[data-course-action="join"]')?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form?.querySelector('input[name="courseCode"]');
    const code = String(input?.value || "").trim();
    state.courseJoinCode = code;
    if (!code) {
      state.courseError = "请输入教师提供的课程码。";
      renderPanel();
      return;
    }
    joinStudentCourse(code);
  });
  root.querySelector('input[name="courseCode"]')?.addEventListener("input", (event) => {
    state.courseJoinCode = event.target?.value || "";
  });
}

const originalSelectFeature = selectFeature;
selectFeature = async function selectFeatureWithCourseLoad(id) {
  await originalSelectFeature(id);
  if (id === "my-courses") {
    loadStudentCourses(1);
  }
};

const originalHandleEnterFeature = handleEnterFeature;
handleEnterFeature = function handleEnterFeatureWithCourses(activeNodeId) {
  if (activeNodeId === "my-courses") {
    selectFeature("my-courses");
    return;
  }
  originalHandleEnterFeature(activeNodeId);
};
`

interface StudentMainOptions {
  courseMode?: boolean
  initialFeatureId?: string
}

function buildTemplate(html: string, options: StudentMainOptions = {}) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  parsed.querySelectorAll('script').forEach((item) => item.remove())
  const styles = Array.from(parsed.head.querySelectorAll('style'))
    .map((item) => item.textContent || '')
    .join('\n')
  const embeddedCourseLayoutOverrides = `
      :host,
      .page-root,
      #app,
      .blackhole-bg,
      .tree-interactive-nodes {
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        overflow-x: clip;
        scrollbar-gutter: auto;
      }
      #app canvas,
      .blackhole-bg canvas {
        max-width: 100%;
      }
      .page-root {
        position: absolute !important;
        inset: 0 !important;
        min-height: 100vh;
        min-height: 100dvh;
      }
      .top-nav,
      .tree-interactive-nodes,
      .feature-sidebar,
      .function-panel,
      .user-popover,
      .sidebar-toggle {
        position: absolute !important;
      }
      .feature-sidebar::after {
        position: absolute !important;
      }
  `

  return `
    <style>
      :host {
        display: block;
        position: relative;
        width: 100%;
        max-width: 100%;
        height: 100vh;
        height: 100dvh;
        min-height: 100vh;
        min-height: 100dvh;
        overflow: hidden;
        background: #000;
        box-sizing: border-box;
        scrollbar-gutter: auto;
      }
      ${styles}
      ${options.courseMode ? embeddedCourseLayoutOverrides : ''}
      ${options.courseMode ? COURSE_PAGE_STYLES : DASHBOARD_SUMMARY_STYLES}
    </style>
    ${parsed.body.innerHTML}
  `
}

function stripImports(source: string) {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('import '))
    .join('\n')
}

function executeOriginalMain(shadowRoot: ShadowRoot, options: StudentMainOptions = {}) {
  const source = stripImports(studentMainSource)
  const disposeEventName = '__prismmind_student_tree_dispose'
  const executableSource = source.replace(
    'window.addEventListener("pagehide", disposeScene, { once: true });',
    `window.addEventListener("pagehide", disposeScene, { once: true });
window.addEventListener("${disposeEventName}", disposeScene, { once: true });`
  )

  const scopedDocument = {
    querySelector(selector: string) {
      return shadowRoot.querySelector(selector) || document.querySelector(selector)
    },
    createElement(tagName: string) {
      return document.createElement(tagName)
    },
    body: {
      appendChild(element: Element) {
        shadowRoot.appendChild(element)
        return element
      }
    }
  }

  const run = new Function(
    'THREE',
    'GLTFLoader',
    'MeshSurfaceSampler',
    'OrbitControls',
    'createBlackHoleBackground',
    'document',
    'window',
    'apiBaseUrl',
    'initialFeatureId',
    `${executableSource}
${options.courseMode ? '' : DASHBOARD_SUMMARY_INTEGRATION}
${options.courseMode ? COURSE_PANEL_INTEGRATION : ''}
if (initialFeatureId) {
  window.setTimeout(() => selectFeature(initialFeatureId), 160);
}
//# sourceURL=prismmind-student-external-tree.js`
  )

  run(
    THREE,
    GLTFLoader,
    MeshSurfaceSampler,
    OrbitControls,
    BLACK_HOLE_FACTORY,
    scopedDocument,
    window,
    API_BASE_URL,
    options.initialFeatureId || null
  )

  return () => {
    window.dispatchEvent(new Event(disposeEventName))
  }
}

interface ExternalStudentMainProps {
  courseMode?: boolean
  initialFeatureId?: string
  testId?: string
}

function ExternalStudentMainBase({
  courseMode = false,
  initialFeatureId,
  testId = 'external-student-main'
}: ExternalStudentMainProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = buildTemplate(studentHtml, { courseMode })
    const pageRoot = shadowRoot.querySelector('.page-root')
    pageRoot?.setAttribute('data-external-source', 'Student/student_main')
    if (courseMode) pageRoot?.setAttribute('data-external-student-subpage', 'my-courses')

    const dispose = executeOriginalMain(shadowRoot, { courseMode, initialFeatureId })

    return () => {
      dispose()
      shadowRoot.innerHTML = ''
    }
  }, [courseMode, initialFeatureId])

  return <div ref={hostRef} className="external-vanilla-tree-host" data-testid={testId} />
}

export function ExternalStudentMain() {
  return <ExternalStudentMainBase />
}

export function ExternalStudentCourses() {
  return <ExternalStudentMainBase courseMode initialFeatureId="my-courses" testId="external-student-courses-shell" />
}

export default ExternalStudentMain
