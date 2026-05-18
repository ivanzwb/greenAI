const { request } = require("./api.js");

/** Tab index of `pages/index/index` in `app.json` → `tabBar.list` (must stay in sync). */
const TODAY_TAB_INDEX = 0;

function setTodayTabBadgeFromCount(n) {
  if (n > 0) wx.showTabBarRedDot({ index: TODAY_TAB_INDEX });
  else wx.hideTabBarRedDot({ index: TODAY_TAB_INDEX });
}

/**
 * Syncs the red dot on the 「今日」 tab from pending tasks for the user's local today.
 * Safe to call from any tab page `onShow`; failures are ignored.
 */
function refreshTodayTabBadge() {
  return request({ path: "/tasks/today", method: "GET" })
    .then((raw) => {
      const n = Array.isArray(raw) ? raw.length : 0;
      setTodayTabBadgeFromCount(n);
    })
    .catch(() => {
      /* offline / 401 — leave badge unchanged */
    });
}

module.exports = {
  refreshTodayTabBadge,
  setTodayTabBadgeFromCount,
  TODAY_TAB_INDEX,
};
