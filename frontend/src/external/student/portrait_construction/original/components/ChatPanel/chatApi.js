import { getToken } from "@/utils/storage";
import { resolveApiBaseURL } from "@/api/baseUrl";
import { consumeNdjsonStream } from "@/utils/taskStream";

const API_BASE_URL = resolveApiBaseURL();
export const CHAT_API_PATH = `${API_BASE_URL}/student/profile/onboarding`;
export const CHAT_SESSION_ID = "profile-onboarding";

function headers() {
  const token = getToken();
  return { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function unwrap(payload) {
  if (payload && typeof payload === "object" && "data" in payload) {
    if (payload.code !== 0) throw new Error(payload.message || "画像请求失败");
    return payload.data;
  }
  return payload;
}

export async function loadOnboarding() {
  let response;
  try {
    response = await fetch(CHAT_API_PATH, { headers: headers() });
  } catch (cause) {
    const error = new Error("无法连接画像服务，请检查网络后重试");
    error.isNetworkError = true;
    error.cause = cause;
    throw error;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || "画像状态加载失败");
  return unwrap(payload);
}

export async function sendChatMessage(message, { state, idempotencyKey } = {}) {
  if (!String(message || "").trim()) throw new Error("请输入回答");
  if (!state?.conversation_id) throw new Error("画像会话尚未建立，请先重新连接");
  let response;
  try {
    response = await fetch(`${CHAT_API_PATH}/messages`, {
      method: "POST", headers: headers(), body: JSON.stringify({
        conversation_id: state.conversation_id, answer: String(message).trim(), idempotency_key: idempotencyKey
      })
    });
  } catch (cause) {
    const error = new Error("画像对话连接中断，请稍后重试");
    error.isNetworkError = true;
    error.cause = cause;
    throw error;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || "画像回答提交失败");
  return unwrap(payload);
}

export async function streamProfileMessage(message, { state, idempotencyKey, signal, onEvent } = {}) {
  if (!String(message || "").trim()) throw new Error("请输入问题");
  if (!state?.conversation_id) throw new Error("画像会话尚未建立，请先重新连接");
  let response;
  try {
    response = await fetch(`${CHAT_API_PATH}/messages/stream`, {
      method: "POST",
      headers: { ...headers(), Accept: "application/x-ndjson" },
      body: JSON.stringify({
        conversation_id: state.conversation_id,
        answer: String(message).trim(),
        idempotency_key: idempotencyKey
      }),
      signal
    });
  } catch (cause) {
    const error = new Error("画像对话连接中断，请稍后重试");
    error.isNetworkError = true;
    error.cause = cause;
    throw error;
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || "画像流式回答启动失败");
  }
  await consumeNdjsonStream(response, (event) => {
    if (event.type === "error") throw new Error(event.error || "画像回答生成失败");
    onEvent?.(event);
  });
}
