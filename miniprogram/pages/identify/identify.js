const { request } = require("../../utils/api.js");

Page({
  data: {
    identifyResult: null,
  },

  /** 拍照识花 */
  onIdentify() {
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
              this.setData({
                identifyResult: {
                  speciesLabel: best.name,
                  confidence: best.confidence || "",
                  desc:
                    best.baikeDescription ||
                    best.careSummary ||
                    "已识别到品种",
                },
              });
              wx.showToast({ title: "识别成功", icon: "success" });
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

  /** 土壤诊断（和症状诊断一样，导航到诊断页的土壤 tab） */
  onDiagnosePhoto() {
    wx.navigateTo({ url: "/pages/diagnose/diagnose?mode=soil" });
  },

  /** 症状诊断 */
  onDiagnoseSymptom() {
    wx.navigateTo({ url: "/pages/diagnose/diagnose" });
  },
});
