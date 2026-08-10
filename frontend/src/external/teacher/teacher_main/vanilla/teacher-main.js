import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createBlackHoleBackground } from "./blackHoleBackground.js";

const MODEL_URL = "/external/teacher/teacher_main/tree.glb";
const SAMPLE_COUNT = 42000;
const MAX_PIXEL_RATIO = 3;
const DEBUG_LAYOUT = false;
const TREE_SCALE = 1.2;
const LAYOUT = {
  visualX: 0.3,
  treeRootY: 0.73,
};
const MAX_DRAG_ROTATION_Y = 0.18;
const MAX_DRAG_ROTATION_X = 0.08;
const TREE_FOCUS_DURATION = 1350;
const PANEL_SLIDE_DURATION = 820;
const CONTENT_SWITCH_DURATION = 560;

const app = document.querySelector("#app");
const blackHoleLayer = document.querySelector("#blackhole-bg");
const loading = document.querySelector("#loading");
const nodesLayer = document.querySelector("#tree-nodes");
const sidebar = document.querySelector("#feature-sidebar");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const panel = document.querySelector("#function-panel");
const homeButton = document.querySelector("#home-button");
const userButton = document.querySelector("#user-button");
const logoutButton = document.querySelector("#logout-button");
const userPopover = document.querySelector("#user-popover");
const userName = document.querySelector("#teacher-user-name");
const userRole = document.querySelector("#teacher-user-role");
const accountCenterButton = document.querySelector("#account-center-button");
const destroyBlackHoleBackground = createBlackHoleBackground(blackHoleLayer);
let lastDpr = window.devicePixelRatio || 1;
let dprWatchFrame = 0;

const API_ENDPOINTS = {
  trainingPlanGenerate: "/api/v1/teacher/training-plans/generate",
  courseDesignGenerate: "/api/v1/teacher/course-designs/generate",
  exercisesGenerate: "/api/v1/teacher/exercises/generate",
  papersGenerate: "/api/v1/teacher/papers/generate",
  myCourses: "/api/v1/courses/my",
  myExercises: "/api/v1/teacher/generated-artifacts?artifact_type=exercise",
  myPapers: "/api/v1/teacher/generated-artifacts?artifact_type=paper",
};

const FEATURE_ROUTES = {
  "training-plan": "/teacher/training-plans",
  "course-design": "/teacher/course-designs",
  "exercise-generate": "/teacher/exercises",
  "paper-generate": "/teacher/papers",
  "my-courses": "/teacher/courses",
  "my-exercises": "/teacher/artifacts?artifact_type=exercise",
  "my-papers": "/teacher/artifacts?artifact_type=paper",
};

const FEATURE_CATEGORIES = [
  {
    id: "teaching-center",
    title: "教学中心",
    items: [
      {
        id: "training-plan",
        title: "智能培养方案生成",
        description: "输入培养目标，自动生成培养方案文档",
        endpoint: API_ENDPOINTS.trainingPlanGenerate,
        actionLabel: "生成培养方案",
        resultTitle: "培养方案文档预览",
        fields: [
          { name: "goal", label: "培养目标", type: "textarea", wide: true },
          { name: "major", label: "专业方向" },
          { name: "grade", label: "年级/学段" },
          { name: "cycle", label: "课程周期" },
        ],
      },
      {
        id: "course-design",
        title: "课程设计生成",
        description: "自动生成课程教学设计",
        endpoint: API_ENDPOINTS.courseDesignGenerate,
        actionLabel: "生成课程设计",
        resultTitle: "课程教学设计预览",
        fields: [
          { name: "courseName", label: "课程名称" },
          { name: "hours", label: "课时" },
          { name: "objective", label: "教学目标", type: "textarea", wide: true },
          { name: "studentBase", label: "学生基础", type: "textarea", wide: true },
        ],
      },
    ],
  },
  {
    id: "toolbox",
    title: "工具箱",
    items: [
      {
        id: "exercise-generate",
        title: "习题批量生成",
        description: "根据知识点自动生成练习题",
        endpoint: API_ENDPOINTS.exercisesGenerate,
        actionLabel: "生成习题",
        resultTitle: "习题列表预览",
        fields: [
          { name: "knowledge", label: "知识点", type: "textarea", wide: true },
          { name: "questionType", label: "题型" },
          { name: "difficulty", label: "难度" },
          { name: "count", label: "数量" },
        ],
      },
      {
        id: "paper-generate",
        title: "试卷智能生成",
        description: "AI 生成完整试卷",
        endpoint: API_ENDPOINTS.papersGenerate,
        actionLabel: "生成试卷",
        resultTitle: "试卷结构预览",
        fields: [
          { name: "scope", label: "考试范围", type: "textarea", wide: true },
          { name: "ratio", label: "题型比例" },
          { name: "difficulty", label: "难度" },
          { name: "score", label: "总分" },
          { name: "duration", label: "时长" },
        ],
      },
    ],
  },
  {
    id: "mine",
    title: "我的",
    items: [
      {
        id: "my-courses",
        title: "我的课程",
        description: "查看和管理已生成/已保存课程",
        panelMode: "info",
        listType: "courses",
        endpoint: API_ENDPOINTS.myCourses,
        itemActions: ["查看", "编辑", "删除"],
      },
      {
        id: "my-exercises",
        title: "我的习题",
        description: "查看和管理已生成/已保存习题",
        panelMode: "info",
        listType: "exercises",
        endpoint: API_ENDPOINTS.myExercises,
        itemActions: ["查看", "编辑", "删除"],
      },
      {
        id: "my-papers",
        title: "我的试卷",
        description: "查看和管理已生成/已保存试卷",
        panelMode: "info",
        listType: "papers",
        endpoint: API_ENDPOINTS.myPapers,
        itemActions: ["查看", "编辑", "删除", "导出"],
      },
    ],
  },
];

const FEATURES = FEATURE_CATEGORIES.flatMap((category) =>
  category.items.map((item) => ({ ...item, categoryId: category.id, categoryTitle: category.title })),
);
const FEATURE_BY_ID = new Map(FEATURES.map((feature) => [feature.id, feature]));

