import {
  fetchMyCurriculumDesigns,
  fetchKnowledgeDocuments,
  fetchMyCourses,
  generateCurriculumDesign,
  generateCurriculumDesignAsync,
  watchCurriculumDesignTask,
  fetchCurriculumDesignArtifact,
  saveCurriculumDesign,
  validateCurriculumDesignForm
} from "./curriculumDesignApi.js";
import { mountCurriculumPrismBackground } from "./prismBackground.js";
import { renderMarkdown as renderSafeMarkdown } from "@/utils/markdown";

const form = document.querySelector("#curriculumForm");
const actionPanel = document.querySelector(".curriculum-action-panel");
const submitButton = document.querySelector("#submitButton");
const statusConsole = document.querySelector("#statusConsole");
const panelStatusDot = document.querySelector("#panelStatusDot");
const fileInput = document.querySelector("#referenceFile");
const fileSelectButton = document.querySelector("#fileSelectButton");
const fileClearButton = document.querySelector("#fileClearButton");
const fileStatus = document.querySelector("#fileStatus");
const fileControl = document.querySelector("#fileControl");
const preview = document.querySelector("#designPreview");
const taskStream = document.querySelector("#curriculumTaskStream");
const previewSource = document.querySelector("#previewSource");
const manageDesignsButton = document.querySelector("#manageDesignsButton");
const prismBackgroundMount = document.querySelector("#curriculumPrismBackground");
const stepInput = document.querySelector("#stepInput");
const stepGenerate = document.querySelector("#stepGenerate");
const knowledgeDocuments = document.querySelector("#knowledgeDocuments");
const knowledgeDocumentsHint = document.querySelector("#knowledgeDocumentsHint");
const knowledgeUploadButton = document.querySelector("#knowledgeUploadButton");
const knowledgeRefreshButton = document.querySelector("#knowledgeRefreshButton");
const courseSelect = document.querySelector("#courseId");
const courseHint = document.querySelector("#courseIdHint");

let referenceFile = null;
let isSubmitting = false;
let lastGeneratedDesign = null;
let disposePrismBackground = () => {};
let streamedContent = "";
let displayedProgress = 0;
let streamedReferences = [];
let streamedWarnings = [];

try {
  disposePrismBackground = mountCurriculumPrismBackground(prismBackgroundMount);
} catch {
  disposePrismBackground = () => {};
}

bindForm();
setPreviewEmpty();
syncInputReadiness();
loadKnowledgeDocuments();
loadCourses();

const handleKnowledgeUpdated = (event) => loadKnowledgeDocuments(Number(event.detail?.documentId || 0));
window.addEventListener("teacher-knowledge-updated", handleKnowledgeUpdated);

window.addEventListener("__prismmind_curriculum_design_dispose", () => {
  disposePrismBackground();
  window.removeEventListener("teacher-knowledge-updated", handleKnowledgeUpdated);
}, { once: true });

function bindForm() {
  fileSelectButton?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", handleFileChange);
  fileClearButton?.addEventListener("click", clearReferenceFile);
  fileControl?.addEventListener("click", handleFileZoneClick);
  fileControl?.addEventListener("keydown", handleFileZoneKeydown);
  fileControl?.addEventListener("dragover", handleFileDragOver);
  fileControl?.addEventListener("dragleave", handleFileDragLeave);
  fileControl?.addEventListener("drop", handleFileDrop);
  form?.addEventListener("submit", submitCurriculumDesign);
  manageDesignsButton?.addEventListener("click", handleManageDesigns);
  knowledgeUploadButton?.addEventListener("click", () => window.dispatchEvent(new Event("teacher-knowledge-upload-open")));
  knowledgeRefreshButton?.addEventListener("click", () => loadKnowledgeDocuments(null, true));

  form?.querySelectorAll("input, textarea").forEach((control) => {
    control.addEventListener("input", () => {
      clearFieldError(control.name);
      syncInputReadiness();
    });
  });
}

