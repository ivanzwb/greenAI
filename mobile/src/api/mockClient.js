import { articles } from "../data/knowledge";

export const BASE_URL = "mock://greenai-shadow";

const today = new Date();
const isoDay = today.toISOString().slice(0, 10);

let user = {
  timezone: "Asia/Shanghai",
  latitude: 31.2304,
  longitude: 121.4737,
  locationLabel: "上海市 · 静安区",
  windowAspect: "east",
  airConditioning: true,
};

let plants = [
  {
    id: "p1",
    nickname: "客厅绿萝",
    speciesLabel: "绿萝（Epipremnum）",
    taxonFamily: "天南星科",
    careDifficulty: "新手友好",
    waterPreference: "medium",
    lightLevel: "medium",
    indoor: true,
    heating: false,
    soilMoistureHint: "dry",
    waterAmountMl: 260,
    fertilizerType: "通用观叶液肥",
    careTips: "保持明亮散射光，表土发白后浇透。",
  },
  {
    id: "p2",
    nickname: "窗边龟背竹",
    speciesLabel: "龟背竹",
    taxonFamily: "天南星科",
    careDifficulty: "中等",
    waterPreference: "high",
    lightLevel: "medium",
    indoor: true,
    heating: true,
    soilMoistureHint: "moderate",
    waterAmountMl: 420,
    fertilizerType: "缓释肥",
    careTips: "叶面定期擦拭，避免空调直吹。",
  },
];

let tasks = [
  {
    id: "t1",
    plantId: "p1",
    type: "water",
    status: "pending",
    dueDate: `${isoDay}T09:00:00.000Z`,
    plant: plants[0],
  },
  {
    id: "t2",
    plantId: "p2",
    type: "fertilize",
    status: "pending",
    dueDate: `${isoDay}T18:30:00.000Z`,
    plant: plants[1],
  },
];

const soilRecords = [
  {
    id: "s1",
    plantId: "p1",
    createdAt: `${isoDay}T08:12:00.000Z`,
    soilMoistureHint: "dry",
    soilFertilityHint: "adequate",
    wateringTip: "表层偏干，今日浇透后保持通风。",
  },
  {
    id: "s2",
    plantId: "p2",
    createdAt: `${isoDay}T07:45:00.000Z`,
    soilMoistureHint: "moderate",
    soilFertilityHint: "rich",
    wateringTip: "肥力充足，短期无需追肥。",
  },
];

const devices = [
  {
    id: "d1",
    hardwareId: "GA-SOIL-001",
    label: "客厅土壤棒",
    plantId: "p1",
    lastSeenAt: `${isoDay}T08:40:00.000Z`,
  },
  {
    id: "d2",
    hardwareId: "GA-SOIL-002",
    label: "备用传感器",
    plantId: null,
    lastSeenAt: "",
  },
];

const symptoms = [
  { id: "yellow_leaf", group: "叶片", label: "黄叶", weight: 2 },
  { id: "brown_tip", group: "叶片", label: "焦尖", weight: 2 },
  { id: "wilting", group: "姿态", label: "萎蔫下垂", weight: 3 },
  { id: "mold_soil", group: "盆土", label: "盆土发霉", weight: 3 },
  { id: "pests", group: "虫害", label: "叶背有虫点", weight: 4 },
];

function delay(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), 160));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseQuery(path) {
  const [, qs = ""] = path.split("?");
  return new URLSearchParams(qs);
}

function forecastDays() {
  return [0, 1, 2].map((offset) => {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    return {
      date: d.toISOString().slice(0, 10),
      tempMinC: 17 + offset,
      tempMaxC: 24 + offset,
      weatherCode: offset === 1 ? 61 : 2,
      precipitationProbabilityMax: offset === 1 ? 65 : 20,
      precipitationSumMm: offset === 1 ? 4.2 : 0.3,
    };
  });
}

function diagnoseResult(symptomIds) {
  const selected = symptoms.filter((s) => symptomIds.includes(s.id));
  return {
    summary: selected.length
      ? "疑似浇水节奏与通风共同影响，建议先做 3 天观察。"
      : "请选择症状后再分析。",
    severity: selected.some((s) => s.weight >= 4) ? "high" : "medium",
    matchedSymptoms: selected,
    suggestions: [
      "检查盆底是否积水，必要时垫高盆底。",
      "把植物移到明亮散射光处，避免正午暴晒。",
      "暂停施肥 7 天，等新叶状态稳定后再恢复。",
    ],
    articles: articles.slice(0, 2),
  };
}