const FEATURE_INFO = {
  "training-plan": {
    intro: "面向专业建设与课程体系规划的智能方案生成入口。",
    body: "围绕培养目标、学生发展路径与课程支撑关系，辅助教师快速梳理培养定位、能力结构与阶段性教学安排，形成更完整的培养方案说明框架。",
    highlights: ["对齐培养目标与能力要求", "梳理课程体系与阶段任务", "适合专业建设、方案修订与教学评审准备"],
    output: "可沉淀为培养目标说明、课程结构建议、实施路径与评价要点参考。",
  },
  "course-design": {
    intro: "将课程目标转化为清晰、可执行的教学设计蓝图。",
    body: "帮助教师围绕课程定位、教学目标、学情基础与课时安排，组织课程内容结构、教学节奏与评价方式，让课程设计从零散想法变成可复用的教学方案。",
    highlights: ["生成课程结构与教学单元安排", "辅助设计目标、内容与评价闭环", "适用于新课建设、课程优化与教案初稿"],
    output: "可输出课程简介、教学目标、内容模块、课时建议与考核方式说明。",
  },
  "exercise-generate": {
    intro: "根据知识点快速组织成套练习资源。",
    body: "面向日常训练、课后巩固与阶段检测，帮助教师围绕核心知识点生成不同难度和题型的练习结构，提升习题准备效率。",
    highlights: ["覆盖知识点、题型与难度层级", "适合课堂练习与课后作业", "便于后续整理为习题集或专项训练"],
    output: "可沉淀为习题清单、答案解析方向、知识点覆盖说明与训练建议。",
  },
  "paper-generate": {
    intro: "面向考试与测评场景的试卷结构生成入口。",
    body: "根据考试范围、题型比例、难度梯度与分值要求，辅助教师形成完整试卷框架，让命题过程更有结构，也更便于检查知识覆盖与评价目标。",
    highlights: ["组织试卷结构与分值分布", "兼顾难度梯度与知识覆盖", "适合单元测验、期中期末与模拟考试"],
    output: "可生成试卷蓝图、题型配置、分值建议、测评目标与导出说明。",
  },
  "my-courses": {
    intro: "集中查看与管理已生成、已保存的课程资源。",
    body: "作为课程资产的入口，帮助教师回看历史课程设计、继续完善草稿，并在不同教学任务之间复用已有结构与内容。",
    highlights: ["聚合课程设计与课程草稿", "支持后续查看、编辑与复用", "适合持续建设个人课程资源库"],
    output: "可展示课程名称、更新时间、课程状态与后续管理入口。",
  },
  "my-exercises": {
    intro: "管理已生成的习题集合与专项训练资源。",
    body: "帮助教师整理不同知识点、班级或阶段的习题集合，便于后续筛选、复用、调整与二次编辑，形成持续积累的练习资源库。",
    highlights: ["沉淀按知识点组织的习题集合", "便于复用与二次编辑", "适合课后练习、专项训练与阶段复习"],
    output: "可展示习题集名称、题量、难度、更新时间与管理入口。",
  },
  "my-papers": {
    intro: "查看与维护已生成的试卷与测评方案。",
    body: "集中管理试卷草稿、正式试卷与可导出的测评文件，帮助教师在多次考试与教学周期中复用命题结构，提升测评资源管理效率。",
    highlights: ["集中管理试卷草稿与成稿", "支持后续编辑、删除与导出", "适合阶段测评、模拟考试与教学归档"],
    output: "可展示试卷名称、分值、时长、状态与导出入口。",
  },
};

const state = {
  activeNodeId: null,
  activeCategory: null,
  previousNodeId: null,
  panelVisible: false,
  panelOpen: false,
  panelNodeId: null,
  contentTransitionDirection: "up",
  isSwitchingContent: false,
  contentTransition: null,
  formData: {},
  loading: false,
  result: null,
  listError: null,
  hoveredNodeId: null,
  listHoveredNodeId: null,
  sidebarOpen: false,
  expandedCategoryId: null,
};

let treeNodeAnchors = [];
let treeLocalBounds = null;
const treeNodeElements = new Map();
let panelOpenFrame = 0;
let panelCloseTimer = 0;
let contentSwitchFrame = 0;
let contentSwitchTimer = 0;

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.01, 2000);
camera.position.set(0, 1.8, 6);
const cameraBasePosition = camera.position.clone();
const targetCameraOffset = {
  x: 0,
  y: 0,
};
let cameraFramingScale = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
renderer.setSize(app.clientWidth || window.innerWidth, app.clientHeight || window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0xffffff, 0);
renderer.domElement.style.touchAction = "none";
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableZoom = false;
controls.enablePan = false;
controls.enableRotate = false;
controls.minDistance = 1.8;
controls.maxDistance = 14;
controls.rotateSpeed = 0.42;
controls.zoomSpeed = 0.65;

const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
scene.add(ambientLight);

const particleRoot = new THREE.Group();
particleRoot.scale.setScalar(TREE_SCALE);
scene.add(particleRoot);

const mouse = {
  x: -10000,
  y: -10000,
  previousX: -10000,
  previousY: -10000,
  velocityX: 0,
  velocityY: 0,
  active: false,
};

let points = null;
let geometry = null;
let material = null;
let softTexture = null;
let particleData = null;
let animationFrame = 0;
let disposed = false;
let lastTime = performance.now();
let treeRootLocalY = 0;

const tempVector = new THREE.Vector3();
const projectedVector = new THREE.Vector3();
const worldMatrix = new THREE.Matrix4();
const layoutRaycaster = new THREE.Raycaster();
const layoutPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const layoutIntersection = new THREE.Vector3();
let debugTreeMarker = null;
const dragRotation = {
  active: false,
  startX: 0,
  startY: 0,
  baseOffsetX: 0,
  baseOffsetY: 0,
  offsetX: 0,
  offsetY: 0,
};
const targetTreeRotation = {
  x: 0,
  y: 0,
};
const treeFocusTween = {
  active: false,
  startTime: 0,
  duration: TREE_FOCUS_DURATION,
  startX: 0,
  startY: 0,
  endX: 0,
  endY: 0,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getFeatureFormData(featureId) {
  if (!state.formData[featureId]) state.formData[featureId] = {};
  return state.formData[featureId];
}

function getAuthToken() {
  return (
    window.localStorage.getItem("edugenie_access_token") ||
    window.localStorage.getItem("access_token") ||
    window.localStorage.getItem("prismmind_access_token") ||
    ""
  );
}

function parseStorageJson(key) {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getStoredUserInfo() {
  return (
    parseStorageJson("edugenie_user_info") ||
    parseStorageJson("prismmind_user_info") ||
    parseStorageJson("user_info") ||
    null
  );
}

function getTeacherDisplayName(user) {
  if (!user) return "账号信息待同步";
  return user.full_name || user.name || user.username || (user.email ? String(user.email).split("@")[0] : "账号信息待同步");
}

function getTeacherRoleLabel(user) {
  if (user?.role === "admin") return "管理成员";
  if (user?.role === "teacher") return "教师工作台";
  return "教师工作台";
}

function renderTeacherUser(user) {
  if (userName) userName.textContent = getTeacherDisplayName(user);
  if (userRole) userRole.textContent = getTeacherRoleLabel(user);
}

async function loadTeacherUser() {
  const cachedUser = getStoredUserInfo();
  renderTeacherUser(cachedUser);

  if (!getAuthToken()) return;
  try {
    const payload = await requestJson("/api/v1/auth/me");
    const user = unwrapApiPayload(payload);
    if (user && typeof user === "object") renderTeacherUser(user);
  } catch {
    renderTeacherUser(cachedUser);
  }
}

function unwrapApiPayload(payload) {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data;
  }
  return payload;
}

function normalizeCollection(payload) {
  const data = unwrapApiPayload(payload);
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.artifacts)) return data.artifacts;
  if (Array.isArray(data.courses)) return data.courses;
  return [];
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getItemTitle(item, type) {
  return (
    item?.title ||
    item?.name ||
    item?.course_name ||
    item?.topic ||
    (type === "courses" ? "未命名课程" : "未命名生成记录")
  );
}

