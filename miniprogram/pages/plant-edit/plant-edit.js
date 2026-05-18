const {
  request,
  SUBSCRIBE_TEMPLATE_ID,
  reportSubscribeFromWxResult,
} = require("../../utils/api.js");

const WATER_RANGE = ["low", "medium", "high"];
const WATER_LABELS = ["低", "中", "高"];
const LIGHT_RANGE = ["low", "medium", "high"];
const LIGHT_LABELS = ["弱", "中", "强"];

function prefIndex(range, value) {
  const i = range.indexOf(value);
  return i >= 0 ? i : 1;
}

Page({
  data: {
    plantId: "",
    submitLabel: "保存植物",
    nickname: "",
    speciesLabel: "",
    waterIndex: 1,
    waterLabels: WATER_LABELS,
    indoor: true,
    heating: false,
    lightIndex: 1,
    lightLabels: LIGHT_LABELS,
  },
  onLoad(options) {
    if (options.id) {
      this.setData({ plantId: options.id, submitLabel: "保存修改" });
      this.loadPlant(options.id);
    } else {
      wx.setNavigationBarTitle({ title: "添加植物" });
    }
  },
  async loadPlant(id) {
    try {
      const p = await request({ path: `/plants/${id}`, method: "GET" });
      this.setData({
        nickname: p.nickname || "",
        speciesLabel: p.speciesLabel || "",
        waterIndex: prefIndex(WATER_RANGE, p.waterPreference),
        indoor: Boolean(p.indoor),
        heating: Boolean(p.heating),
        lightIndex: prefIndex(LIGHT_RANGE, p.lightLevel),
      });
      wx.setNavigationBarTitle({ title: "编辑植物" });
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },
  onSpeciesInput(e) {
    this.setData({ speciesLabel: e.detail.value });
  },
  onWaterChange(e) {
    this.setData({ waterIndex: Number(e.detail.value) });
  },
  onIndoorChange(e) {
    this.setData({ indoor: e.detail.value });
  },
  onHeatingChange(e) {
    this.setData({ heating: e.detail.value });
  },
  onLightChange(e) {
    this.setData({ lightIndex: Number(e.detail.value) });
  },
  onIdentifyPlant() {
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
          success: async (fileRes) => {
            wx.showLoading({ title: "识别中", mask: true });
            try {
              const data = await request({
                path: "/plants/identify",
                method: "POST",
                data: { imageBase64: fileRes.data },
              });
              const best = data && data.best;
              if (!best || !best.name) {
                wx.showToast({ title: "未识别到植物", icon: "none" });
                return;
              }
              const nick = (this.data.nickname || "").trim();
              this.setData({
                speciesLabel: best.name,
                nickname: nick || best.name,
              });
              wx.showToast({ title: "已填入品种", icon: "success" });
            } catch (e) {
              const code = e && e.statusCode;
              if (code === 503) {
                wx.showToast({ title: "服务端未配置识别", icon: "none" });
              } else if (code === 422) {
                wx.showToast({ title: "未识别到植物", icon: "none" });
              } else {
                wx.showToast({ title: "识别失败", icon: "none" });
              }
            } finally {
              wx.hideLoading();
            }
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
  async onSubmit() {
    const {
      plantId,
      nickname,
      speciesLabel,
      waterIndex,
      indoor,
      heating,
      lightIndex,
    } = this.data;
    if (!nickname.trim() || !speciesLabel.trim()) {
      wx.showToast({ title: "请填写昵称和品种", icon: "none" });
      return;
    }
    const waterPreference = WATER_RANGE[waterIndex];
    const lightLevel = LIGHT_RANGE[lightIndex];
    const body = {
      nickname: nickname.trim(),
      speciesLabel: speciesLabel.trim(),
      waterPreference,
      indoor,
      heating,
      lightLevel,
    };
    try {
      if (plantId) {
        await request({
          path: `/plants/${plantId}`,
          method: "PATCH",
          data: body,
        });
        await request({
          path: `/plants/${plantId}/plan/regenerate`,
          method: "POST",
        });
      } else {
        await request({
          path: "/plants",
          method: "POST",
          data: body,
        });
      }
      wx.showToast({ title: "已保存", icon: "success" });
      wx.requestSubscribeMessage({
        tmplIds: [SUBSCRIBE_TEMPLATE_ID],
        success: async (res) => {
          try {
            await reportSubscribeFromWxResult(res);
          } catch (_) {
            /* quota sync is best-effort */
          }
        },
        complete: () => wx.navigateBack(),
      });
    } catch (e) {
      wx.showToast({ title: "保存失败", icon: "none" });
    }
  },
});