async function submitCurriculumDesign(event) {
  event.preventDefault();
  if (isSubmitting) return;

  const values = readFormValues();
  const validation = validateCurriculumDesignForm(values);
  clearAllFieldErrors();

  if (!validation.valid) {
    showValidationErrors(validation.errors);
    setSteps("error");
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  actionPanel?.classList.add("is-running");
  submitButton.querySelector(".primary-action-label").textContent = "正在生成方案...";
  setStatus(referenceFile ? "正在上传参考文件并生成课程设计方案..." : "正在生成课程设计方案...", "loading", "生成中");
  setSteps("loading");
  renderPreviewLoading(values);

  try {
    const task = await generateCurriculumDesignAsync(values, (message) => setStatus(message, "loading", "解析中"));
    setStatus("生成任务已提交，正在连接流式输出...", "loading", "连接中");
    const completedTask = await watchCurriculumDesignTask(task.task_id, renderTaskStreamEvent);
    const artifactId = Number(completedTask.result_payload?.artifact_id || completedTask.result_artifact_id || 0);
    if (!artifactId) throw new Error("生成已完成，但未返回课程设计资源编号。");
    const response = await fetchCurriculumDesignArtifact(artifactId, values);
    lastGeneratedDesign = response;
    previewSource.textContent = "已生成";
    setStatus(response.message || "课程设计方案生成成功，已写入生成历史。", "success", "已完成");
    setSteps("complete");
    renderDesignPreview(response.design);
  } catch (error) {
    const message = "课程设计方案生成未完成，请检查输入后重试。";
    setStatus(message, "error", "需重试");
    setSteps("error");
    setPreviewEmpty("生成遇到问题", message);
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    actionPanel?.classList.remove("is-running");
    submitButton.querySelector(".primary-action-label").textContent = "开始智能设计";
  }
}

async function handleManageDesigns() {
  hideTaskStream();
  setStatus("正在同步我的课程设计记录...", "loading", "同步中");
  previewSource.textContent = "历史记录";
  preview.innerHTML = `
    <div class="preview-empty">
      <div><strong>我的课程设计记录</strong><span>正在读取生成历史...</span></div>
    </div>
  `;

  try {
    const response = await fetchMyCurriculumDesigns();
    renderHistoryPreview(response.designs);
    setStatus(`已从生成历史同步 ${response.designs.length} 条课程设计记录。`, "ready", "已同步");
  } catch (error) {
    const message = error instanceof Error ? error.message : "课程设计历史读取失败。";
    setStatus(message, "error", "读取失败");
    setPreviewEmpty("历史记录读取失败", message);
  }
}

function handleFileZoneClick(event) {
  if (event.target.closest("button")) return;
  fileInput?.click();
}

function handleFileZoneKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  fileInput?.click();
}

function handleFileDragOver(event) {
  event.preventDefault();
  fileControl?.classList.add("is-dragging");
}

function handleFileDragLeave(event) {
  if (!fileControl?.contains(event.relatedTarget)) {
    fileControl?.classList.remove("is-dragging");
  }
}

function handleFileDrop(event) {
  event.preventDefault();
  fileControl?.classList.remove("is-dragging");
  const [file] = Array.from(event.dataTransfer?.files || []);
  if (file) setReferenceFile(file);
}

function handleFileChange(event) {
  const [file] = Array.from(event.target.files || []);
  if (!file) {
    clearReferenceFile();
    return;
  }
  setReferenceFile(file);
}

function setReferenceFile(file) {
  referenceFile = file;
  fileStatus.textContent = `已选择：${file.name}`;
  fileStatus.classList.add("is-selected");
  fileControl.classList.add("is-selected");
  fileClearButton.hidden = false;
  clearFieldError("referenceFile");
  syncInputReadiness();
}

function clearReferenceFile() {
  referenceFile = null;
  if (fileInput) fileInput.value = "";
  fileStatus.textContent = "未选择文件";
  fileStatus.classList.remove("is-selected");
  fileControl.classList.remove("is-selected", "is-dragging");
  fileClearButton.hidden = true;
  syncInputReadiness();
}

function readFormValues() {
  return {
    courseId: getValue("courseId"),
    courseTopic: getValue("courseTopic"),
    targetLearners: getValue("targetLearners"),
    totalHours: getValue("totalHours"),
    learningObjectives: getValue("learningObjectives"),
    additionalRequirements: getValue("additionalRequirements"),
    referenceFile,
    knowledgeDocumentIds: Array.from(knowledgeDocuments?.selectedOptions || [], (option) => Number(option.value))
  };
}

