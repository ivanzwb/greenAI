const { request } = require("../../utils/api.js");

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
  },
  onLoad(options) {
    const id = options && options.id ? String(options.id) : "";
    if (!id) {
      this.setData({ loadError: "缺少植物 id" });
      return;
    }
    this.setData({ plantId: id });
    this.loadTasks(id);
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
  onRefresh() {
    if (this.data.plantId) this.loadTasks(this.data.plantId);
  },
});
