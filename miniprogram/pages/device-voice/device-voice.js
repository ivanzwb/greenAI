/**
 * 设备拟人化语音文案设置
 * 进入方式：
 *   1) 从「设置」页 → 设备文案 入口（无参，进入后用户选设备）
 *   2) 其他页面带 ?deviceId=xxx 直达
 *
 * 数据流：
 *   GET  /devices             拉取当前用户所有设备
 *   PATCH /devices/:id { wateringMessage: "…" | null }   保存 / 清空文案
 *
 * 固件端通过 POST /internal/devices/config (HMAC) 拉取此字段并写入 NVS。
 */
const { request } = require("../../utils/api.js");

/**
 * 浇水文案库（与 README 中的设计同步）。
 * 修改这里的 phrases 即可上线新文案，不需要发版后端。
 */
const CATEGORIES = [
  {
    key: "energetic",
    name: "元气满满版",
    desc: "适合多肉、向日葵等阳光型植物",
    phrases: [
      "吨吨吨……嗝！喝饱啦，感觉又能长高一厘米！",
      "哇！是生命之水！我要开始光合作用暴走模式了！",
      "谢谢主人！今天的我比昨天更绿了10%！",
      "水珠在叶子上打滚，像在坐滑梯，好痒呀～嘻嘻！",
    ],
  },
  {
    key: "tsundere",
    name: "傲娇毒舌版",
    desc: "适合仙人掌、龟背竹等有个性的植物",
    phrases: [
      "哼，勉强接受你的投喂吧，下次记得别浇太多，我可不是水桶！",
      "水？哦，还行吧，不过我更想要阳光SPA。",
      "别以为浇点水就能收买我，我可是很挑剔的！",
      "终于想起来我了？再晚点我都要变成植物干了！",
    ],
  },
  {
    key: "gentle",
    name: "温柔治愈版",
    desc: "适合绿萝、吊兰等垂吊植物",
    phrases: [
      "水珠顺着叶子滑下来，像在给根部做按摩，好舒服呀～",
      "谢谢你记得我，每一滴水都带着你的温度呢。",
      "喝饱水的叶子变得更透亮啦，你看，我在对你笑呢！",
      "根须在土壤里悄悄伸展，好像在说\"谢谢你，我会努力长好的\"。",
    ],
  },
  {
    key: "funny",
    name: "沙雕搞笑版",
    desc: "适合所有戏精植物",
    phrases: [
      "紧急呼叫！根系已启动吸水程序，预计3秒后满血复活！",
      "水！我的快乐源泉！感觉整株植物都活过来了！",
      "别看我蔫蔫的，其实我在偷偷存水，准备长成水桶精！",
      "浇水=充电，现在电量100%，准备开启疯狂长叶模式！",
    ],
  },
  {
    key: "poetic",
    name: "文艺诗意版",
    desc: "适合兰花、文竹等雅致植物",
    phrases: [
      "水珠落在叶尖，像清晨的露珠吻醒了沉睡的梦。",
      "每一滴水都是天空的礼物，我在土壤里悄悄酿成生长的诗。",
      "湿润的根须在黑暗中低语：谢谢你，让我与大地更亲近。",
      "水光在叶脉间流转，仿佛把整个春天都装进了身体里。",
    ],
  },
];

const DEFAULT_MESSAGE = "谢谢你记得我，每一滴水都带着你的温度呢。";
const MAX_LEN = 200;

function deviceLabel(d) {
  if (!d) return "";
  if (d.label && d.label.trim().length > 0) return d.label.trim();
  const hid = String(d.hardwareId || "");
  return hid.length > 10 ? `设备 ${hid.slice(-6)}` : `设备 ${hid}`;
}