async function loadCourses() {
  if (!courseSelect) return;
  try {
    const courses = await fetchMyCourses();
    courseSelect.innerHTML = [
      '<option value="">不指定班级，按通用要求生成</option>',
      ...courses.map((course) => `<option value="${Number(course.id)}">${escapeHtml(course.name)}（${Number(course.student_count || 0)} 名学生）</option>`)
    ].join("");
    courseHint.textContent = courses.length
      ? "选择后，AI 会实时参考该班级整体画像、薄弱点和课程作业达成率。"
      : "当前暂无可选择的班级，可先创建课程并邀请学生加入。";
  } catch (error) {
    courseHint.textContent = error instanceof Error ? error.message : "班级列表加载失败。";
  }
}

async function loadKnowledgeDocuments(autoSelectId = null, selectLatest = false) {
  if (!knowledgeDocuments) return;
  knowledgeRefreshButton.disabled = true;
  try {
    const selected = new Set(Array.from(knowledgeDocuments.selectedOptions, (option) => Number(option.value)));
    const documents = await fetchKnowledgeDocuments();
    knowledgeDocuments.innerHTML = documents.map((document) =>
      `<option value="${Number(document.id)}">${escapeHtml(document.title)} · ${Number(document.chunk_count || 0)} 个分块</option>`
    ).join("");
    if (autoSelectId) selected.add(autoSelectId);
    if (selectLatest && documents[0]) selected.add(Number(documents[0].id));
    Array.from(knowledgeDocuments.options).forEach((option) => { option.selected = selected.has(Number(option.value)); });
    knowledgeDocumentsHint.textContent = documents.length
      ? `已加载 ${documents.length} 份就绪资料，已选择 ${knowledgeDocuments.selectedOptions.length} 份。`
      : "知识库暂无已入库资料。";
  } catch (error) {
    knowledgeDocumentsHint.textContent = error instanceof Error ? error.message : "知识库资料加载失败。";
  } finally {
    knowledgeRefreshButton.disabled = false;
  }
}

function getValue(name) {
  return String(form?.elements[name]?.value || "");
}

function syncInputReadiness() {
  const values = readFormValues();
  const requiredReady = Boolean(values.courseTopic.trim() && values.targetLearners.trim() && values.learningObjectives.trim());
  setSteps(requiredReady ? "ready" : "idle");
}

function showValidationErrors(errors) {
  const firstField = Object.keys(errors)[0];
  Object.entries(errors).forEach(([field, message]) => {
    markFieldError(field, message);
  });
  setStatus(errors[firstField], "error", "需检查");
  form?.elements[firstField]?.focus();
}

function markFieldError(field, message) {
  const fieldNode = form?.querySelector(`[data-field="${field}"]`);
  if (!fieldNode) return;
  fieldNode.classList.add("has-error");
  fieldNode.dataset.error = message;
}

function clearFieldError(field) {
  const fieldNode = form?.querySelector(`[data-field="${field}"]`);
  fieldNode?.classList.remove("has-error");
  if (fieldNode?.dataset.error) {
    delete fieldNode.dataset.error;
  }
}

function clearAllFieldErrors() {
  form?.querySelectorAll(".has-error").forEach((node) => {
    node.classList.remove("has-error");
    delete node.dataset.error;
  });
}

function setStatus(message, variant = "ready", label = "就绪") {
  if (!statusConsole) return;
  statusConsole.className = `helper-note curriculum-status-console is-${variant}`;
  statusConsole.querySelector("span").textContent = label;
  statusConsole.querySelector("strong").textContent = message;
}

function setSteps(mode) {
  stepInput?.classList.remove("is-active", "is-complete");
  stepGenerate?.classList.remove("is-active", "is-complete");

  if (mode === "ready") {
    stepInput?.classList.add("is-complete");
    panelStatusDot.textContent = "可生成";
    return;
  }
  if (mode === "loading") {
    stepInput?.classList.add("is-complete");
    stepGenerate?.classList.add("is-active");
    panelStatusDot.textContent = "生成中";
    return;
  }
  if (mode === "complete") {
    stepInput?.classList.add("is-complete");
    stepGenerate?.classList.add("is-complete");
    panelStatusDot.textContent = "已完成";
    return;
  }
  if (mode === "error") {
    stepInput?.classList.add("is-active");
    panelStatusDot.textContent = "需检查";
    return;
  }
  stepInput?.classList.add("is-active");
  panelStatusDot.textContent = "待填写";
}

function setPreviewEmpty(title = "课程设计方案将在生成后显示", detail = "提交需求后，这里会呈现课程目标、教学模块、学时安排、实践项目与评价方式。") {
  previewSource.textContent = "待生成";
  preview.innerHTML = `
    <div class="preview-empty">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
    </div>
  `;
}

