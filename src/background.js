'use strict';

const STORAGE_KEYS = {
  SETTINGS: 'exboQrSettings',
  COUNTER: 'exboQrCounter',
  DAILY: 'exboQrDailyCounter',
  STATS: 'exboQrReactionStats',
  CATALOG: 'exboQrCatalog'
};

const DEFAULT_SETTINGS = {
  enabled: true,
  reactionId: '89',
  favoriteReactionIds: ['89', '35', '33', '34'],
  activationMode: 'both',
  showCounter: true,
  hotkey: '',
  showQuickReplyButton: true,
  quickReplyText: '@"kravv285"#1459207 дроноеб'
};

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readDaily(raw) {
  const today = getTodayKey();
  if (!raw || typeof raw !== 'object' || raw.date !== today) {
    return { date: today, count: 0 };
  }
  return {
    date: today,
    count: typeof raw.count === 'number' && Number.isFinite(raw.count) && raw.count >= 0 ? Math.floor(raw.count) : 0
  };
}

let counterChain = Promise.resolve();

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.COUNTER,
    STORAGE_KEYS.DAILY,
    STORAGE_KEYS.STATS
  ]);

  const toSet = {
    [STORAGE_KEYS.SETTINGS]: Object.assign({}, DEFAULT_SETTINGS, existing[STORAGE_KEYS.SETTINGS] || {})
  };
  if (typeof existing[STORAGE_KEYS.COUNTER] !== 'number' || !Number.isFinite(existing[STORAGE_KEYS.COUNTER])) {
    toSet[STORAGE_KEYS.COUNTER] = 0;
  }
  toSet[STORAGE_KEYS.DAILY] = readDaily(existing[STORAGE_KEYS.DAILY]);
  if (!existing[STORAGE_KEYS.STATS] || typeof existing[STORAGE_KEYS.STATS] !== 'object') {
    toSet[STORAGE_KEYS.STATS] = {};
  }
  await chrome.storage.local.set(toSet);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  if (message.type === 'EXBO_QR_INCREMENT_COUNTER') {
    const reactionId = message.reactionId != null ? String(message.reactionId) : null;
    counterChain = counterChain.then(async () => {
      const data = await chrome.storage.local.get([STORAGE_KEYS.COUNTER, STORAGE_KEYS.DAILY, STORAGE_KEYS.STATS]);
      const current = typeof data[STORAGE_KEYS.COUNTER] === 'number' && Number.isFinite(data[STORAGE_KEYS.COUNTER])
        ? data[STORAGE_KEYS.COUNTER]
        : 0;
      const next = current + 1;
      const daily = readDaily(data[STORAGE_KEYS.DAILY]);
      daily.count += 1;

      const stats = data[STORAGE_KEYS.STATS] && typeof data[STORAGE_KEYS.STATS] === 'object'
        ? Object.assign({}, data[STORAGE_KEYS.STATS])
        : {};
      if (reactionId) {
        const curStat = typeof stats[reactionId] === 'number' && Number.isFinite(stats[reactionId])
          ? stats[reactionId]
          : 0;
        stats[reactionId] = curStat + 1;
      }

      await chrome.storage.local.set({
        [STORAGE_KEYS.COUNTER]: next,
        [STORAGE_KEYS.DAILY]: daily,
        [STORAGE_KEYS.STATS]: stats
      });
      return { ok: true, count: next, daily, stats };
    }).catch((err) => ({
      ok: false,
      error: err && err.message ? err.message : 'Storage write error'
    }));

    counterChain.then(sendResponse);
    return true;
  }

  if (message.type === 'EXBO_QR_RESET_COUNTER') {
    counterChain = counterChain.then(async () => {
      const daily = { date: getTodayKey(), count: 0 };
      await chrome.storage.local.set({
        [STORAGE_KEYS.COUNTER]: 0,
        [STORAGE_KEYS.DAILY]: daily,
        [STORAGE_KEYS.STATS]: {}
      });
      return { ok: true, count: 0, daily, stats: {} };
    }).catch((err) => ({
      ok: false,
      error: err && err.message ? err.message : 'Storage reset error'
    }));

    counterChain.then(sendResponse);
    return true;
  }

  return false;
});
