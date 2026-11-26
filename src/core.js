(function (global) {
  'use strict';

  var DEFAULT_QUICK_REPLY_TEXT = '@"kravv285"#1459207 дроноеб';
  var DEFAULT_FAVORITE_IDS = ['89', '35', '33', '34'];

  var DEFAULT_SETTINGS = {
    enabled: true,
    reactionId: '89',
    favoriteReactionIds: DEFAULT_FAVORITE_IDS.slice(),
    activationMode: 'both', // 'button' | 'dblclick' | 'both'
    showCounter: true,
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

  var api = {
    DEFAULT_QUICK_REPLY_TEXT: DEFAULT_QUICK_REPLY_TEXT,
    DEFAULT_FAVORITE_IDS: DEFAULT_FAVORITE_IDS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
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
    getTopReactions: getTopReactions
  };

  global.EXBO_QR_CORE = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