function renderPreviewLoading(values) {
  streamedContent = "";
  displayedProgress = 0;
  streamedReferences = [];
  streamedWarnings = [];
  previewSource.textContent = "生成中";
  preview.innerHTML = `
    <div class="preview-empty">
      <div>
        <strong>${escapeHtml(values.courseTopic?.trim() || "课程设计方案")}</strong>
        <span>生成结果将在流式任务完成后显示。</span>
      </div>
    </div>
  `;
  taskStream.hidden = false;
  taskStream.innerHTML = `
    <section class="task-stream-panel generation-progress generation-progress--teacher" data-state="running" data-testid="teacher-task-progress" aria-live="polite">
      <header class="generation-progress__header">
        <div class="generation-progress__heading">
          <strong>${escapeHtml(values.courseTopic?.trim() || "课程设计方案")}</strong>
          <span id="streamStage">等待生成</span>
        </div>
        <span class="generation-progress__percent" id="streamProgressText">0%</span>
      </header>
      <div class="generation-progress__track" id="streamProgress" role="progressbar" aria-label="课程设计方案生成进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <span class="generation-progress__fill" id="streamProgressFill"></span>
      </div>
      <p class="generation-progress__status" id="streamStatus">正在生成课程目标、教学模块、学时安排、实践项目与评价方式...</p>
      <div class="generation-progress__details">
        <p id="streamReferences" hidden></p>
        <div class="curriculum-markdown task-partial-content" id="streamContent"><span class="field-hint">等待模型返回内容...</span></div>
        <div id="streamMessages"></div>
      </div>
    </section>
  `;
}

function renderTaskStreamEvent(event) {
  if (event.progress !== null && event.progress !== undefined) {
    displayedProgress = Math.max(displayedProgress, Math.max(0, Math.min(100, Number(event.progress))));
  }
  const progressNode = taskStream.querySelector("#streamProgress");
  const progressFill = taskStream.querySelector("#streamProgressFill");
  const progressText = taskStream.querySelector("#streamProgressText");
  const stageNode = taskStream.querySelector("#streamStage");
  const statusNode = taskStream.querySelector("#streamStatus");
  const referencesNode = taskStream.querySelector("#streamReferences");
  const contentNode = taskStream.querySelector("#streamContent");
  const messagesNode = taskStream.querySelector("#streamMessages");
  if (progressNode) progressNode.setAttribute("aria-valuenow", String(displayedProgress));
  if (progressFill) progressFill.style.transform = `scaleX(${displayedProgress / 100})`;
  if (progressText) progressText.textContent = `${displayedProgress}%`;
  if (stageNode && event.stage) stageNode.textContent = stageLabel(event.stage);
  if (statusNode && event.message) statusNode.textContent = event.message;
  if (event.type === "reference" && event.reference) streamedReferences.push(event.reference);
  if (event.type === "warning" && event.message) streamedWarnings.push(String(event.message));
  if (referencesNode && streamedReferences.length) {
    referencesNode.hidden = false;
    referencesNode.textContent = `已解析参考资料：${streamedReferences.map(referenceLabel).join("、")}`;
  }
  if (event.type === "meta" && event.snapshot) streamedContent = String(event.text || "");
  if (event.type === "delta" && event.text) streamedContent += String(event.text);
  if (contentNode && streamedContent) contentNode.innerHTML = renderMarkdown(streamedContent);
  if (messagesNode) {
    messagesNode.innerHTML = streamedWarnings.map((warning) => `<p class="task-warning">${escapeHtml(warning)}</p>`).join("");
    if (event.type === "error") {
      messagesNode.innerHTML += '<p class="task-error">当前内容生成未完成，请稍后重试。</p>';
    }
  }
  const panel = taskStream.querySelector(".generation-progress");
  if (event.type === "error") {
    if (panel) panel.dataset.state = "error";
    setStatus("课程设计方案生成未完成，请检查输入后重试。", "error", "生成失败");
  } else if (event.type === "done") {
    displayedProgress = 100;
    if (progressNode) progressNode.setAttribute("aria-valuenow", "100");
    if (progressFill) progressFill.style.transform = "scaleX(1)";
    if (progressText) progressText.textContent = "100%";
    if (panel) panel.dataset.state = "success";
    if (statusNode) statusNode.textContent = "生成完成，结果已就绪。";
    setStatus("课程设计方案生成完成。", "success", "已完成");
  } else {
    if (panel) panel.dataset.state = "running";
    setStatus(event.message || "正在接收 AI 流式输出...", "loading", stageLabel(event.stage));
  }
}

