const BASE_URL = "http://127.0.0.1:3000";

/** Must match backend SUBSCRIBE_TEMPLATE_ID and the template in MP admin. */
const SUBSCRIBE_TEMPLATE_ID = "YOUR_TEMPLATE_ID";

function getToken() {
  return wx.getStorageSync("token") || "";
}

function request({ path, method = "GET", data }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + path,
      method,
      data,
      header: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getToken(),
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject({ statusCode: res.statusCode, data: res.data });
      },
      fail: reject,
    });
  });
}

function setToken(token) {
  wx.setStorageSync("token", token);
}

function getUserId() {
  return wx.getStorageSync("userId") || "";
}

function setUserId(id) {
  wx.setStorageSync("userId", id ? String(id) : "");
}

/**
 * Report subscribe dialog outcome to the API (call from wx.requestSubscribeMessage success).
 * @param {Record<string, string>} res
 */
function reportSubscribeFromWxResult(res) {
  const st = res[SUBSCRIBE_TEMPLATE_ID];
  const acceptCount = st === "accept" ? 1 : 0;
  return request({
    path: "/subscribe/report",
    method: "POST",
    data: { templateId: SUBSCRIBE_TEMPLATE_ID, acceptCount },
  });
}

module.exports = {
  BASE_URL,
  SUBSCRIBE_TEMPLATE_ID,
  request,
  setToken,
  getUserId,
  setUserId,
  reportSubscribeFromWxResult,
};