function getItemMeta(item, type) {
  if (type === "courses") {
    const parts = [
      item?.code ? `课程码 ${item.code}` : "",
      item?.student_count != null ? `${item.student_count} 名学生` : "",
      item?.updated_at ? `更新于 ${formatDate(item.updated_at)}` : item?.created_at ? `创建于 ${formatDate(item.created_at)}` : "",
    ].filter(Boolean);
    return parts.join(" · ") || "课程信息已同步";
  }

  const parts = [
    item?.artifact_type ? `类型 ${item.artifact_type}` : "",
    item?.status ? `状态 ${item.status}` : "",
    item?.created_at ? `生成于 ${formatDate(item.created_at)}` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "生成记录已同步";
}

function getItemRoute(item, type) {
  const id = item?.id || item?.artifact_id;
  if (type === "courses") return id ? `/teacher/courses/${encodeURIComponent(id)}` : "/teacher/courses";
  return id ? `/teacher/artifacts/${encodeURIComponent(id)}` : "/teacher/artifacts";
}

function getEmptyMessage(type) {
  if (type === "courses") return "暂无课程。你可以进入“我的课程”创建或管理课程。";
  if (type === "exercises") return "暂无练习题生成记录。进入“习题批量生成”后生成内容会出现在这里。";
  if (type === "papers") return "暂无试卷生成记录。进入“试卷智能生成”后生成内容会出现在这里。";
  return "暂无数据。";
}

async function requestJson(endpoint, options = {}) {
  const token = getAuthToken();
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.status === 401) {
    throw new Error("登录状态已失效，请重新登录。");
  }
  if (response.status === 403) {
    throw new Error("当前账号无权访问该数据。");
  }
  if (!response.ok) {
    let message = "请求失败，请稍后重试。";
    try {
      const payload = await response.json();
      message = payload?.message || payload?.detail || message;
    } catch {
      // Keep the user-facing message stable when the backend returns non-JSON errors.
    }
    throw new Error(String(message));
  }
  return response.json();
}

async function requestGenerate(endpoint, payload, feature) {
  const token = getAuthToken();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`${feature.title}请求失败`);
  }
  const data = await response.json();
  return typeof data?.content === "string" ? data.content : JSON.stringify(data, null, 2);
}

async function requestSavedList(endpoint, type) {
  const payload = await requestJson(endpoint);
  return normalizeCollection(payload).slice(0, 6).map((item) => ({
    id: item?.id || item?.artifact_id,
    title: getItemTitle(item, type),
    meta: getItemMeta(item, type),
    route: getItemRoute(item, type),
  }));
}

function renderSidebar() {
  if (!sidebar) return;

  sidebar.innerHTML = FEATURE_CATEGORIES.map(
    (category) => `
      <section class="feature-category">
        <button class="feature-category__button" type="button" data-category-id="${escapeHtml(category.id)}">
          <span>${escapeHtml(category.title)}</span>
          <span class="feature-category__arrow" aria-hidden="true">›</span>
        </button>
        <div class="feature-category__items">
          ${category.items
            .map(
              (item) => `
                <button class="feature-item" type="button" data-feature-id="${escapeHtml(item.id)}">
                  ${escapeHtml(item.title)}
                </button>
              `,
            )
            .join("")}
        </div>
      </section>
    `,
  ).join("");

  sidebar.querySelectorAll(".feature-category__button").forEach((button) => {
    button.addEventListener("click", () => {
      const categoryId = button.dataset.categoryId;
      state.expandedCategoryId = state.expandedCategoryId === categoryId ? null : categoryId;
      updateInteractiveStates();
    });
  });

  sidebar.querySelectorAll(".feature-item").forEach((button) => {
    button.addEventListener("click", () => selectFeature(button.dataset.featureId));
    button.addEventListener("mouseenter", () => {
      state.listHoveredNodeId = button.dataset.featureId;
      updateInteractiveStates();
    });
    button.addEventListener("mouseleave", () => {
      state.listHoveredNodeId = null;
      updateInteractiveStates();
    });
  });

  updateInteractiveStates();
}

function renderTreeNodes() {
  if (!nodesLayer) return;

  nodesLayer.innerHTML = FEATURES.map(
    (feature) => `
      <button class="tree-node" type="button" data-feature-id="${escapeHtml(feature.id)}" aria-label="${escapeHtml(
        feature.title,
      )}">
      </button>
    `,
  ).join("");

  treeNodeElements.clear();
  nodesLayer.querySelectorAll(".tree-node").forEach((button) => {
    treeNodeElements.set(button.dataset.featureId, button);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selectFeature(button.dataset.featureId);
    });
    button.addEventListener("mouseenter", () => {
      state.hoveredNodeId = button.dataset.featureId;
      updateInteractiveStates();
    });
    button.addEventListener("mouseleave", () => {
      state.hoveredNodeId = null;
      updateInteractiveStates();
    });
  });

  updateInteractiveStates();
}

function updateInteractiveStates() {
  treeNodeElements.forEach((button, id) => {
    button.classList.toggle("is-active", state.activeNodeId === id);
    button.classList.toggle("is-hovered", state.hoveredNodeId === id);
    button.classList.toggle("is-list-hovered", state.listHoveredNodeId === id);
  });

  sidebar?.querySelectorAll(".feature-item").forEach((button) => {
    const id = button.dataset.featureId;
    button.classList.toggle("is-active", state.activeNodeId === id);
    button.classList.toggle("is-hovered", state.hoveredNodeId === id || state.listHoveredNodeId === id);
  });

  sidebar?.querySelectorAll(".feature-category").forEach((section) => {
    const button = section.querySelector(".feature-category__button");
    const categoryId = button?.dataset.categoryId;
    const isOpen = state.expandedCategoryId === categoryId;
    const isActive = state.activeCategory === categoryId;
    section.classList.toggle("is-open", isOpen);
    section.classList.toggle("is-active", isActive);
    button?.setAttribute("aria-expanded", String(isOpen));
  });

  sidebar?.classList.toggle("is-open", state.sidebarOpen);
}