function hideTaskStream() {
  if (!taskStream) return;
  taskStream.hidden = true;
  taskStream.innerHTML = "";
  streamedContent = "";
  displayedProgress = 0;
  streamedReferences = [];
  streamedWarnings = [];
}

function referenceLabel(reference) {
  return String(reference?.source_filename || reference?.file_id || reference?.document_id || reference?.knowledge_document_id || "资料");
}

function stageLabel(stage) {
  return ({
    queued: "排队中",
    validating: "校验中",
    parsing_references: "解析资料",
    retrieving: "检索知识库",
    building_prompt: "构建提示词",
    generating: "流式生成",
    quality_analysis: "质量分析",
    persisting: "保存中",
    completed: "已完成"
  })[stage] || "生成中";
}

function renderDesignPreview(design) {
  const objectives = (design.objectives || []).map((objective) => `<li>${escapeHtml(objective)}</li>`).join("");
  const quality = renderQualityAnalysis(design.quality_analysis);
  const references = renderReferences(design.references || [], design.warnings || []);
  const artifactLink = design.artifact_id ? `<a class="panel-action" href="/teacher/artifacts/${design.artifact_id}">查看详情</a>` : "";

  preview.innerHTML = `
    <article class="curriculum-preview-result" data-testid="external-teacher-curriculum-design-result">
      <div class="summary-card">
        <h4>${escapeHtml(design.title)}</h4>
        <p>${escapeHtml(design.targetLearners)}${design.totalHours ? ` · ${escapeHtml(design.totalHours)} 学时` : ""}</p>
        ${objectives ? `<ul>${objectives}</ul>` : ""}
      </div>
      ${quality}
      <div class="summary-card">
        <h4>生成内容</h4>
        <div class="curriculum-markdown">${renderMarkdown(design.content || "暂未收到完整正文，请稍后重试或调整输入后重新生成。")}</div>
      </div>
      ${references}
      <div class="action-row curriculum-result-actions">
        ${artifactLink}
        <button class="secondary-action" type="button" data-action="copy-result">复制内容</button>
        <button class="secondary-action" type="button" data-action="export-result">导出 Markdown</button>
        <button class="secondary-action" type="button" data-action="save-result">保存状态</button>
      </div>
    </article>
  `;

  preview.querySelector('[data-action="copy-result"]')?.addEventListener("click", copyGeneratedContent);
  preview.querySelector('[data-action="export-result"]')?.addEventListener("click", exportGeneratedContent);
  preview.querySelector('[data-action="save-result"]')?.addEventListener("click", confirmSavedResult);
}

