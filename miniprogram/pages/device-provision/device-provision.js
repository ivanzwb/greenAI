Page({
  data: {
    steps: [
      {
        n: 1,
        title: "在小程序「设置」生成绑定码",
        desc: "打开 设置 → 传感器绑定码 →「生成新绑定码」，复制 16 位十六进制码（约 10 分钟内有效）。",
      },
      {
        n: 2,
        title: "设备进入 SoftAP 配网",
        desc: "通电后连接 Wi-Fi 热点「植物管家-配网」，浏览器打开 http://192.168.4.1",
      },
      {
        n: 3,
        title: "填写家庭 Wi-Fi 与绑定码",
        desc: "输入家中 2.4G Wi-Fi 名称与密码，粘贴绑定码。量产固件若已内置云端地址则无需填 API；自托管时在折叠区填写后端根地址（无路径）。",
      },
      {
        n: 4,
        title: "保存并等待设备联网",
        desc: "联网后固件自动调用 claim 完成登记并写入上报密钥；之后只凭硬件 ID 做 HMAC 上报，用户与植物归属在云端维护。请在「植物 → 传感器与图表」把设备绑到具体植物。",
      },
    ],
  },
  onGoSettings() {
    wx.navigateTo({ url: "/pages/settings/settings" });
  },
  onContact() {
    wx.showModal({
      title: "SoftAP + 绑定码闭环",
      content:
        "当前固件已支持：配网页填写绑定码 → 联网后自动与当前微信用户绑定。请先在本小程序「设置」页生成绑定码，再按上方步骤在设备配网页完成提交。",
      confirmText: "去设置",
      cancelText: "知道了",
      success: (r) => {
        if (r.confirm) wx.navigateTo({ url: "/pages/settings/settings" });
      },
    });
  },
});