function renderPanel() {
  if (!panel) return;

  if (!state.panelVisible) {
    panel.hidden = true;
    panel.innerHTML = "";
    panel.classList.remove("is-open");
    return;
  }

  const featureId = state.panelNodeId || state.activeNodeId;
  const feature = FEATURE_BY_ID.get(featureId);
  if (!feature) return;

  panel.hidden = false;
  panel.classList.toggle("is-open", state.panelOpen);

  const transition = state.contentTransition;
  const contentMarkup = transition
    ? `
      ${renderPanelContent(transition.outgoingId, "is-active", "outgoing")}
      ${renderPanelContent(
        transition.incomingId,
        transition.direction === "up" ? "is-entering-from-bottom" : "is-entering-from-top",
        "incoming",
      )}
    `
    : renderPanelContent(feature.id, "is-active", "active");

  panel.innerHTML = `
    <div class="panel-content">
      <button class="panel-close" id="panel-close" type="button" aria-label="关闭面板">×</button>
      <div class="info-content-viewport${state.isSwitchingContent ? " is-switching" : ""}">
        ${contentMarkup}
      </div>
      <div class="panel-enter${state.isSwitchingContent ? " is-switching" : ""}">
        <a class="enter-btn" href="#" aria-label="进入功能">
          <span class="enter-btn__inner">
            <span class="enter-btn__label" data-label="开始" data-hover="Go ！">
              Enter
              <span class="enter-btn__label__background"></span>
            </span>
          </span>
          <span class="enter-btn__background"></span>
        </a>
      </div>
    </div>
  `;

  panel.querySelector("#panel-close")?.addEventListener("click", closePanel);
  panel.querySelector(".enter-btn")?.addEventListener("click", (event) => {
    event.preventDefault();
    handleEnterFeature(state.activeNodeId);
  });
  panel.querySelectorAll("[data-dashboard-route]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = button.getAttribute("data-dashboard-route");
      if (route) window.location.href = route;
    });
  });
}

function renderPanelContent(featureId, className, role) {
  const feature = FEATURE_BY_ID.get(featureId);
  if (!feature) return "";

  const info = FEATURE_INFO[feature.id];
  return `
    <div class="info-content ${className}" data-content-role="${role}" data-feature-id="${escapeHtml(feature.id)}">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">${escapeHtml(feature.categoryTitle)}</p>
          <h2 class="panel-title">${escapeHtml(feature.title)}</h2>
          <p class="panel-intro">${escapeHtml(info?.intro || feature.description)}</p>
        </div>
      </div>
      <div class="panel-body">${renderInfoBody(feature, info)}</div>
    </div>
  `;
}

function renderInfoBody(feature, info) {
  if (usesSavedListPanel(feature)) return renderSavedList(feature);

  const content = info || {
    body: feature.description,
    highlights: [],
    output: "",
  };
  return `
    <p class="panel-description">${escapeHtml(content.body)}</p>
    <section class="info-section">
      <h3>功能亮点</h3>
      <ul>
        ${(content.highlights || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
    <section class="info-section">
      <h3>输出内容</h3>
      <p>${escapeHtml(content.output)}</p>
    </section>
  `;
}

function usesSavedListPanel(feature) {
  return Boolean(feature?.listType && feature.panelMode !== "info");
}