function renderHistoryPreview(designs) {
  previewSource.textContent = "历史记录";
  if (!designs.length) {
    setPreviewEmpty("暂无课程设计历史", "完成一次课程设计生成后，记录会自动写入生成历史。");
    previewSource.textContent = "历史记录";
    return;
  }

  preview.innerHTML = `
    <article class="curriculum-preview-result" data-testid="external-teacher-curriculum-design-history">
      <div class="summary-card">
        <h4>我的课程设计记录</h4>
        <p>以下记录来自已生成的课程设计历史。</p>
      </div>
      <div class="summary-list">
        ${designs
          .map(
            (item) => `
              <a class="summary-card curriculum-history-item" href="/teacher/artifacts/${escapeHtml(item.id)}">
                <h4>${escapeHtml(item.title)}</h4>
                <p>${escapeHtml(formatDate(item.createdAt))} · ${escapeHtml(item.status)}</p>
              </a>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderQualityAnalysis(analysis) {
  if (!analysis) {
    return `
      <div class="summary-card quality-panel" data-testid="external-teacher-curriculum-design-quality">
        <h4>质量分析</h4>
        <p>本次生成暂未提供质量分析，可在详情页继续查看更新结果。</p>
      </div>
    `;
  }
  if (analysis.analysis_version === "qa-v2") {
    if (!analysis.evidence_available) {
      return `
        <div class="summary-card quality-panel quality-panel--v2" data-testid="external-teacher-curriculum-design-quality">
          <h4>质量分析</h4>
          <p>${escapeHtml(analysis.unavailable_reason || "本次生成没有可用的知识库证据，无法计算来源覆盖率与匹配度。")}</p>
        </div>
      `;
    }
    const matched = Array.isArray(analysis.matched_keypoints) ? analysis.matched_keypoints : [];
    const missing = Array.isArray(analysis.missing_keypoints) ? analysis.missing_keypoints : [];
    return `
      <div class="summary-card quality-panel quality-panel--v2" data-testid="external-teacher-curriculum-design-quality">
        <h4>质量分析 <small>生成质量诊断报告</small></h4>
        <div class="quality-metrics">
          ${renderQualityMetric("来源覆盖率", analysis.source_coverage, "证据关键点被生成内容覆盖的比例")}
          ${renderQualityMetric("来源匹配度", analysis.source_match_rate, "生成段落与实际引用证据的平均语义匹配程度")}
          ${renderQualityMetric("诊断可信度", analysis.diagnostic_confidence, "表示证据完整性与分析稳定性")}
        </div>
        <div class="quality-keypoint-grid">
          ${renderKeypointGroup("已覆盖关键点", matched.map((item) => item.keypoint).filter(Boolean), "matched")}
          ${missing.length ? renderKeypointGroup("待补充关键点", missing, "missing") : ""}
        </div>
      </div>
    `;
  }
  const coverage = Number(analysis.coverage?.coverage_rate || 0);
  const coveragePercent = Math.round(coverage <= 1 ? coverage * 100 : coverage);
  const depth = analysis.depth?.score ?? "-";
  const confidence = analysis.confidence?.level || analysis.confidence?.confidence_level || "-";
  const suggestions = Array.isArray(analysis.suggestions) ? analysis.suggestions.slice(0, 3) : [];
  return `
    <div class="summary-card quality-panel" data-testid="external-teacher-curriculum-design-quality">
      <h4>质量分析</h4>
      <p>覆盖度：${escapeHtml(coveragePercent)}% · 深度：${escapeHtml(depth)} · 置信度：${escapeHtml(confidence)}</p>
      ${suggestions.length ? `<ul>${suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    </div>
  `;
}

function renderQualityMetric(label, value, detail) {
  const percent = Math.round(Math.max(0, Math.min(1, Number(value || 0))) * 100);
  return `<article><strong>${escapeHtml(label)} <b>${percent}%</b></strong><progress max="100" value="${percent}"></progress><small>${escapeHtml(detail)}</small></article>`;
}

function renderKeypointGroup(label, points, kind) {
  return `
    <section class="quality-keypoint-group">
      <strong>${escapeHtml(label)} <small>${points.length} 项</small></strong>
      <div class="quality-tag-list">${points.map((point) => `<span class="quality-tag quality-tag--${kind}" title="${escapeHtml(point)}">${escapeHtml(point)}</span>`).join("")}</div>
    </section>
  `;
}

function renderReferences(references, warnings) {
  if (!references.length && !warnings.length) return "";
  return `
    <div class="summary-card reference-result-list">
      <h4>引用与提示</h4>
      ${
        references.length
          ? `<div>${references
              .slice(0, 6)
              .map(
                (reference) => `
                  <article>
                    <strong>${escapeHtml(reference.source_filename || reference.source_type || "引用")}</strong>
                    <p>${escapeHtml(reference.excerpt || `document_id=${reference.document_id || ""} file_id=${reference.file_id || ""}`)}</p>
                  </article>
                `
              )
              .join("")}</div>`
          : ""
      }
      ${warnings.length ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
    </div>
  `;
}

function renderMarkdown(content) {
  return renderSafeMarkdown(String(content || ""));
}

async function copyGeneratedContent() {
  const content = lastGeneratedDesign?.design?.content || "";
  if (!content) {
    setStatus("当前没有可复制的生成内容。", "error", "复制失败");
    return;
  }
  await navigator.clipboard.writeText(content);
  setStatus("生成内容已复制到剪贴板。", "success", "已复制");
}

function exportGeneratedContent() {
  const content = lastGeneratedDesign?.design?.content || "";
  if (!content) {
    setStatus("当前没有可导出的生成内容。", "error", "导出失败");
    return;
  }
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(lastGeneratedDesign?.design?.title || "course-design")}.md`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Markdown 文件已导出。", "success", "已导出");
}

async function confirmSavedResult() {
  try {
    const response = await saveCurriculumDesign(lastGeneratedDesign);
    setStatus(response.message || "当前结果已保存到生成历史。", "success", "已保存");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "保存状态确认失败。", "error", "保存失败");
  }
}

function sanitizeFilename(value) {
  return String(value || "course-design").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
