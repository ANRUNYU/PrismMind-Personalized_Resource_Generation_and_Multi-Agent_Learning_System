import { getToken } from "@/utils/storage";
import { resolveApiBaseURL } from "@/api/baseUrl";

const API_BASE_URL = resolveApiBaseURL();

export const RADAR_API_PATH = `${API_BASE_URL}/student/profile/me`;

export const EMPTY_RADAR_DATA = {
  dimensions: [
    { id: 1, label: "知", value: 0 },
    { id: 2, label: "践", value: 0 },
    { id: 3, label: "创", value: 0 },
    { id: 4, label: "测", value: 0 },
    { id: 5, label: "效", value: 0 },
    { id: 6, label: "质", value: 0 }
  ],
  updatedAt: new Date().toISOString(),
  source: "empty"
};

const SCORE_FIELDS = [
  ["knowledge_score", "知"],
  ["practice_score", "践"],
  ["innovation_score", "创"],
  ["exam_score", "测"],
  ["efficiency_score", "效"],
  ["quality_score", "质"]
];

export function validateRadarData(payload) {
  if (!payload || !Array.isArray(payload.dimensions)) {
    return false;
  }

  if (payload.dimensions.length !== 6) {
    return false;
  }

  return payload.dimensions.every((item) => {
    const value = Number(item?.value);
    return Number.isFinite(value) && value >= 0 && value <= 100;
  });
}

export function normalizeRadarData(payload) {
  const dimensions = EMPTY_RADAR_DATA.dimensions.map((baseDimension, index) => {
    const item = payload?.dimensions?.[index] ?? baseDimension;
    const numericValue = Number(item.value);

    return {
      id: Number.isFinite(Number(item.id)) ? Number(item.id) : baseDimension.id,
      label: item.label ? String(item.label) : baseDimension.label,
      value: clampValue(numericValue)
    };
  });

  return {
    dimensions,
    updatedAt: payload?.updatedAt || new Date().toISOString(),
    source: payload?.source || "api"
  };
}

export async function fetchRadarData(endpoint = RADAR_API_PATH) {
  const token = getToken();
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (response.status === 404) {
    return normalizeRadarData({
      ...EMPTY_RADAR_DATA,
      source: "profile-not-created",
      updatedAt: new Date().toISOString()
    });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || "学习画像数据加载失败");
  }

  const profile = unwrapApiResponse(payload);
  const radarData = profileToRadarData(profile);

  if (!validateRadarData(radarData)) {
    throw new Error("学习画像雷达数据格式不正确");
  }

  return normalizeRadarData(radarData);
}

export function createRadarPolling({ endpoint = RADAR_API_PATH, interval = 3000, onData, onError }) {
  let timerId = null;
  let stopped = false;

  const request = async () => {
    try {
      const data = await fetchRadarData(endpoint);
      if (!stopped) {
        onData?.(data);
      }
    } catch (error) {
      if (!stopped) {
        onError?.(error);
      }
    }
  };

  request();
  timerId = window.setInterval(request, interval);

  return () => {
    stopped = true;
    if (timerId) {
      window.clearInterval(timerId);
    }
  };
}

function unwrapApiResponse(payload) {
  if (payload && typeof payload === "object" && "code" in payload && "data" in payload) {
    if (payload.code !== 0) {
      throw new Error(payload.message || "学习画像数据加载失败");
    }
    return payload.data;
  }
  return payload;
}

export function profileToRadarData(profile) {
  if (!profile) {
    return EMPTY_RADAR_DATA;
  }

  if (profile.radar_chart_data?.indicators && Array.isArray(profile.radar_chart_data?.values)) {
    return {
      dimensions: profile.radar_chart_data.values.slice(0, 6).map((value, index) => ({
        id: index + 1,
        label: compactRadarLabel(profile.radar_chart_data.indicators[index]?.name || SCORE_FIELDS[index][1]),
        value: clampValue(Number(value))
      })),
      updatedAt: profile.updated_at || new Date().toISOString(),
      source: "profile"
    };
  }

  return {
    dimensions: SCORE_FIELDS.map(([field, label], index) => ({
      id: index + 1,
      label,
      value: clampValue(Number(profile[field] ?? 0))
    })),
    updatedAt: profile.updated_at || new Date().toISOString(),
    source: "profile"
  };
}

function compactRadarLabel(label) {
  const text = String(label || "").trim();
  if (!text) return "";
  const map = {
    知识基础: "知",
    实践能力: "践",
    创新思维: "创",
    应试能力: "测",
    学习效率: "效",
    学习质量: "质"
  };
  return map[text] || text.slice(0, 1);
}

function clampValue(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(Math.min(100, Math.max(0, value)).toFixed(2));
}
