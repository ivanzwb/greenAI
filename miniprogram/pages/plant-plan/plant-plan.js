const { request } = require("../../utils/api.js");

const SOIL_HINT_LABELS = {
  very_wet: "很湿",
  wet: "偏湿",
  moderate: "适中",
  dry: "偏干",
  very_dry: "很干",
};

const FERTILITY_LABELS = {
  unknown: "肥力未判",
  depleted: "偏瘦",
  adequate: "肥力适中",
  rich: "偏肥",
};

function formatSoilWhen(iso) {
  if (!iso) return "";
  const s = String(iso);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  return s.slice(0, 16);
}

function formatSoilRecordLine(r) {
  if (!r) return "";
  const when = formatSoilWhen(r.createdAt);
  const mh = SOIL_HINT_LABELS[r.soilMoistureHint] || r.soilMoistureHint || "";
  const fh =
    r.soilFertilityHint && r.soilFertilityHint !== "unknown"
      ? FERTILITY_LABELS[r.soilFertilityHint] || r.soilFertilityHint
      : "";
  const parts = [when, mh].filter(Boolean);
  if (fh) parts.push(fh);
  return parts.join(" · ");
}

function typeLabel(t) {
  if (t === "water") return "浇水";
  if (t === "fertilize") return "施肥";
  if (t === "repot") return "换盆";
  if (t === "inspect") return "例行检查";
  return String(t || "");
}

function statusLabel(s) {
  if (s === "pending") return "待办";
  if (s === "completed") return "已完成";
  if (s === "skipped") return "已跳过";
  return String(s || "");
}

Page({
  data: {
    plantId: "",
    tasks: [],
    loadError: "",
    soilPlantTitle: "",
    soilCardLines: [],
    soilCardHint: "",
  },
  onLoad(options) {
    const id = options && options.id ? String(options.id) : "";
    if (!id) {
      this.setData({ loadError: "缺少植物 id" });
      return;
    }
    this.setData({ plantId: id });
    void Promise.all([this.loadTasks(id), this.loadSoilSummary(id)]);
  },
  async loadTasks(plantId) {
    try {
      const raw = await request({
        path: `/plants/${plantId}/tasks`,
        method: "GET",
      });
      const list = Array.isArray(raw) ? raw : [];
      const tasks = list.map((t) => ({
        ...t,
        displayType: typeLabel(t.type),
        displayStatus: statusLabel(t.status),
        displayDue: t.dueDate
          ? String(t.dueDate).slice(0, 16).replace("T", " ")
          : "",
      }));
      this.setData({ tasks, loadError: "" });
    } catch (e) {
      this.setData({ tasks: [], loadError: "加载失败" });
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },
  async loadSoilSummary(plantId) {
    if (!plantId) {
      this.setData({
        soilPlantTitle: "",
        soilCardLines: [],
        soilCardHint: "",
      });
      return;
    }
    let plant = null;
    let list = [];
    try {
      plant = await request({
        path: `/plants/${plantId}`,
        method: "GET",
      });
    } catch (_) {
      /* 摘要仍可仅依赖 soil-records */
    }
    try {
      const records = await request({
        path: `/plants/${plantId}/soil-records`,
        method: "GET",
      });
      list = Array.isArray(records) ? records : [];
    } catch (_) {
      list = [];
    }
    const nick = plant && plant.nickname ? String(plant.nickname).trim() : "";
    const spec =
      plant && plant.speciesLabel ? String(plant.speciesLabel).trim() : "";
    const soilPlantTitle =
      nick && spec ? `${nick} · ${spec}` : nick || spec || "";
    const lines = list.slice(0, 3).map((r) => ({
      id: r.id,
      text: formatSoilRecordLine(r),
    }));
    let soilCardHint = "";
    if (lines.length === 0 && plant && plant.soilMoistureHint) {
      const selfLabel =
        SOIL_HINT_LABELS[plant.soilMoistureHint] || plant.soilMoistureHint;
      soilCardHint = `档案自评盆土：${selfLabel}（尚无拍照记录）`;
    } else if (lines.length === 0) {
      soilCardHint =
        "暂无盆土拍照记录；到「编辑植物」可拍照估算盆土。";
    }
    this.setData({
      soilPlantTitle,
      soilCardLines: lines,
      soilCardHint,
    });
  },
  onRefresh() {
    const id = this.data.plantId;
    if (!id) return;
    void Promise.all([this.loadTasks(id), this.loadSoilSummary(id)]);
  },
});