Page({
  data: {
    categories: CATEGORIES,
    deviceLabels: [],
    devices: [],
    deviceIndex: 0,
    selectedDeviceId: "",
    currentMessage: "",       // 当前已保存在云端的文案（NULL 时显示默认）
    isDefault: true,          // 当前文案是否走"固件内置默认"
    draft: "",                // 编辑框里的内容
    customExpanded: false,
    saving: false,
    defaultMessage: DEFAULT_MESSAGE,
    maxLen: MAX_LEN,
  },

  onLoad(query) {
    const preset = (query && query.deviceId) || "";
    this._preselect = preset;
    this.loadDevices();
  },

  async loadDevices() {
    try {
      const list = await request({ path: "/devices", method: "GET" });
      const devices = Array.isArray(list) ? list : [];
      if (devices.length === 0) {
        wx.showModal({
          title: "暂无设备",
          content: "请先完成设备配网（设置 → 传感器绑定码）。",
          showCancel: false,
        });
        this.setData({ devices: [], deviceLabels: [] });
        return;
      }
      const labels = devices.map(deviceLabel);
      let idx = 0;
      if (this._preselect) {
        const i = devices.findIndex((d) => d.id === this._preselect);
        if (i >= 0) idx = i;
      }
      this.setData({
        devices,
        deviceLabels: labels,
        deviceIndex: idx,
      });
      this.applyDevice(idx);
    } catch (e) {
      wx.showToast({ title: "加载设备失败", icon: "none" });
    }
  },

  applyDevice(idx) {
    const d = this.data.devices[idx];
    if (!d) return;
    const msg = d.wateringMessage || "";
    this.setData({
      selectedDeviceId: d.id,
      currentMessage: msg,
      isDefault: msg.length === 0,
      draft: msg || DEFAULT_MESSAGE,
      customExpanded: false,
    });
  },

  onDeviceChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ deviceIndex: idx });
    this.applyDevice(idx);
  },

  onPickPhrase(e) {
    const phrase = e.currentTarget.dataset.phrase;
    if (typeof phrase !== "string" || phrase.length === 0) return;
    this.setData({ draft: phrase, customExpanded: false });
  },

  onToggleCustom() {
    this.setData({ customExpanded: !this.data.customExpanded });
  },

  onDraftInput(e) {
    this.setData({ draft: String(e.detail.value || "").slice(0, MAX_LEN) });
  },

  onResetDefault() {
    wx.showModal({
      title: "恢复默认",
      content: `恢复后设备将朗读：\n"${DEFAULT_MESSAGE}"`,
      success: async (r) => {
        if (!r.confirm) return;
        await this.saveMessage(null);
      },
    });
  },

  async onSave() {
    const draft = String(this.data.draft || "").trim();
    if (draft.length === 0) {
      wx.showToast({ title: "请先选一句或输入文案", icon: "none" });
      return;
    }
    if (draft.length > MAX_LEN) {
      wx.showToast({ title: `最多 ${MAX_LEN} 字`, icon: "none" });
      return;
    }
    await this.saveMessage(draft);
  },

  async saveMessage(value) {
    const id = this.data.selectedDeviceId;
    if (!id) {
      wx.showToast({ title: "未选择设备", icon: "none" });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const updated = await request({
        path: `/devices/${id}`,
        method: "PATCH",
        data: { wateringMessage: value },
      });
      // 同步本地 devices 缓存
      const devices = this.data.devices.slice();
      const idx = devices.findIndex((d) => d.id === id);
      if (idx >= 0) {
        devices[idx] = {
          ...devices[idx],
          wateringMessage: updated && "wateringMessage" in updated ? updated.wateringMessage : value,
        };
      }
      const newMsg = value || "";
      this.setData({
        devices,
        currentMessage: newMsg,
        isDefault: newMsg.length === 0,
        draft: newMsg || DEFAULT_MESSAGE,
      });
      wx.showToast({
        title: value === null ? "已恢复默认" : "已保存",
        icon: "success",
      });
    } catch (e) {
      wx.showToast({ title: "保存失败", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
