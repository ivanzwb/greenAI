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
        title: "填写家庭 Wi-Fi 与云端信息",
        desc: "输入家中 2.4G Wi-Fi 名称与密码；API 根地址填后端地址（如 https://你的域名，无路径）；粘贴绑定码；可选植物 ID、手动上报密钥。",
      },
      {
        n: 4,
        title: "保存并等待设备联网",
        desc: "设备连上路由器后会自动调用云端 claim 接口写入你的 userId，并开始 HMAC 上报读数；在「植物 → 传感器与图表」中绑定到具体植物。",
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
