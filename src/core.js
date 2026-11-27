(function (global) {
  'use strict';

  var EXTENSION_VERSION = '1.1.0';
  var DEFAULT_QUICK_REPLY_TEXT = '@"kravv285"#1459207 дроноеб';
  var DEFAULT_FAVORITE_IDS = ['89', '35', '33', '34'];
  var SNOWMAN_REACTION_ID = '89';
  var SNOWMAN_MISS_BONUS_PERCENT = 0.99;

  var CHANGELOG_RELEASES = [
    {
      version: '1.1.0',
      hasChanges: true,
      title: 'Обновление 1.1.0',
      highlights: [
        'Добавлена подсветка активного сообщения под курсором (можно отключить в настройках).',
        'Сохранение статистики реакций между обновлениями расширения.',
        'Добавлен экран обновлений при первой установке и при выходе новых версий.'
      ],
      mysteries: [
        'Попробуй ставить реакцию снеговика на чужие сообщения. Каждая попытка без события повышает шанс на +0,99%.',
        'Открой «Показать шансы», чтобы посмотреть текущий процент.'
      ]
    },
    {
      version: '1.0.0',
      hasChanges: true,
      title: 'Быстрый ответ, избранное и статистика',
      highlights: [
        'Добавлены избранные реакции прямо в действиях поста и топ использованных реакций в окне настроек.',
        'Появились настраиваемый хоткей, кнопка быстрого ответа и умное скрытие кнопок на своих и закрытых сообщениях.'
      ],
      mysteries: []
    }
  ];
  var SNOWMAN_BASE_PI_DECIMALS =
    '1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679' +
    '8214808651328230664709384460955058223172535940812848111745028410270193852110555964462294895493038196' +
    '4428810975665933446128475648233786783165271201909145648566923460348610454326648213393607260249141273' +
    '7245870066063155881748815209209628292540917153643678925903600113305305488204665213841469519415116094' +
    '3305727036575959195309218611738193261179310511854807446237996274956735188575272489122793818301194912' +
    '9833673362440656643086021394946395224737190702179860943702770539217176293176752384674818467669405132' +
    '0005681271452635608277857713427577896091736371787214684409012249534301465495853710507922796892589235' +
    '4201995611212902196086403441815981362977477130996051870721134999999837297804995105973173281609631859' +
    '5024459455346908302642522308253344685035261931188171010003137838752886587533208381420617177669147303' +
    '5982534904287554687311595628638823537875937519577818577805321712268066130019278766111959092164201989';

  var DEFAULT_SETTINGS = {
    enabled: true,
    reactionId: '89',
    favoriteReactionIds: DEFAULT_FAVORITE_IDS.slice(),
    activationMode: 'both', // 'button' | 'dblclick' | 'both'
    showCounter: true,
    highlightHoveredPost: true,
    hotkey: '',
    showQuickReplyButton: true,
    quickReplyText: DEFAULT_QUICK_REPLY_TEXT
  };

  var VALID_MODES = new Set(['button', 'dblclick', 'both']);

  var INTERACTIVE_SELECTOR = [
    'a',
    'button',
    'input',
    'textarea',
    'select',
    'option',
    'label',
    'summary',
    'details',
    'video',
    'audio',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[contenteditable="true"]',
    '[data-reaction]',
    '.Avatar',
    '.Reactions',
    '.CommentPost--Reactions',
    '.Reactions--react',
    '.Dropdown-menu',
    '.Post-actions',
    '.Post-header',
    '.Post-footer',
    '.Post-mentionedBy',
    '.Post-mentionedBy-preview',
    '.PostMention',
    '.UserMention',
    '.FoFUpload--Upl-Image-Preview',
    '.ReplyPlaceholder',
    '.exbo-qr-group',
    '.exbo-qr-btn',
    '.exbo-qr-fav-toggle',
    '.exbo-qr-fav-menu',
    '.exbo-qr-reply-btn',
    '.exbo-qr-status',
    '.exbo-qr-toast'
  ].join(', ');

  var MODIFIER_CODES = new Set([
    'ControlLeft', 'ControlRight',
    'ShiftLeft', 'ShiftRight',
    'AltLeft', 'AltRight',
    'MetaLeft', 'MetaRight'
  ]);

  var MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

  function normalizeHotkeyString(raw) {
    if (typeof raw !== 'string') {
      return '';
    }
    var parts = raw.trim().split('+').map(function (p) { return p.trim(); }).filter(Boolean);
    if (parts.length === 0) {
      return '';
    }
    var keyCode = parts[parts.length - 1];
    if (!keyCode || MODIFIER_CODES.has(keyCode) || MODIFIER_KEYS.has(keyCode)) {
      return '';
    }
    var mods = new Set(parts.slice(0, -1));
    var ordered = [];
    if (mods.has('Ctrl')) ordered.push('Ctrl');
    if (mods.has('Alt')) ordered.push('Alt');
    if (mods.has('Shift')) ordered.push('Shift');
    if (mods.has('Meta')) ordered.push('Meta');
    ordered.push(keyCode);
    return ordered.join('+');
  }

  function normalizeFavoriteIds(raw) {
    if (!Array.isArray(raw)) {
      return DEFAULT_FAVORITE_IDS.slice();
    }
    var seen = new Set();
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] == null) continue;
      var id = String(raw[i]).trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function normalizeSettings(raw) {
    var input = raw && typeof raw === 'object' ? raw : {};
    var enabled = typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SETTINGS.enabled;
    var reactionId = input.reactionId != null && String(input.reactionId).trim() !== ''
      ? String(input.reactionId).trim()
      : DEFAULT_SETTINGS.reactionId;
    var favoriteReactionIds = normalizeFavoriteIds(input.favoriteReactionIds);
    var activationMode = VALID_MODES.has(input.activationMode)
      ? input.activationMode
      : DEFAULT_SETTINGS.activationMode;
    var showCounter = typeof input.showCounter === 'boolean'
      ? input.showCounter
      : DEFAULT_SETTINGS.showCounter;
    var highlightHoveredPost = typeof input.highlightHoveredPost === 'boolean'
      ? input.highlightHoveredPost
      : DEFAULT_SETTINGS.highlightHoveredPost;
    var hotkey = normalizeHotkeyString(input.hotkey);
    var showQuickReplyButton = typeof input.showQuickReplyButton === 'boolean'
      ? input.showQuickReplyButton
      : DEFAULT_SETTINGS.showQuickReplyButton;
    var quickReplyText = typeof input.quickReplyText === 'string' && input.quickReplyText.trim() !== ''
      ? input.quickReplyText
      : DEFAULT_SETTINGS.quickReplyText;

    return {
      enabled: enabled,
      reactionId: reactionId,
      favoriteReactionIds: favoriteReactionIds,
      activationMode: activationMode,
      showCounter: showCounter,
      highlightHoveredPost: highlightHoveredPost,
      hotkey: hotkey,
      showQuickReplyButton: showQuickReplyButton,
      quickReplyText: quickReplyText
    };
  }

  function getLocalDateKey(date) {
    var d = date instanceof Date ? date : new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function normalizeDailyCounter(raw, dateKey) {
    var targetDate = typeof dateKey === 'string' && dateKey ? dateKey : getLocalDateKey();
    if (!raw || typeof raw !== 'object' || raw.date !== targetDate) {
      return { date: targetDate, count: 0 };
    }
    var count = typeof raw.count === 'number' && Number.isFinite(raw.count) && raw.count >= 0
      ? Math.floor(raw.count)
      : 0;
    return { date: targetDate, count: count };
  }

  function sortReactionsWithFavorites(catalogList, favoriteIds) {
    var list = Array.isArray(catalogList) ? catalogList : [];
    var favList = normalizeFavoriteIds(favoriteIds);
    if (favList.length === 0) {
      return list.slice();
    }
    var favSet = new Set(favList);
    var favItems = [];
    var restItems = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || item.id == null) continue;
      if (favSet.has(String(item.id))) {
        favItems.push(item);
      } else {
        restItems.push(item);
      }
    }
    return favItems.concat(restItems);
  }

  function extractPostDescriptor(node) {
    if (!node || typeof node.closest !== 'function') {
      return null;
    }

    var itemEl = node.classList && node.classList.contains('PostStream-item')
      ? node
      : node.closest('.PostStream-item');

    if (!itemEl || (itemEl.querySelector && itemEl.querySelector('.ReplyPlaceholder'))) {
      return null;
    }

    if (itemEl.getAttribute('data-type') !== 'comment') {
      return null;
    }

    var postId = itemEl.getAttribute('data-id');
    if (!postId || !/^\d+$/.test(postId)) {
      return null;
    }

    var postEl = itemEl.querySelector('.CommentPost.Post') || itemEl.querySelector('.Post');
    if (!postEl || (postEl.classList && postEl.classList.contains('ReplyPlaceholder'))) {
      return null;
    }

    return {
      postId: postId,
      itemEl: itemEl,
      postEl: postEl
    };
  }

  function isInteractiveTarget(target) {
    if (!target) {
      return true;
    }
    var el = target.nodeType === 3 ? target.parentElement : target;
    if (!el || typeof el.closest !== 'function') {
      return true;
    }
    return Boolean(el.closest(INTERACTIVE_SELECTOR));
  }

  function isDoubleClickOnPostContent(target) {
    if (!target) {
      return false;
    }
    var el = target.nodeType === 3 ? target.parentElement : target;
    if (!el || typeof el.closest !== 'function') {
      return false;
    }
    if (!el.closest('.Post-body') && !el.closest('.CommentPost.Post')) {
      return false;
    }
    return !isInteractiveTarget(el);
  }

  function isEditableElement(target) {
    if (!target) {
      return false;
    }
    var el = target.nodeType === 3 ? target.parentElement : target;
    if (!el) {
      return false;
    }
    var tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) {
      return true;
    }
    return Boolean(typeof el.closest === 'function' && el.closest('[contenteditable="true"], .TextEditor'));
  }

  function formatHotkeyFromEvent(event) {
    if (!event) {
      return '';
    }
    var code = event.code || '';
    var key = event.key || '';
    if ((!code && !key) || MODIFIER_CODES.has(code) || MODIFIER_KEYS.has(key)) {
      return '';
    }
    var token = code || (key.length === 1 ? 'Key' + key.toUpperCase() : key);
    var parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    parts.push(token);
    return normalizeHotkeyString(parts.join('+'));
  }

  function matchesHotkey(event, hotkeyStr) {
    var normalized = normalizeHotkeyString(hotkeyStr);
    if (!normalized || !event || event.repeat || isEditableElement(event.target)) {
      return false;
    }
    var pressed = formatHotkeyFromEvent(event);
    return pressed !== '' && pressed === normalized;
  }

  function formatHotkeyLabel(hotkeyStr) {
    var normalized = normalizeHotkeyString(hotkeyStr);
    if (!normalized) {
      return 'Не назначен';
    }
    return normalized
      .split('+')
      .map(function (part) {
        if (part.indexOf('Key') === 0 && part.length === 4) return part.slice(3);
        if (part.indexOf('Digit') === 0 && part.length === 6) return part.slice(5);
        return part;
      })
      .join(' + ');
  }

  function shouldIncrementCounter(result) {
    if (!result || result.ok !== true) {
      return false;
    }
    var target = result.targetReactionId != null ? String(result.targetReactionId) : null;
    var prev = result.prevReactionId != null ? String(result.prevReactionId) : null;
    var next = result.nextReactionId != null ? String(result.nextReactionId) : null;
    return Boolean(target && next === target && prev !== target);
  }

  function shouldShowQuickReactionButton(settingsObj, modelState) {
    if (!settingsObj || !settingsObj.enabled) {
      return false;
    }
    if (settingsObj.activationMode !== 'button' && settingsObj.activationMode !== 'both') {
      return false;
    }
    if (!modelState || !modelState.exists || !modelState.isComment) {
      return false;
    }
    if (modelState.isOwn) {
      return false;
    }
    return true;
  }

  function shouldShowQuickReplyButton(settingsObj, modelState, hasNativeReplyAction) {
    if (!settingsObj || !settingsObj.enabled || !settingsObj.showQuickReplyButton) {
      return false;
    }
    if (!modelState || !modelState.exists || !modelState.isComment) {
      return false;
    }
    if (modelState.isOwn || modelState.canReply === false) {
      return false;
    }
    if (hasNativeReplyAction === false) {
      return false;
    }
    return true;
  }

  function formatReactionLabel(reaction) {
    if (!reaction) {
      return 'Реакция';
    }
    return reaction.display || reaction.identifier || ('ID ' + reaction.id);
  }

  function getTopReactions(statsMap, catalogList, limit) {
    var stats = statsMap && typeof statsMap === 'object' ? statsMap : {};
    var list = Array.isArray(catalogList) ? catalogList : [];
    var maxItems = typeof limit === 'number' && limit > 0 ? limit : 5;

    var byId = new Map();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id != null) {
        byId.set(String(list[i].id), list[i]);
      }
    }

    var rows = [];
    Object.keys(stats).forEach(function (id) {
      var count = Number(stats[id]);
      if (!Number.isFinite(count) || count <= 0) {
        return;
      }
      var reaction = byId.get(String(id)) || {
        id: String(id),
        identifier: 'ID ' + id,
        display: null,
        uc: '✨',
        url: null
      };
      rows.push({ reaction: reaction, count: count });
    });

    rows.sort(function (a, b) {
      return b.count !== a.count
        ? b.count - a.count
        : Number(a.reaction.id) - Number(b.reaction.id);
    });

    return rows.slice(0, maxItems);
  }

  function getSnowmanChanceNumber(missCount) {
    var misses = typeof missCount === 'number' && Number.isFinite(missCount) && missCount > 0
      ? Math.floor(missCount)
      : 0;
    return Math.min(100, 3.141592653589793 + misses * SNOWMAN_MISS_BONUS_PERCENT);
  }

  function formatSnowmanChancePercent(missCount) {
    var misses = typeof missCount === 'number' && Number.isFinite(missCount) && missCount > 0
      ? Math.floor(missCount)
      : 0;
    if (misses === 0) {
      return '3,' + SNOWMAN_BASE_PI_DECIMALS + '%';
    }
    if (typeof BigInt === 'function') {
      var scale = SNOWMAN_BASE_PI_DECIMALS.length;
      var baseScaled = BigInt('3' + SNOWMAN_BASE_PI_DECIMALS);
      var stepScaled = BigInt(99) * (BigInt(10) ** BigInt(scale - 2));
      var totalScaled = baseScaled + BigInt(misses) * stepScaled;
      var maxScaled = BigInt(100) * (BigInt(10) ** BigInt(scale));
      if (totalScaled >= maxScaled) {
        return '100%';
      }
      var str = totalScaled.toString();
      while (str.length <= scale) {
        str = '0' + str;
      }
      var splitIdx = str.length - scale;
      return str.slice(0, splitIdx) + ',' + str.slice(splitIdx) + '%';
    }
    var approx = getSnowmanChanceNumber(misses);
    return approx >= 100 ? '100%' : approx.toFixed(6).replace('.', ',') + '%';
  }

  function rollSnowmanEvent(missCount, randomFn) {
    var rnd = typeof randomFn === 'function' ? randomFn() : Math.random();
    return rnd * 100 < getSnowmanChanceNumber(missCount);
  }

  function compareSemver(a, b) {
    var pa = String(a || '0.0.0').split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var pb = String(b || '0.0.0').split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var len = Math.max(pa.length, pb.length);
    for (var i = 0; i < len; i++) {
      var va = pa[i] || 0;
      var vb = pb[i] || 0;
      if (va !== vb) {
        return va > vb ? 1 : -1;
      }
    }
    return 0;
  }

  function shouldShowWhatsNew(lastSeenVersion, currentVersion, releases) {
    var current = String(currentVersion || EXTENSION_VERSION).trim();
    var seen = typeof lastSeenVersion === 'string' ? lastSeenVersion.trim() : '';
    var list = Array.isArray(releases) ? releases : CHANGELOG_RELEASES;

    if (!seen) {
      return list.some(function (rel) {
        return rel && rel.hasChanges !== false && compareSemver(rel.version, current) <= 0;
      });
    }

    if (compareSemver(seen, current) >= 0) {
      return false;
    }

    return list.some(function (rel) {
      if (!rel || rel.hasChanges === false) {
        return false;
      }
      return compareSemver(rel.version, seen) > 0 && compareSemver(rel.version, current) <= 0;
    });
  }

  function sanitizeReactionStats(rawStats) {
    var out = {};
    if (!rawStats || typeof rawStats !== 'object' || Array.isArray(rawStats)) {
      return out;
    }
    Object.keys(rawStats).forEach(function (key) {
      var val = Number(rawStats[key]);
      if (Number.isFinite(val) && val > 0) {
        out[String(key)] = Math.floor(val);
      }
    });
    return out;
  }

  function buildInstallStoragePatch(existing, currentVersion, releases, dateKey) {
    var data = existing && typeof existing === 'object' ? existing : {};
    var patch = {};

    patch.exboQrSettings = normalizeSettings(data.exboQrSettings);

    if (typeof data.exboQrCounter !== 'number' || !Number.isFinite(data.exboQrCounter) || data.exboQrCounter < 0) {
      patch.exboQrCounter = 0;
    } else {
      patch.exboQrCounter = Math.floor(data.exboQrCounter);
    }

    patch.exboQrDailyCounter = normalizeDailyCounter(data.exboQrDailyCounter, dateKey);

    if (!data.exboQrReactionStats || typeof data.exboQrReactionStats !== 'object' || Array.isArray(data.exboQrReactionStats)) {
      patch.exboQrReactionStats = {};
    } else {
      patch.exboQrReactionStats = sanitizeReactionStats(data.exboQrReactionStats);
    }

    if (typeof data.exboQrSnowmanMisses !== 'number' || !Number.isFinite(data.exboQrSnowmanMisses) || data.exboQrSnowmanMisses < 0) {
      patch.exboQrSnowmanMisses = 0;
    } else {
      patch.exboQrSnowmanMisses = Math.floor(data.exboQrSnowmanMisses);
    }

    var targetVersion = String(currentVersion || EXTENSION_VERSION);
    var shouldOpen = shouldShowWhatsNew(data.exboQrLastSeenVersion, targetVersion, releases);
    if (shouldOpen || typeof data.exboQrLastSeenVersion !== 'string' || !data.exboQrLastSeenVersion.trim()) {
      patch.exboQrLastSeenVersion = targetVersion;
    }

    return {
      patch: patch,
      shouldOpenWhatsNew: shouldOpen
    };
  }

  function buildAcceleratedRevealSchedule(text, initialIntervalMs, speedIncreaseRate) {
    var str = String(text == null ? '' : text);
    if (!str.length) {
      return [];
    }
    var initial = typeof initialIntervalMs === 'number' && Number.isFinite(initialIntervalMs) && initialIntervalMs > 0
      ? initialIntervalMs
      : 50;
    var rate = typeof speedIncreaseRate === 'number' && Number.isFinite(speedIncreaseRate) && speedIncreaseRate >= 0
      ? speedIncreaseRate
      : 0.0052;
    var factor = 1 + rate;

    var times = [];
    var interval = initial;
    var elapsed = initial;
    for (var i = 0; i < str.length; i++) {
      times.push(elapsed);
      interval = interval / factor;
      elapsed += interval;
    }
    return times;
  }

  var api = {
    EXTENSION_VERSION: EXTENSION_VERSION,
    CHANGELOG_RELEASES: CHANGELOG_RELEASES,
    DEFAULT_QUICK_REPLY_TEXT: DEFAULT_QUICK_REPLY_TEXT,
    DEFAULT_FAVORITE_IDS: DEFAULT_FAVORITE_IDS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    SNOWMAN_REACTION_ID: SNOWMAN_REACTION_ID,
    SNOWMAN_MISS_BONUS_PERCENT: SNOWMAN_MISS_BONUS_PERCENT,
    SNOWMAN_BASE_PI_DECIMALS: SNOWMAN_BASE_PI_DECIMALS,
    INTERACTIVE_SELECTOR: INTERACTIVE_SELECTOR,
    normalizeSettings: normalizeSettings,
    normalizeFavoriteIds: normalizeFavoriteIds,
    normalizeDailyCounter: normalizeDailyCounter,
    getLocalDateKey: getLocalDateKey,
    sortReactionsWithFavorites: sortReactionsWithFavorites,
    normalizeHotkeyString: normalizeHotkeyString,
    formatHotkeyFromEvent: formatHotkeyFromEvent,
    matchesHotkey: matchesHotkey,
    formatHotkeyLabel: formatHotkeyLabel,
    isEditableElement: isEditableElement,
    extractPostDescriptor: extractPostDescriptor,
    isInteractiveTarget: isInteractiveTarget,
    isDoubleClickOnPostContent: isDoubleClickOnPostContent,
    shouldIncrementCounter: shouldIncrementCounter,
    shouldShowQuickReactionButton: shouldShowQuickReactionButton,
    shouldShowQuickReplyButton: shouldShowQuickReplyButton,
    formatReactionLabel: formatReactionLabel,
    getTopReactions: getTopReactions,
    getSnowmanChanceNumber: getSnowmanChanceNumber,
    formatSnowmanChancePercent: formatSnowmanChancePercent,
    rollSnowmanEvent: rollSnowmanEvent,
    compareSemver: compareSemver,
    shouldShowWhatsNew: shouldShowWhatsNew,
    sanitizeReactionStats: sanitizeReactionStats,
    buildInstallStoragePatch: buildInstallStoragePatch,
    buildAcceleratedRevealSchedule: buildAcceleratedRevealSchedule
  };

  global.EXBO_QR_CORE = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
