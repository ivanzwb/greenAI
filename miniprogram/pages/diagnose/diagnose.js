const { request } = require("../../utils/api.js");

function groupSymptoms(list) {
  const m = new Map();
  for (const s of list) {
    const g = s.group || "其它";
    if (!m.has(g)) m.set(g, []);
    m.get(g).push({ ...s, checked: false });
  }
  return [...m.entries()].map(([group, items]) => ({ group, items }));
}

function applySelected(symptomGroups, selectedIds) {
  const set = new Set(selectedIds);
  return symptomGroups.map((g) => ({
    group: g.group,
    items: g.items.map((it) => ({
      ...it,
      checked: set.has(it.id),
    })),
  }));
}

const MOISTURE_MAP = {
  very_wet: "很湿",
  wet: "偏湿",
  moderate: "适中",
  dry: "偏干",
  very_dry: "很干",
};

const FERTILITY_MAP = {
  unknown: "未知",
  depleted: "贫瘠",
  adequate: "适中",
  rich: "肥沃",
};

Page({
  data: {
    symptomGroups: [],
    plantLabels: ["不关联植物"],
    plantIds: [""],
    plantPickerIndex: 0,
    selectedIds: [],
    submitDisabled: true,
    result: null,
    llmDiagnoseEnabled: false,
    llmImageBase64: "",
    llmImageLabel: "",
    /** @type {{ moistureKey:string, moistureLabel:string, fertilityLabel:string, rationale:string, wateringTip?:string, confidence?:number } | null} */
    soilResult: null,
  },
  async onLoad(options) {
    await Promise.all([this.loadCatalog(), this.loadPlants()]);
    // 如果从 identify 页的「土壤诊断」跳过来，滚动到土壤面板
    if (options && options.mode === "soil") {
      wx.nextTick(() => {
        wx.createSelectorQuery()
          .select("#soil-panel")
          .boundingClientRect((rect) => {
            if (rect) wx.pageScrollTo({ scrollTop: rect.top - 20, duration: 300 });
          })
          .exec();
      });
    }
  },
  onOpenKnowledgeArticle(e) {
    const slug = e.currentTarget.dataset.slug;
    if (!slug) return;
    wx.navigateTo({
      url: `/pages/discover-detail/discover-detail?id=${encodeURIComponent(slug)}`,
    });
  },
  async loadCatalog() {
    try {
      const data = await request({ path: "/diagnose/catalog", method: "GET" });
      const list = (data && data.symptoms) || [];
      const llmDiagnoseEnabled = Boolean(data && data.llmDiagnoseEnabled);
      const symptomGroups = groupSymptoms(list);
      this.setData({ symptomGroups, llmDiagnoseEnabled });
    } catch (e) {
      wx.showToast({ title: "加载症状失败", icon: "none" });
    }
  },
  async loadPlants() {
    try {
      const raw = await request({ path: "/plants", method: "GET" });
      const plants = Array.isArray(raw) ? raw : [];
      const plantLabels = ["不关联植物"].concat(
        plants.map((p) => p.nickname || p.speciesLabel || "植物")
      );
      const plantIds = [""].concat(plants.map((p) => p.id));
      this.setData({ plantLabels, plantIds });
    } catch (_) {
      /* optional */
    }
  },
  onPlantPickerChange(e) {
    this.setData({ plantPickerIndex: Number(e.detail.value) });
  },
  onSymptomChange(e) {
    const selectedIds = e.detail.value || [];
    const symptomGroups = applySelected(this.data.symptomGroups, selectedIds);
    this.setData({
      selectedIds,
      symptomGroups,
      submitDisabled: selectedIds.length === 0,
    });
  },
  onUserNoteInput(e) {
    this.setData({ userNote: e.detail.value });
  },
  onPickImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (pick) => {
        const path = pick.tempFiles[0].tempFilePath;
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: path,
          encoding: "base64",
          success: (fileRes) => {
            this.setData({
              llmImageBase64: fileRes.data,
              llmImageLabel: "已选择照片，可提交 AI 分析",
            });
          },
          fail: () => {
            wx.showToast({ title: "读取图片失败", icon: "none" });
          },
        });
      },
      fail: () => {
        wx.showToast({ title: "未选择图片", icon: "none" });
      },
    });
  },
  async onSubmitLlm() {
    const { llmImageBase64 } = this.data;
    if (!llmImageBase64 || String(llmImageBase64).length < 80) {
      wx.showToast({ title: "请先选择清晰盆土照片", icon: "none" });
      return;
    }
    wx.showLoading({ title: "AI 分析中", mask: true });
    try {
      const result = await request({
        path: "/soil/estimate-photo",
        method: "POST",
        data: { imageBase64: llmImageBase64 },
      });
      const moistureKey = result?.soilMoistureHint || "moderate";
      this.setData({
        soilResult: {
          moistureKey,
          moistureLabel: MOISTURE_MAP[moistureKey] || moistureKey,
          fertilityLabel: FERTILITY_MAP[result?.soilFertilityHint] || result?.soilFertilityHint || "未知",
          rationale: result?.rationale || "",
          wateringTip: result?.wateringTip || "",
          confidence: result?.confidence ? Math.round(result.confidence * 100) : 0,
        },
      });
    } catch (e) {
      const code = e && e.statusCode;
      const msg =
        code === 503 ? "未启用 AI 诊断" : code === 502 ? "AI 服务异常" : "AI 请求失败";
      wx.showToast({ title: msg, icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },
  async onSubmit() {
    const { selectedIds, plantIds, plantPickerIndex } = this.data;
    if (!selectedIds.length) {
      wx.showToast({ title: "请至少选一项症状", icon: "none" });
      return;
    }
    const plantId = plantIds[plantPickerIndex] || undefined;
    const body = { symptomIds: selectedIds };
    if (plantId) body.plantId = plantId;
    wx.showLoading({ title: "分析中", mask: true });
    try {
      const result = await request({
        path: "/diagnose",
        method: "POST",
        data: body,
      });
      this.setData({ result });
    } catch (e) {
      wx.showToast({ title: "请求失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },
});