export async function request({ path, method = "GET", data = {} }) {
  if (path === "/auth/wechat" && method === "POST") {
    return delay({ token: "mock-jwt-token" });
  }
  if (path === "/tasks/today") {
    return delay(clone(tasks.filter((t) => t.status === "pending")));
  }
  const completeMatch = path.match(/^\/tasks\/([^/]+)\/complete$/);
  if (completeMatch && method === "POST") {
    tasks = tasks.map((t) =>
      t.id === completeMatch[1] ? { ...t, status: "completed" } : t
    );
    return delay({ ok: true });
  }
  const skipMatch = path.match(/^\/tasks\/([^/]+)\/skip$/);
  if (skipMatch && method === "POST") {
    tasks = tasks.map((t) =>
      t.id === skipMatch[1] ? { ...t, status: "skipped" } : t
    );
    return delay({ ok: true });
  }
  if (path === "/plants" && method === "GET") {
    return delay(clone(plants));
  }
  if (path === "/plants" && method === "POST") {
    const plant = { id: `p${Date.now()}`, ...data };
    plants = [plant, ...plants];
    return delay(clone(plant));
  }
  const plantMatch = path.match(/^\/plants\/([^/?]+)$/);
  if (plantMatch && method === "GET") {
    return delay(clone(plants.find((p) => p.id === plantMatch[1])));
  }
  if (plantMatch && method === "PATCH") {
    plants = plants.map((p) => (p.id === plantMatch[1] ? { ...p, ...data } : p));
    return delay(clone(plants.find((p) => p.id === plantMatch[1])));
  }
  if (plantMatch && method === "DELETE") {
    plants = plants.filter((p) => p.id !== plantMatch[1]);
    tasks = tasks.filter((t) => t.plantId !== plantMatch[1]);
    return delay({ ok: true });
  }
  const plantTasksMatch = path.match(/^\/plants\/([^/]+)\/tasks$/);
  if (plantTasksMatch) {
    return delay(clone(tasks.filter((t) => t.plantId === plantTasksMatch[1])));
  }
  const soilMatch = path.match(/^\/plants\/([^/]+)\/soil-records$/);
  if (soilMatch) {
    return delay(clone(soilRecords.filter((r) => r.plantId === soilMatch[1])));
  }
  const seriesMatch = path.match(/^\/plants\/([^/]+)\/sensor\/series/);
  if (seriesMatch) {
    const readings = Array.from({ length: 36 }, (_, i) => ({
      measuredAt: new Date(Date.now() - (35 - i) * 2 * 3600 * 1000).toISOString(),
      tempC: 22 + Math.sin(i / 4) * 2,
      soilMoisture: 42 + Math.sin(i / 5) * 12,
      phLevel: 6.2 + Math.sin(i / 6) * 0.25,
      lux: 5000 + Math.max(0, Math.sin(i / 4)) * 9000,
    }));
    return delay({
      windowHours: 72,
      latest: readings[readings.length - 1],
      readings,
      phEvaluation: {
        status: "optimal",
        preferredMin: 5.8,
        preferredMax: 7.0,
        usedDefaultRange: false,
      },
    });
  }
  if (path.endsWith("/plan/regenerate") && method === "POST") {
    return delay({ ok: true });
  }
  if (path === "/users/me" && method === "GET") {
    return delay(clone(user));
  }
  if (path === "/users/me" && method === "PATCH") {
    if (data.clearLocation) {
      user = { ...user, latitude: null, longitude: null, locationLabel: "" };
    } else {
      user = { ...user, ...data };
      if (data.latitude != null && data.longitude != null) {
        user.locationLabel = "当前位置已保存";
      }
    }
    return delay(clone(user));
  }
  if (path === "/weather/current") {
    return delay({
      temperatureC: 23,
      relativeHumidity: 58,
      upcomingWetBias: 0.12,
      upcomingDryBias: 0.22,
    });
  }
  if (path === "/weather/forecast") {
    return delay({ days: forecastDays() });
  }
  if (path.startsWith("/timezone/detect")) {
    return delay({ timezone: "Asia/Shanghai" });
  }
  if (path === "/knowledge/articles") {
    return delay(clone(articles));
  }
  const articleMatch = path.match(/^\/knowledge\/articles\/([^/?]+)$/);
  if (articleMatch) {
    return delay(clone(articles.find((a) => a.id === decodeURIComponent(articleMatch[1]))));
  }
  if (path.startsWith("/knowledge/search")) {
    const q = parseQuery(path).get("q")?.toLowerCase() || "";
    const hits = articles
      .filter((a) => `${a.title} ${a.summary} ${a.body}`.toLowerCase().includes(q))
      .map((a, i) => ({ slug: a.id, title: a.title, snippet: a.summary, score: 1 - i * 0.1 }));
    return delay({ buckets: { articles: hits } });
  }
  if (path === "/plants/identify" && method === "POST") {
    return delay({
      best: {
        name: "绿萝（Epipremnum）",
        confidence: 92,
        taxonFamily: "天南星科",
        careDifficulty: "新手友好",
        careSummary: "耐阴但喜明亮散射光，盆土见干见湿。",
        baikeDescription: "常见室内观叶植物，适合新手。",
      },
      relatedArticles: [{ slug: "epipremnum", title: "绿萝（Epipremnum）" }],
    });
  }
  if (path === "/diagnose/catalog") {
    return delay({ symptoms, llmDiagnoseEnabled: true });
  }
  if (path === "/diagnose" && method === "POST") {
    return delay(diagnoseResult(data.symptomIds || []));
  }
  if (path === "/soil/estimate-photo" && method === "POST") {
    return delay({
      soilMoistureHint: "dry",
      soilFertilityHint: "adequate",
      confidence: 0.82,
      rationale: "表层颜色偏浅且颗粒间缝隙明显。",
      wateringTip: "建议少量多次补水，避免一次性积水。",
    });
  }
  if (path === "/devices" && method === "GET") {
    return delay(clone(devices));
  }
  const deviceMatch = path.match(/^\/devices\/([^/]+)$/);
  if (deviceMatch && method === "PATCH") {
    const d = devices.find((x) => x.id === deviceMatch[1]);
    if (d) d.plantId = data.plantId || null;
    return delay(clone(d));
  }
  return delay({ ok: true, path, method });
}