function renderSavedList(feature) {
  const items = Array.isArray(state.result) ? state.result : [];
  const listType = feature.listType;
  const sourceText =
    listType === "courses"
      ? "已同步最近课程资源"
      : "已同步最近生成记录";

  if (state.loading) {
    return `
      <p class="panel-description">${escapeHtml(feature.description)}</p>
      <section class="info-section">
        <h3>正在加载</h3>
        <p>正在读取${escapeHtml(feature.title)}，请稍候。</p>
      </section>
    `;
  }

  if (state.listError) {
    return `
      <p class="panel-description">${escapeHtml(feature.description)}</p>
      <section class="info-section">
        <h3>加载失败</h3>
        <p>${escapeHtml(state.listError)}</p>
      </section>
    `;
  }

  if (!items.length) {
    return `
      <p class="panel-description">${escapeHtml(feature.description)}</p>
      <section class="info-section">
        <h3>暂无记录</h3>
        <p>${escapeHtml(getEmptyMessage(listType))}</p>
        <p>${escapeHtml(sourceText)}</p>
      </section>
    `;
  }

  return `
    <p class="panel-description">${escapeHtml(feature.description)}</p>
    <section class="info-section">
      <h3>最近记录</h3>
      <div class="saved-list">
        ${items
          .map(
            (item) => `
              <article class="saved-card">
                <h4 class="saved-card__title">${escapeHtml(item.title)}</h4>
                <p class="saved-card__meta">${escapeHtml(item.meta)}</p>
                <div class="saved-card__actions">
                  <button class="panel-button" type="button" data-dashboard-route="${escapeHtml(item.route)}">查看</button>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
      <p class="saved-card__meta">${escapeHtml(sourceText)}</p>
    </section>
  `;
}

function getFeatureIndex(id) {
  return FEATURES.findIndex((feature) => feature.id === id);
}

function clearPanelAnimationTimers() {
  cancelAnimationFrame(panelOpenFrame);
  clearTimeout(panelCloseTimer);
}

function clearContentSwitchTimers() {
  cancelAnimationFrame(contentSwitchFrame);
  clearTimeout(contentSwitchTimer);
}

function openPanelForFeature(id) {
  clearPanelAnimationTimers();
  clearContentSwitchTimers();

  state.panelNodeId = id;
  state.panelVisible = true;
  state.panelOpen = false;
  state.isSwitchingContent = false;
  state.contentTransition = null;
  renderPanel();

  panelOpenFrame = requestAnimationFrame(() => {
    state.panelOpen = true;
    panel?.classList.add("is-open");
  });
}

function hidePanelAfterSlide() {
  clearPanelAnimationTimers();
  clearContentSwitchTimers();

  state.panelOpen = false;
  state.isSwitchingContent = false;
  state.contentTransition = null;
  renderPanel();

  panelCloseTimer = window.setTimeout(() => {
    if (state.panelOpen) return;
    state.panelVisible = false;
    state.panelNodeId = null;
    state.previousNodeId = null;
    renderPanel();
  }, PANEL_SLIDE_DURATION);
}

function switchPanelContent(fromId, toId) {
  clearContentSwitchTimers();

  const fromIndex = getFeatureIndex(fromId);
  const toIndex = getFeatureIndex(toId);
  const direction = toIndex >= fromIndex ? "up" : "down";

  state.previousNodeId = fromId;
  state.contentTransitionDirection = direction;
  state.isSwitchingContent = true;
  state.contentTransition = {
    outgoingId: fromId,
    incomingId: toId,
    direction,
  };
  renderPanel();

  contentSwitchFrame = requestAnimationFrame(() => {
    const outgoing = panel?.querySelector('[data-content-role="outgoing"]');
    const incoming = panel?.querySelector('[data-content-role="incoming"]');

    outgoing?.classList.remove("is-active");
    outgoing?.classList.add(direction === "up" ? "is-leaving-to-top" : "is-leaving-to-bottom");
    incoming?.classList.remove(direction === "up" ? "is-entering-from-bottom" : "is-entering-from-top");
    incoming?.classList.add("is-active");
  });

  contentSwitchTimer = window.setTimeout(() => {
    state.panelNodeId = toId;
    state.isSwitchingContent = false;
    state.contentTransition = null;
    renderPanel();
  }, CONTENT_SWITCH_DURATION);
}

async function selectFeature(id) {
  const feature = FEATURE_BY_ID.get(id);
  if (!feature) return;

  const previousNodeId = state.isSwitchingContent
    ? state.contentTransition?.incomingId || state.activeNodeId
    : state.panelNodeId || state.activeNodeId;
  const shouldSwitchContent = state.panelVisible && state.panelOpen && previousNodeId && previousNodeId !== id;

  state.activeNodeId = id;
  state.activeCategory = feature.categoryId;
  state.result = usesSavedListPanel(feature) ? [] : null;
  state.loading = false;
  state.sidebarOpen = false;
  state.expandedCategoryId = feature.categoryId;
  state.listError = null;
  setTreeViewRotation(id);
  updateInteractiveStates();
  if (state.panelVisible && state.panelOpen && previousNodeId === id && !state.isSwitchingContent) {
    state.panelNodeId = id;
    renderPanel();
    if (usesSavedListPanel(feature)) loadSavedList(feature);
    return;
  }

  if (shouldSwitchContent) {
    switchPanelContent(previousNodeId, id);
    if (usesSavedListPanel(feature)) window.setTimeout(() => loadSavedList(feature), CONTENT_SWITCH_DURATION);
    return;
  }

  openPanelForFeature(id);
  if (usesSavedListPanel(feature)) window.setTimeout(() => loadSavedList(feature), 0);
}

function handleEnterFeature(activeNodeId) {
  const route = FEATURE_ROUTES[activeNodeId];
  if (route) window.location.href = route;
}

async function handleGenerate(feature) {
  state.loading = true;
  state.result = null;
  renderPanel();

  try {
    const activeRequestId = feature.id;
    const result = await requestGenerate(feature.endpoint, getFeatureFormData(feature.id), feature);
    if (state.activeNodeId !== activeRequestId) return;
    state.result = result;
  } finally {
    if (state.activeNodeId === feature.id) {
      state.loading = false;
      renderPanel();
    }
  }
}

async function loadSavedList(feature) {
  if (!feature?.listType) return;
  const activeRequestId = feature.id;
  state.loading = true;
  state.listError = null;
  state.result = [];
  renderPanel();

  try {
    const items = await requestSavedList(feature.endpoint, feature.listType);
    if (state.activeNodeId !== activeRequestId) return;
    state.result = items;
  } catch (error) {
    if (state.activeNodeId !== activeRequestId) return;
    state.listError = error instanceof Error ? error.message : "数据加载失败，请稍后重试。";
    state.result = [];
  } finally {
    if (state.activeNodeId === activeRequestId) {
      state.loading = false;
      renderPanel();
    }
  }
}

function closePanel() {
  state.panelNodeId = state.panelNodeId || state.activeNodeId;
  hidePanelAfterSlide();
}

function goHome() {
  state.panelNodeId = state.panelNodeId || state.activeNodeId;
  state.activeNodeId = null;
  state.activeCategory = null;
  state.result = null;
  state.loading = false;
  state.expandedCategoryId = null;
  setTreeViewRotation(null);
  updateInteractiveStates();
  hidePanelAfterSlide();
}

function removeSessionKeys(storage) {
  const exactKeys = new Set(["access_token", "refresh_token"]);
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (exactKeys.has(key) || key.startsWith("prismmind_") || key.startsWith("edugenie_")) {
      storage.removeItem(key);
    }
  }
}

function clearSessionAndGoLogin() {
  removeSessionKeys(window.localStorage);
  removeSessionKeys(window.sessionStorage);
  window.sessionStorage.clear();
  window.location.href = "/auth/login";
}

function setTreeViewRotation(id) {
  const focus = id ? calculateAnchorFocus(id) : { rotX: 0, rotY: 0, camOffsetX: 0, camOffsetY: 0 };
  startTreeFocusTween(focus);
}

function calculateAnchorFocus(id) {
  const anchor = treeNodeAnchors.find((item) => item.id === id);
  if (!anchor) return { rotX: 0, rotY: 0, camOffsetX: 0, camOffsetY: 0 };

  const position = anchor.position;
  const bounds = treeLocalBounds;
  const size = bounds?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
  const minY = bounds?.min.y ?? -0.5;
  const yRatio = THREE.MathUtils.clamp((position.y - minY) / Math.max(size.y, 0.001), 0, 1);

  return {
    rotX: THREE.MathUtils.clamp((0.48 - yRatio) * 0.18, -0.08, 0.08),
    rotY: Math.atan2(-position.x, position.z),
    camOffsetX: 0,
    camOffsetY: THREE.MathUtils.clamp((yRatio - 0.48) * 0.08, -0.035, 0.045),
  };
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function startTreeFocusTween(focus) {
  const startX = particleRoot.rotation.x;
  const startY = particleRoot.rotation.y;
  const endY = startY + normalizeAngle(focus.rotY - startY);

  dragRotation.active = false;
  dragRotation.offsetX = 0;
  dragRotation.offsetY = 0;
  dragRotation.baseOffsetX = 0;
  dragRotation.baseOffsetY = 0;

  treeFocusTween.active = true;
  treeFocusTween.startTime = performance.now();
  treeFocusTween.duration = TREE_FOCUS_DURATION;
  treeFocusTween.startX = startX;
  treeFocusTween.startY = startY;
  treeFocusTween.endX = focus.rotX;
  treeFocusTween.endY = endY;

  targetTreeRotation.x = startX;
  targetTreeRotation.y = startY;
  targetCameraOffset.x = focus.camOffsetX;
  targetCameraOffset.y = focus.camOffsetY;
}

function updateTreeFocusTween(now) {
  if (!treeFocusTween.active) return;

  const progress = THREE.MathUtils.clamp((now - treeFocusTween.startTime) / treeFocusTween.duration, 0, 1);
  const eased = easeInOutCubic(progress);

  targetTreeRotation.x = THREE.MathUtils.lerp(treeFocusTween.startX, treeFocusTween.endX, eased);
  targetTreeRotation.y = THREE.MathUtils.lerp(treeFocusTween.startY, treeFocusTween.endY, eased);

  if (progress >= 1) {
    treeFocusTween.active = false;
    targetTreeRotation.x = treeFocusTween.endX;
    targetTreeRotation.y = treeFocusTween.endY;
  }
}

function createTreeNodeAnchors(bounds) {
  treeLocalBounds = bounds.clone();
  const min = bounds.min;
  const size = bounds.getSize(new THREE.Vector3());
  const at = (xRatio, yRatio, zRatio = 0.52) =>
    new THREE.Vector3(min.x + size.x * xRatio, min.y + size.y * yRatio, min.z + size.z * zRatio);
  const positionAttribute = geometry?.attributes?.position;
  const snapToTree = (point) => {
    if (!positionAttribute) return point;

    let nearestDistance = Infinity;
    const nearest = point.clone();
    const candidate = new THREE.Vector3();

    for (let i = 0; i < positionAttribute.count; i += 1) {
      candidate.fromBufferAttribute(positionAttribute, i);
      const distance = candidate.distanceToSquared(point);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest.copy(candidate);
      }
    }

    return nearest;
  };

  treeNodeAnchors = [
    { id: "training-plan", position: snapToTree(at(0.52, 0.8, 0.26)) },
    { id: "course-design", position: snapToTree(at(0.46, 0.72, 0.74)) },
    { id: "exercise-generate", position: snapToTree(at(0.31, 0.4, 0.3)) },
    { id: "my-courses", position: snapToTree(at(0.52, 0.48, 0.44)) },
    { id: "paper-generate", position: snapToTree(at(0.82, 0.59, 0.72)) },
    { id: "my-exercises", position: snapToTree(at(0.4, 0.2, 0.68)) },
    { id: "my-papers", position: snapToTree(at(0.7, 0.24, 0.3)) },
  ];
}

function updateTreeNodePositions() {
  if (!treeNodeAnchors.length || !treeNodeElements.size) return;

  particleRoot.updateMatrixWorld(true);
  const width = window.innerWidth;
  const height = window.innerHeight;

  for (const anchor of treeNodeAnchors) {
    const element = treeNodeElements.get(anchor.id);
    if (!element) continue;

    projectedVector.copy(anchor.position).applyMatrix4(particleRoot.matrixWorld).project(camera);
    const visible = projectedVector.z > -1 && projectedVector.z < 1;

    element.style.opacity = visible ? "1" : "0";
    element.style.left = `${(projectedVector.x * 0.5 + 0.5) * width}px`;
    element.style.top = `${(-projectedVector.y * 0.5 + 0.5) * height}px`;
  }
}

function updateDebugTreeMarker() {
  if (!DEBUG_LAYOUT) return;

  if (!debugTreeMarker) {
    debugTreeMarker = document.createElement("div");
    debugTreeMarker.className = "layout-debug-marker";
    document.body.appendChild(debugTreeMarker);
  }

  debugTreeMarker.style.left = `${window.innerWidth * LAYOUT.visualX}px`;
  debugTreeMarker.style.top = `${window.innerHeight * LAYOUT.treeRootY}px`;
}

function positionTreeOnLeftThird() {
  particleRoot.scale.setScalar(TREE_SCALE);
  camera.updateMatrixWorld();
  layoutRaycaster.setFromCamera(
    new THREE.Vector2(LAYOUT.visualX * 2 - 1, -(LAYOUT.treeRootY * 2 - 1)),
    camera,
  );

  if (layoutRaycaster.ray.intersectPlane(layoutPlane, layoutIntersection)) {
    particleRoot.position.x = layoutIntersection.x;
    particleRoot.position.y = layoutIntersection.y - treeRootLocalY * TREE_SCALE;
  }

  updateDebugTreeMarker();
}

function beginTreeDrag(event) {
  if (!event.isPrimary) return;

  if (treeFocusTween.active) {
    treeFocusTween.active = false;
    targetTreeRotation.x = particleRoot.rotation.x;
    targetTreeRotation.y = particleRoot.rotation.y;
  }

  dragRotation.active = true;
  dragRotation.startX = event.clientX;
  dragRotation.startY = event.clientY;
  dragRotation.baseOffsetX = dragRotation.offsetX;
  dragRotation.baseOffsetY = dragRotation.offsetY;
  renderer.domElement.setPointerCapture?.(event.pointerId);
}

function moveTreeDrag(event) {
  if (!dragRotation.active || !event.isPrimary) return;

  const deltaX = event.clientX - dragRotation.startX;
  const deltaY = event.clientY - dragRotation.startY;
  dragRotation.offsetY = THREE.MathUtils.clamp(
    dragRotation.baseOffsetY + deltaX * 0.003,
    -MAX_DRAG_ROTATION_Y,
    MAX_DRAG_ROTATION_Y,
  );
  dragRotation.offsetX = THREE.MathUtils.clamp(
    dragRotation.baseOffsetX + deltaY * 0.0015,
    -MAX_DRAG_ROTATION_X,
    MAX_DRAG_ROTATION_X,
  );
}

function endTreeDrag(event) {
  if (!dragRotation.active || !event.isPrimary) return;

  dragRotation.active = false;
  if (renderer.domElement.hasPointerCapture?.(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId);
  }
  if (state.activeNodeId) setTreeViewRotation(state.activeNodeId);
}

function updateTreeDragRotation(now) {
  updateTreeFocusTween(now);

  if (!dragRotation.active) {
    dragRotation.offsetX += (0 - dragRotation.offsetX) * 0.08;
    dragRotation.offsetY += (0 - dragRotation.offsetY) * 0.08;
  }

  const nextX = targetTreeRotation.x + dragRotation.offsetX;
  const nextY = targetTreeRotation.y + dragRotation.offsetY;
  const focusSpeed = treeFocusTween.active ? 0.34 : 0.08;
  particleRoot.rotation.x += (nextX - particleRoot.rotation.x) * focusSpeed;
  particleRoot.rotation.y += (nextY - particleRoot.rotation.y) * focusSpeed;
}

function updateCameraFraming() {
  const nextX = cameraBasePosition.x + targetCameraOffset.x * cameraFramingScale;
  const nextY = cameraBasePosition.y + targetCameraOffset.y * cameraFramingScale;
  camera.position.x += (nextX - camera.position.x) * 0.05;
  camera.position.y += (nextY - camera.position.y) * 0.05;
}

function createSoftCircleTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 245, 1)");
  gradient.addColorStop(0.36, "rgba(196, 255, 218, 0.76)");
  gradient.addColorStop(0.68, "rgba(128, 218, 196, 0.28)");
  gradient.addColorStop(1, "rgba(128, 218, 196, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function calculateWorldSurfaceArea(mesh) {
  const position = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  if (!position) return 0;

  let area = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  const readVertex = (vertexIndex, target) => {
    target.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld);
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      readVertex(index.getX(i), a);
      readVertex(index.getX(i + 1), b);
      readVertex(index.getX(i + 2), c);
      area += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * 0.5;
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      readVertex(i, a);
      readVertex(i + 1, b);
      readVertex(i + 2, c);
      area += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * 0.5;
    }
  }

  return area;
}

function collectMeshes(root) {
  const meshes = [];

  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    child.updateWorldMatrix(true, false);
    meshes.push({
      mesh: child,
      vertexCount: child.geometry.attributes.position.count,
      area: calculateWorldSurfaceArea(child),
    });
  });

  return meshes;
}

function buildParticleCloud(gltf) {
  const meshes = collectMeshes(gltf.scene);
  if (!meshes.length) {
    throw new Error("tree.glb does not contain readable mesh position attributes.");
  }

  const totalArea = meshes.reduce((sum, item) => sum + item.area, 0);
  const totalVertices = meshes.reduce((sum, item) => sum + item.vertexCount, 0);
  const positions = new Float32Array(SAMPLE_COUNT * 3);
  const originalPositions = new Float32Array(SAMPLE_COUNT * 3);
  const velocities = new Float32Array(SAMPLE_COUNT * 3);
  const randomDirections = new Float32Array(SAMPLE_COUNT * 3);
  const phases = new Float32Array(SAMPLE_COUNT);
  const colors = new Float32Array(SAMPLE_COUNT * 3);

  const palette = [
    new THREE.Color("#b9f5c9"),
    new THREE.Color("#8fded0"),
    new THREE.Color("#f9f5d6"),
    new THREE.Color("#d7ffe1"),
  ];

  const samplePosition = new THREE.Vector3();
  let cursor = 0;

  meshes.forEach((item, meshIndex) => {
    const weight = totalArea > 0 ? item.area / totalArea : item.vertexCount / totalVertices;
    const remainingMeshes = meshes.length - meshIndex - 1;
    const reserved = Math.max(0, remainingMeshes);
    const targetCount = Math.min(
      SAMPLE_COUNT - cursor - reserved,
      Math.max(1, Math.round(SAMPLE_COUNT * weight)),
    );

    const sampler = new MeshSurfaceSampler(item.mesh).build();
    for (let i = 0; i < targetCount && cursor < SAMPLE_COUNT; i += 1) {
      sampler.sample(samplePosition);
      samplePosition.applyMatrix4(item.mesh.matrixWorld);

      const baseIndex = cursor * 3;
      positions[baseIndex] = samplePosition.x;
      positions[baseIndex + 1] = samplePosition.y;
      positions[baseIndex + 2] = samplePosition.z;
      originalPositions[baseIndex] = samplePosition.x;
      originalPositions[baseIndex + 1] = samplePosition.y;
      originalPositions[baseIndex + 2] = samplePosition.z;

      const theta = Math.random() * Math.PI * 2;
      const z = Math.random() * 2 - 1;
      const radius = Math.sqrt(1 - z * z);
      randomDirections[baseIndex] = Math.cos(theta) * radius;
      randomDirections[baseIndex + 1] = Math.sin(theta) * radius;
      randomDirections[baseIndex + 2] = z;
      phases[cursor] = Math.random() * Math.PI * 2;

      const color = palette[Math.floor(Math.random() * palette.length)].clone();
      color.lerp(new THREE.Color("#ffffff"), Math.random() * 0.22);
      colors[baseIndex] = color.r;
      colors[baseIndex + 1] = color.g;
      colors[baseIndex + 2] = color.b;

      cursor += 1;
    }
  });

  while (cursor < SAMPLE_COUNT) {
    const item = meshes[cursor % meshes.length];
    const sampler = new MeshSurfaceSampler(item.mesh).build();
    sampler.sample(samplePosition);
    samplePosition.applyMatrix4(item.mesh.matrixWorld);

    const baseIndex = cursor * 3;
    positions[baseIndex] = samplePosition.x;
    positions[baseIndex + 1] = samplePosition.y;
    positions[baseIndex + 2] = samplePosition.z;
    originalPositions[baseIndex] = samplePosition.x;
    originalPositions[baseIndex + 1] = samplePosition.y;
    originalPositions[baseIndex + 2] = samplePosition.z;
    randomDirections[baseIndex] = Math.random() * 2 - 1;
    randomDirections[baseIndex + 1] = Math.random() * 2 - 1;
    randomDirections[baseIndex + 2] = Math.random() * 2 - 1;
    phases[cursor] = Math.random() * Math.PI * 2;
    colors[baseIndex] = 0.74;
    colors[baseIndex + 1] = 1;
    colors[baseIndex + 2] = 0.82;
    cursor += 1;
  }

  geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const bounds = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  treeRootLocalY = bounds.min.y - center.y;

  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const baseIndex = i * 3;
    positions[baseIndex] -= center.x;
    positions[baseIndex + 1] -= center.y;
    positions[baseIndex + 2] -= center.z;
    originalPositions[baseIndex] -= center.x;
    originalPositions[baseIndex + 1] -= center.y;
    originalPositions[baseIndex + 2] -= center.z;
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.computeBoundingSphere();
  createTreeNodeAnchors(new THREE.Box3().setFromBufferAttribute(geometry.attributes.position));
  if (state.activeNodeId) setTreeViewRotation(state.activeNodeId);

  softTexture = createSoftCircleTexture();
  material = new THREE.PointsMaterial({
    size: THREE.MathUtils.clamp(maxDimension * 0.0065, 0.025, 0.075),
    map: softTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.86,
    sizeAttenuation: true,
    vertexColors: true,
  });

  points = new THREE.Points(geometry, material);
  particleRoot.add(points);

  const distance = maxDimension / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
  camera.position.set(0, maxDimension * 0.18, distance * 1.85);
  cameraBasePosition.copy(camera.position);
  cameraFramingScale = maxDimension * 0.36;
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 12;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
  positionTreeOnLeftThird();

  particleData = {
    positions,
    originalPositions,
    velocities,
    randomDirections,
    phases,
    count: SAMPLE_COUNT,
    floatAmplitude: maxDimension * 0.0032,
    springStrength: 0.018,
    damping: 0.91,
    disturbanceStrength: maxDimension * 0.00034,
    cameraKick: maxDimension * 0.0024,
  };
}

function updateMouseVelocity(event) {
  mouse.previousX = mouse.x;
  mouse.previousY = mouse.y;
  mouse.x = event.clientX;
  mouse.y = event.clientY;
  mouse.velocityX = THREE.MathUtils.clamp(mouse.x - mouse.previousX, -90, 90);
  mouse.velocityY = THREE.MathUtils.clamp(mouse.y - mouse.previousY, -90, 90);
  mouse.active = true;
}

function releaseMouse() {
  mouse.active = false;
  mouse.x = -10000;
  mouse.y = -10000;
  mouse.velocityX = 0;
  mouse.velocityY = 0;
}

function updateParticles(elapsed, delta) {
  if (!particleData || !points) return;

  const {
    positions,
    originalPositions,
    velocities,
    randomDirections,
    phases,
    count,
    floatAmplitude,
    springStrength,
    damping,
    disturbanceStrength,
    cameraKick,
  } = particleData;

  const influenceRadius = Math.min(window.innerWidth, window.innerHeight) * 0.18;
  const mouseSpeed = Math.hypot(mouse.velocityX, mouse.velocityY);
  const hasMouseForce = mouse.active && mouseSpeed > 0.15;
  const deltaScale = Math.min(delta * 60, 1.8);

  points.updateWorldMatrix(true, false);
  worldMatrix.copy(points.matrixWorld);

  for (let i = 0; i < count; i += 1) {
    const baseIndex = i * 3;
    const phase = phases[i];
    const floatWave = Math.sin(elapsed * 0.95 + phase) + Math.cos(elapsed * 0.62 + phase * 1.7) * 0.46;
    const targetX = originalPositions[baseIndex] + randomDirections[baseIndex] * floatAmplitude * floatWave;
    const targetY = originalPositions[baseIndex + 1] + randomDirections[baseIndex + 1] * floatAmplitude * floatWave;
    const targetZ = originalPositions[baseIndex + 2] + randomDirections[baseIndex + 2] * floatAmplitude * floatWave;

    if (hasMouseForce && i % 2 === 0) {
      tempVector.set(positions[baseIndex], positions[baseIndex + 1], positions[baseIndex + 2]);
      projectedVector.copy(tempVector).applyMatrix4(worldMatrix).project(camera);

      const screenX = (projectedVector.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-projectedVector.y * 0.5 + 0.5) * window.innerHeight;
      const distance = Math.hypot(screenX - mouse.x, screenY - mouse.y);

      if (distance < influenceRadius && projectedVector.z > -1 && projectedVector.z < 1) {
        const normalized = 1 - distance / influenceRadius;
        const strength = normalized * normalized;
        velocities[baseIndex] += mouse.velocityX * disturbanceStrength * strength;
        velocities[baseIndex + 1] -= mouse.velocityY * disturbanceStrength * strength;
        velocities[baseIndex + 2] += (randomDirections[baseIndex + 2] + 0.45) * cameraKick * strength * mouseSpeed;
      }
    }

    velocities[baseIndex] += (targetX - positions[baseIndex]) * springStrength * deltaScale;
    velocities[baseIndex + 1] += (targetY - positions[baseIndex + 1]) * springStrength * deltaScale;
    velocities[baseIndex + 2] += (targetZ - positions[baseIndex + 2]) * springStrength * deltaScale;

    velocities[baseIndex] *= damping;
    velocities[baseIndex + 1] *= damping;
    velocities[baseIndex + 2] *= damping;

    positions[baseIndex] += velocities[baseIndex] * deltaScale;
    positions[baseIndex + 1] += velocities[baseIndex + 1] * deltaScale;
    positions[baseIndex + 2] += velocities[baseIndex + 2] * deltaScale;
  }

  geometry.attributes.position.needsUpdate = true;
  mouse.velocityX *= 0.82;
  mouse.velocityY *= 0.82;
}

function animate(now = performance.now()) {
  if (disposed) return;

  const delta = Math.min((now - lastTime) / 1000, 0.05);
  const elapsed = now / 1000;
  lastTime = now;

  updateTreeDragRotation(now);
  updateCameraFraming();
  updateParticles(elapsed, delta);
  controls.update();
  updateTreeNodePositions();
  renderer.render(scene, camera);
  animationFrame = requestAnimationFrame(animate);
}

function resize() {
  const width = app.clientWidth || window.innerWidth;
  const height = app.clientHeight || window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  controls.update();
  positionTreeOnLeftThird();
  updateTreeNodePositions();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.setSize(width, height, false);
}

function watchDprChange() {
  if (disposed) return;

  const currentDpr = window.devicePixelRatio || 1;
  if (currentDpr !== lastDpr) {
    lastDpr = currentDpr;
    resize();
  }

  dprWatchFrame = requestAnimationFrame(watchDprChange);
}

function disposeScene() {
  disposed = true;
  cancelAnimationFrame(animationFrame);
  cancelAnimationFrame(dprWatchFrame);
  window.removeEventListener("resize", resize);
  window.removeEventListener("mousemove", updateMouseVelocity);
  window.removeEventListener("mouseleave", releaseMouse);
  renderer.domElement.removeEventListener("pointerdown", beginTreeDrag);
  window.removeEventListener("pointermove", moveTreeDrag);
  window.removeEventListener("pointerup", endTreeDrag);
  window.removeEventListener("pointercancel", endTreeDrag);
  destroyBlackHoleBackground();
  debugTreeMarker?.remove();
  controls.dispose();

  if (points) particleRoot.remove(points);
  geometry?.dispose();
  material?.dispose();
  softTexture?.dispose();
  renderer.dispose();
  renderer.domElement.remove();
}

window.addEventListener("resize", resize);
window.addEventListener("mousemove", updateMouseVelocity);
window.addEventListener("mouseleave", releaseMouse);
renderer.domElement.addEventListener("pointerdown", beginTreeDrag);
window.addEventListener("pointermove", moveTreeDrag);
window.addEventListener("pointerup", endTreeDrag);
window.addEventListener("pointercancel", endTreeDrag);
window.addEventListener("pagehide", disposeScene, { once: true });
homeButton?.addEventListener("click", goHome);
userButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (userPopover) userPopover.hidden = !userPopover.hidden;
});
accountCenterButton?.addEventListener("click", () => {
  window.location.assign("/account");
});
logoutButton?.addEventListener("click", () => {
  clearSessionAndGoLogin();
});
sidebarToggle?.addEventListener("click", () => {
  state.sidebarOpen = !state.sidebarOpen;
  updateInteractiveStates();
});
window.addEventListener("click", (event) => {
  if (!userPopover || userPopover.hidden) return;
  if (userPopover.contains(event.target) || userButton?.contains(event.target)) return;
  userPopover.hidden = true;
});

renderSidebar();
renderTreeNodes();
loadTeacherUser();
watchDprChange();

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    buildParticleCloud(gltf);
    loading?.classList.add("is-hidden");
  },
  undefined,
  (error) => {
    if (loading) loading.textContent = "三维教学树资源加载中断，请刷新页面重试";
  },
);

animate();


