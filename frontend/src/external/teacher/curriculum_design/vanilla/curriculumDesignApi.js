const API_BASE_URL = window.__PRISMMIND_API_BASE_URL__ || "http://127.0.0.1:8000/api/v1";

export const CURRICULUM_DESIGN_ENDPOINTS = {
  generate: "/teacher/course-designs/generate",
  generateAsync: "/teacher/course-designs/generate-async",
  uploadReference: "/files/upload",
  myDesigns: "/teacher/generated-artifacts?artifact_type=course_design&page=1&page_size=10",
  artifactDetail: "/teacher/generated-artifacts"
};

export async function generateCurriculumDesign(values, onProgress) {
  const payload = await buildCurriculumDesignPayload(values, onProgress);
  const data = await requestJson(CURRICULUM_DESIGN_ENDPOINTS.generate, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return normalizeCurriculumDesignResponse(data, values);
}

export async function fetchMyCurriculumDesigns() {
  const data = await requestJson(CURRICULUM_DESIGN_ENDPOINTS.myDesigns);
  const items = Array.isArray(data) ? data : data.items || data.artifacts || [];
  return {
    source: "api",
    designs: normalizeDesignList(items)
  };
}

export async function generateCurriculumDesignAsync(values, onProgress) {
  const payload = await buildCurriculumDesignPayload(values, onProgress);
  return requestJson(CURRICULUM_DESIGN_ENDPOINTS.generateAsync, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function watchCurriculumDesignTask(taskId, onEvent) {
  const applySnapshot = (task) => onEvent?.({
    type: "meta",
    task_id: task.id,
    stage: task.current_stage,
    progress: task.progress,
    message: task.status_message,
    text: task.partial_content || "",
    result_payload: task.result_payload || {},
    status: task.status,
    snapshot: true
  });
  let snapshot = await requestJson(`/tasks/${taskId}`);
  applySnapshot(snapshot);
  if (snapshot.status === "success" || snapshot.status === "failed") return snapshot;

  try {
    const response = await fetch(buildApiUrl(`/tasks/${taskId}/stream`), {
      headers: buildHeaders({ Accept: "application/x-ndjson" })
    });
    if (!response.ok || !response.body) throw new Error(`任务流连接失败：HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamDone = false;
    while (!streamDone) {
      const chunk = await reader.read();
      streamDone = chunk.done;
      buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !streamDone });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        onEvent?.(event);
        if (event.type === "error") throw new Error(event.error || event.message || "课程设计生成失败。");
      }
    }
    if (buffer.trim()) onEvent?.(JSON.parse(buffer));
  } catch (error) {
    if (error instanceof Error && !error.message.includes("任务流连接失败")) throw error;
  }

  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    snapshot = await requestJson(`/tasks/${taskId}`);
    applySnapshot(snapshot);
    if (snapshot.status === "success") return snapshot;
    if (snapshot.status === "failed") throw new Error(snapshot.error_message || "课程设计生成失败。");
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
  throw new Error("课程设计生成等待超时，请到生成历史查看任务结果。");
}

export async function fetchCurriculumDesignArtifact(artifactId, submittedValues) {
  const data = await requestJson(`${CURRICULUM_DESIGN_ENDPOINTS.artifactDetail}/${artifactId}`);
  return normalizeCurriculumDesignResponse(data, submittedValues);
}

export async function fetchKnowledgeDocuments() {
  const data = await requestJson('/knowledge/documents?status=ingested&page=1&page_size=100');
  return Array.isArray(data) ? data : data.items || [];
}

export async function fetchMyCourses() {
  const data = await requestJson('/courses/my?page=1&page_size=100');
  return Array.isArray(data) ? data : data.items || [];
}

export async function saveCurriculumDesign(design) {
  const artifactId = design?.artifact_id || design?.artifactId || design?.designId;
  if (!artifactId) {
    throw new Error("当前生成结果尚未返回 artifact_id，无法确认保存状态。");
  }
  return {
    source: "api",
    saved: true,
    designId: artifactId,
    message: "当前系统生成后已自动保存到生成历史。"
  };
}

export function validateCurriculumDesignForm(values) {
  const errors = {};

  if (!values.courseTopic.trim()) {
    errors.courseTopic = "请填写课程主题名称。";
  }

  if (!values.targetLearners.trim()) {
    errors.targetLearners = "请填写目标学习者。";
  }

  if (!values.learningObjectives.trim()) {
    errors.learningObjectives = "请补充核心学习目标后再开始设计。";
  }

  if (values.totalHours.trim()) {
    const totalHours = parseInteger(values.totalHours);
    if (!Number.isFinite(totalHours) || totalHours <= 0 || totalHours > 512) {
      errors.totalHours = "总学时必须是 1-512 之间的整数。";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

async function buildCurriculumDesignPayload(values, onProgress) {
  const uploadedReference = values.referenceFile ? await uploadCurriculumReferenceFile(values.referenceFile) : null;
  if (uploadedReference?.fileId) {
    await waitForCurriculumReference(uploadedReference, onProgress);
  }
  const additionalParts = [values.additionalRequirements.trim()];
  if (uploadedReference?.fileId) {
    additionalParts.push(`参考文件已上传：${uploadedReference.fileName || "未命名文件"}。`);
  }

  const objectives = values.learningObjectives.trim();
  const payload = {
    course_id: values.courseId ? Number(values.courseId) : null,
    course_name: values.courseTopic.trim(),
    target_students: values.targetLearners.trim(),
    total_hours: parseInteger(values.totalHours) || 48,
    course_objectives: objectives,
    key_topics: splitObjectives(objectives).slice(0, 8),
    additional_requirements: additionalParts.filter(Boolean).join("\n"),
    knowledge_document_ids: values.knowledgeDocumentIds?.length ? values.knowledgeDocumentIds : null,
    use_knowledge_base: Boolean(values.knowledgeDocumentIds?.length),
    top_k: 5
  };

  if (uploadedReference?.fileId) {
    payload.file_ids = [uploadedReference.fileId];
  }

  return payload;
}

async function waitForCurriculumReference(reference, onProgress) {
  const deadline = Date.now() + 30 * 60 * 1000;
  while (true) {
    const asset = await requestJson(`/files/${reference.fileId}`);
    if (asset.parse_status === "parsed") return;
    if (asset.parse_status === "failed") {
      throw new Error(`文件“${asset.original_filename || reference.fileName}”解析失败：${asset.parse_error || "未知错误"}`);
    }
    if (Date.now() >= deadline) throw new Error(`等待文件“${reference.fileName}”解析超时，请稍后重试。`);
    onProgress?.(`正在解析参考文件“${reference.fileName}”，完成后将自动继续生成。`);
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
}

async function uploadCurriculumReferenceFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("asset_type", "teacher_generation_reference");
  const data = await requestJson(CURRICULUM_DESIGN_ENDPOINTS.uploadReference, {
    method: "POST",
    body: formData
  });
  return {
    source: "api",
    uploaded: true,
    fileId: data.id,
    fileName: data.original_filename || file.name
  };
}

async function requestJson(path, options = {}) {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: buildHeaders(options.headers)
  });

  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    payload = await response.json();
  } else {
    const text = await response.text();
    payload = text ? { message: text } : null;
  }

  if (!response.ok) {
    throw new Error(normalizeErrorMessage(response.status, payload));
  }

  return unwrapApiPayload(payload);
}

function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_BASE_URL.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function buildHeaders(headers = {}) {
  const token = getAuthToken();
  const nextHeaders = { ...headers };
  if (token) {
    nextHeaders.Authorization = `Bearer ${token}`;
  }
  return nextHeaders;
}

function getAuthToken() {
  return (
    localStorage.getItem("edugenie_access_token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("prismmind_access_token") ||
    ""
  );
}

function unwrapApiPayload(payload) {
  if (payload && typeof payload === "object" && "code" in payload && "data" in payload) {
    if (payload.code !== 0) {
      throw new Error(payload.message || "请求失败。");
    }
    return payload.data;
  }
  return payload;
}

function normalizeErrorMessage(status, payload) {
  const message = payload?.message || payload?.detail;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (Array.isArray(message)) return "请求参数不合法，请检查表单内容。";
  if (status === 401) return "登录状态已失效，请重新登录。";
  if (status === 403) return "当前账号无权访问该功能。";
  if (status === 400 || status === 422) return "请求参数不合法，请检查表单内容。";
  if (status >= 500) return "生成服务暂时繁忙，请稍后重试。";
  return "请求未能完成，请稍后重试。";
}

export function normalizeCurriculumDesignResponse(data = {}, submittedValues = {}) {
  return {
    success: true,
    source: "api",
    designId: data.artifact_id || data.id,
    artifact_id: data.artifact_id || data.id,
    artifact_type: data.artifact_type || "course_design",
    title: data.title || `${submittedValues.courseTopic || "课程"}设计方案`,
    message: "课程设计方案生成成功，已保存到生成历史。",
    design: {
      title: data.title || `${submittedValues.courseTopic || "课程"}设计方案`,
      targetLearners: submittedValues.targetLearners || "",
      totalHours: normalizeHours(submittedValues.totalHours) || 48,
      objectives: splitObjectives(submittedValues.learningObjectives),
      modules: [],
      practiceProject: "",
      assessment: "",
      content: data.content || "",
      content_format: data.content_format || "markdown",
      created_at: data.created_at,
      quality_analysis: data.quality_analysis || null,
      references: Array.isArray(data.references) ? data.references : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
      artifact_id: data.artifact_id || data.id
    }
  };
}

function normalizeDesignList(designs) {
  if (!Array.isArray(designs)) return [];

  return designs.map((design) => ({
    id: design.id || design.artifact_id,
    title: design.title || "未命名课程设计方案",
    createdAt: design.created_at || design.createdAt || "",
    status: design.status || "generated"
  }));
}

function splitObjectives(value) {
  return String(value || "")
    .split(/\r?\n|,|，|;|；/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function normalizeHours(value) {
  const number = parseInteger(value);
  return Number.isFinite(number) && number > 0 ? number : "";
}

function parseInteger(value) {
  const number = Number.parseInt(String(value || "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(number) ? number : 0;
}
