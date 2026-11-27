(function () {
  'use strict';

  var core = window.EXBO_QR_CORE;
  var catalog = window.EXBO_QR_CATALOG;

  var SETTINGS_KEY = 'exboQrSettings';
  var COUNTER_KEY = 'exboQrCounter';
  var DAILY_KEY = 'exboQrDailyCounter';
  var STATS_KEY = 'exboQrReactionStats';
  var CATALOG_KEY = 'exboQrCatalog';

  var powerToggleBtn = document.getElementById('powerToggleBtn');
  var disabledNoticeEl = document.getElementById('disabledNotice');
  var selectedPreviewEl = document.getElementById('selectedPreview');
  var counterCardEl = document.getElementById('counterCard');
  var counterValueEl = document.getElementById('counterValue');
  var dailyCounterValueEl = document.getElementById('dailyCounterValue');
  var resetCounterBtn = document.getElementById('resetCounterBtn');
  var topReactionsListEl = document.getElementById('topReactionsList');
  var showCounterInput = document.getElementById('showCounterInput');
  var highlightHoveredInput = document.getElementById('highlightHoveredInput');
  var hotkeyValueBadgeEl = document.getElementById('hotkeyValueBadge');
  var hotkeyRecordBtn = document.getElementById('hotkeyRecordBtn');
  var hotkeyClearBtn = document.getElementById('hotkeyClearBtn');
  var showQuickReplyInput = document.getElementById('showQuickReplyInput');
  var quickReplyTextInput = document.getElementById('quickReplyTextInput');
  var resetQuickReplyBtn = document.getElementById('resetQuickReplyBtn');
  var reactionSearchEl = document.getElementById('reactionSearch');
  var reactionGridEl = document.getElementById('reactionGrid');
  var reactionCountBadgeEl = document.getElementById('reactionCountBadge');
  var showChancesBtn = document.getElementById('showChancesBtn');
  var openWhatsNewBtn = document.getElementById('openWhatsNewBtn');
  var saveStatusEl = document.getElementById('saveStatus');
  var modeInputs = Array.from(document.querySelectorAll('input[name="activationMode"]'));

  var settings = core.normalizeSettings(null);
  var reactions = catalog.DEFAULT_REACTIONS.slice();
  var counter = 0;
  var dailyCounter = core.normalizeDailyCounter(null);
  var reactionStats = {};
  var confirmResetTimer = null;
  var confirmingReset = false;
  var recordingHotkey = false;

  function setStatus(text) {
    saveStatusEl.textContent = text;
  }

  function findReaction(id) {
    return reactions.find(function (r) { return String(r.id) === String(id); }) || reactions[0];
  }

  function renderPowerState() {
    var on = settings.enabled !== false;
    powerToggleBtn.classList.toggle('is-on', on);
    powerToggleBtn.classList.toggle('is-off', !on);
    powerToggleBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    powerToggleBtn.textContent = on ? 'Вкл' : 'Выкл';
    disabledNoticeEl.classList.toggle('is-hidden', on);
  }

  function renderSelectedPreview() {
    var current = findReaction(settings.reactionId);
    while (selectedPreviewEl.firstChild) {
      selectedPreviewEl.removeChild(selectedPreviewEl.firstChild);
    }
    if (!current) {
      return;
    }
    if (current.url) {
      var img = document.createElement('img');
      img.src = current.url;
      img.alt = current.uc || current.identifier;
      selectedPreviewEl.appendChild(img);
    } else if (current.uc) {
      var span = document.createElement('span');
      span.textContent = current.uc;
      selectedPreviewEl.appendChild(span);
    }
    var label = document.createElement('span');
    label.textContent = core.formatReactionLabel(current);
    selectedPreviewEl.appendChild(label);
  }

  function renderCounter() {
    counterCardEl.classList.toggle('is-hidden', !settings.showCounter);
    counterValueEl.textContent = String(counter);
    dailyCounterValueEl.textContent = String(core.normalizeDailyCounter(dailyCounter).count);
  }

  function renderTopReactions() {
    while (topReactionsListEl.firstChild) {
      topReactionsListEl.removeChild(topReactionsListEl.firstChild);
    }
    var top = core.getTopReactions(reactionStats, reactions, 5);
    if (top.length === 0) {
      var empty = document.createElement('span');
      empty.className = 'top-empty';
      empty.textContent = 'Пока нет поставленных реакций';
      topReactionsListEl.appendChild(empty);
      return;
    }
    top.forEach(function (item) {
      var r = item.reaction;
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'top-chip' + (String(r.id) === String(settings.reactionId) ? ' is-selected' : '');
      chip.dataset.reactionId = String(r.id);
      chip.title = 'Выбрать ' + core.formatReactionLabel(r) + ' (' + item.count + ')';

      if (r.url) {
        var img = document.createElement('img');
        img.src = r.url;
        img.alt = r.uc || r.identifier;
        chip.appendChild(img);
      } else {
        var glyph = document.createElement('span');
        glyph.textContent = r.uc || '✨';
        chip.appendChild(glyph);
      }

      var countSpan = document.createElement('span');
      countSpan.className = 'top-chip__count';
      countSpan.textContent = String(item.count);
      chip.appendChild(countSpan);

      topReactionsListEl.appendChild(chip);
    });
  }

  function renderHotkey() {
    hotkeyValueBadgeEl.textContent = recordingHotkey
      ? 'Нажмите клавишу...'
      : core.formatHotkeyLabel(settings.hotkey);
    hotkeyRecordBtn.classList.toggle('is-recording', recordingHotkey);
    hotkeyRecordBtn.textContent = recordingHotkey ? 'Ожидание ввода...' : 'Назначить клавишу';
    hotkeyClearBtn.disabled = !settings.hotkey && !recordingHotkey;
  }

  function renderModesAndReply() {
    modeInputs.forEach(function (input) {
      var checked = input.value === settings.activationMode;
      input.checked = checked;
      if (input.parentElement) {
        input.parentElement.classList.toggle('is-selected', checked);
      }
    });
    showCounterInput.checked = settings.showCounter;
    if (highlightHoveredInput) {
      highlightHoveredInput.checked = settings.highlightHoveredPost !== false;
    }
    showQuickReplyInput.checked = settings.showQuickReplyButton;
    if (document.activeElement !== quickReplyTextInput) {
      quickReplyTextInput.value = settings.quickReplyText;
    }
    resetQuickReplyBtn.disabled = settings.quickReplyText === core.DEFAULT_QUICK_REPLY_TEXT;
  }

  function renderReactionGrid() {
    var query = (reactionSearchEl.value || '').trim().toLowerCase();
    var favSet = new Set(settings.favoriteReactionIds || []);
    var ordered = core.sortReactionsWithFavorites(reactions, settings.favoriteReactionIds);
    var filtered = ordered.filter(function (r) {
      if (!query) {
        return true;
      }
      var idMatch = String(r.id).includes(query);
      var identMatch = (r.identifier || '').toLowerCase().includes(query);
      var dispMatch = (r.display || '').toLowerCase().includes(query);
      return idMatch || identMatch || dispMatch;
    });

    reactionCountBadgeEl.textContent = '★ ' + favSet.size + ' · ' + filtered.length + '/' + reactions.length;

    while (reactionGridEl.firstChild) {
      reactionGridEl.removeChild(reactionGridEl.firstChild);
    }

    if (filtered.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'reaction-empty';
      empty.textContent = 'Реакции не найдены';
      reactionGridEl.appendChild(empty);
      return;
    }

    filtered.forEach(function (r) {
      var idStr = String(r.id);
      var isSelected = idStr === String(settings.reactionId);
      var isFav = favSet.has(idStr);
      var label = core.formatReactionLabel(r);

      var tile = document.createElement('div');
      tile.className = 'reaction-tile';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'reaction-item' + (isSelected ? ' is-selected' : '') + (isFav ? ' is-favorite' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      btn.title = label + ' (ID ' + r.id + ')';
      btn.setAttribute('aria-label', btn.title);
      btn.dataset.reactionId = idStr;

      if (r.url) {
        var img = document.createElement('img');
        img.src = r.url;
        img.alt = r.uc || label;
        img.loading = 'lazy';
        btn.appendChild(img);
      } else {
        var span = document.createElement('span');
        span.textContent = r.uc || label;
        btn.appendChild(span);
      }

      var starBtn = document.createElement('button');
      starBtn.type = 'button';
      starBtn.className = 'reaction-star' + (isFav ? ' is-active' : '');
      starBtn.dataset.favId = idStr;
      starBtn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
      starBtn.title = isFav ? 'Убрать из избранных' : 'Добавить в избранные';
      starBtn.setAttribute('aria-label', starBtn.title + ': ' + label);
      starBtn.textContent = isFav ? '★' : '☆';

      tile.appendChild(btn);
      tile.appendChild(starBtn);
      reactionGridEl.appendChild(tile);
    });
  }

  function renderAll() {
    renderPowerState();
    renderSelectedPreview();
    renderCounter();
    renderTopReactions();
    renderHotkey();
    renderModesAndReply();
    renderReactionGrid();
  }

  async function saveSettings(partial) {
    settings = core.normalizeSettings(Object.assign({}, settings, partial));
    renderAll();
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    setStatus('Сохранено');
  }

  function toggleFavorite(reactionId) {
    var list = (settings.favoriteReactionIds || []).slice();
    var idx = list.indexOf(reactionId);
    if (idx !== -1) {
      list.splice(idx, 1);
    } else {
      list.push(reactionId);
    }
    saveSettings({ favoriteReactionIds: list });
  }

  powerToggleBtn.addEventListener('click', function () {
    saveSettings({ enabled: !settings.enabled });
  });

  topReactionsListEl.addEventListener('click', function (event) {
    var chip = event.target && event.target.closest ? event.target.closest('.top-chip') : null;
    if (chip && chip.dataset.reactionId) {
      saveSettings({ reactionId: chip.dataset.reactionId });
    }
  });

  reactionGridEl.addEventListener('click', function (event) {
    var star = event.target && event.target.closest ? event.target.closest('.reaction-star') : null;
    if (star && star.dataset.favId) {
      event.stopPropagation();
      toggleFavorite(star.dataset.favId);
      return;
    }
    var btn = event.target && event.target.closest ? event.target.closest('.reaction-item') : null;
    if (btn && btn.dataset.reactionId) {
      saveSettings({ reactionId: btn.dataset.reactionId });
    }
  });

  modeInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      if (input.checked) {
        saveSettings({ activationMode: input.value });
      }
    });
  });

  showCounterInput.addEventListener('change', function () {
    saveSettings({ showCounter: showCounterInput.checked });
  });

  if (highlightHoveredInput) {
    highlightHoveredInput.addEventListener('change', function () {
      saveSettings({ highlightHoveredPost: highlightHoveredInput.checked });
    });
  }

  showQuickReplyInput.addEventListener('change', function () {
    saveSettings({ showQuickReplyButton: showQuickReplyInput.checked });
  });

  quickReplyTextInput.addEventListener('input', function () {
    var val = quickReplyTextInput.value;
    resetQuickReplyBtn.disabled = val === core.DEFAULT_QUICK_REPLY_TEXT;
    if (val.trim() !== '') {
      saveSettings({ quickReplyText: val });
    }
  });

  quickReplyTextInput.addEventListener('change', function () {
    saveSettings({ quickReplyText: quickReplyTextInput.value });
  });

  resetQuickReplyBtn.addEventListener('click', function () {
    quickReplyTextInput.value = core.DEFAULT_QUICK_REPLY_TEXT;
    saveSettings({ quickReplyText: core.DEFAULT_QUICK_REPLY_TEXT });
    setStatus('Возвращён исходный текст ответа');
  });

  hotkeyRecordBtn.addEventListener('click', function () {
    recordingHotkey = !recordingHotkey;
    renderHotkey();
  });

  hotkeyClearBtn.addEventListener('click', function () {
    recordingHotkey = false;
    saveSettings({ hotkey: '' });
  });

  document.addEventListener('keydown', function (event) {
    if (!recordingHotkey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape') {
      recordingHotkey = false;
      renderHotkey();
      return;
    }
    var formatted = core.formatHotkeyFromEvent(event);
    if (!formatted) {
      return;
    }
    recordingHotkey = false;
    saveSettings({ hotkey: formatted });
  });

  reactionSearchEl.addEventListener('input', renderReactionGrid);

  if (showChancesBtn) {
    showChancesBtn.addEventListener('click', function () {
      var url = chrome.runtime && typeof chrome.runtime.getURL === 'function'
        ? chrome.runtime.getURL('src/chances.html')
        : 'chances.html';
      if (chrome.tabs && typeof chrome.tabs.create === 'function') {
        chrome.tabs.create({ url: url });
      } else {
        window.open(url, '_blank');
      }
    });
  }

  if (openWhatsNewBtn) {
    openWhatsNewBtn.addEventListener('click', function () {
      var url = chrome.runtime && typeof chrome.runtime.getURL === 'function'
        ? chrome.runtime.getURL('src/whats-new.html')
        : 'whats-new.html';
      if (chrome.tabs && typeof chrome.tabs.create === 'function') {
        chrome.tabs.create({ url: url });
      } else {
        window.open(url, '_blank');
      }
    });
  }

  resetCounterBtn.addEventListener('click', async function () {
    if (!confirmingReset) {
      confirmingReset = true;
      resetCounterBtn.classList.add('is-confirming');
      resetCounterBtn.textContent = 'Подтв.';
      clearTimeout(confirmResetTimer);
      confirmResetTimer = setTimeout(function () {
        confirmingReset = false;
        resetCounterBtn.classList.remove('is-confirming');
        resetCounterBtn.textContent = 'Сброс';
      }, 3000);
      return;
    }

    confirmingReset = false;
    clearTimeout(confirmResetTimer);
    resetCounterBtn.classList.remove('is-confirming');
    resetCounterBtn.textContent = 'Сброс';

    try {
      var res = await chrome.runtime.sendMessage({ type: 'EXBO_QR_RESET_COUNTER' });
      counter = res && typeof res.count === 'number' ? res.count : 0;
      dailyCounter = core.normalizeDailyCounter(res && res.daily);
      reactionStats = res && res.stats ? res.stats : {};
    } catch (_err) {
      var emptyDaily = core.normalizeDailyCounter(null);
      await chrome.storage.local.set({ [COUNTER_KEY]: 0, [DAILY_KEY]: emptyDaily, [STATS_KEY]: {} });
      counter = 0;
      dailyCounter = emptyDaily;
      reactionStats = {};
    }
    renderCounter();
    renderTopReactions();
    setStatus('Счётчики и топ реакций сброшены');
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') {
      return;
    }
    if (changes[COUNTER_KEY]) {
      var nextCount = changes[COUNTER_KEY].newValue;
      counter = typeof nextCount === 'number' && Number.isFinite(nextCount) ? nextCount : 0;
      renderCounter();
    }
    if (changes[DAILY_KEY]) {
      dailyCounter = core.normalizeDailyCounter(changes[DAILY_KEY].newValue);
      renderCounter();
    }
    if (changes[STATS_KEY]) {
      reactionStats = changes[STATS_KEY].newValue && typeof changes[STATS_KEY].newValue === 'object'
        ? changes[STATS_KEY].newValue
        : {};
      renderTopReactions();
    }
    if (changes[CATALOG_KEY] && Array.isArray(changes[CATALOG_KEY].newValue) && changes[CATALOG_KEY].newValue.length > 0) {
      reactions = changes[CATALOG_KEY].newValue;
      renderSelectedPreview();
      renderTopReactions();
      renderReactionGrid();
    }
  });

  async function init() {
    var data = await chrome.storage.local.get([SETTINGS_KEY, COUNTER_KEY, DAILY_KEY, STATS_KEY, CATALOG_KEY]);
    settings = core.normalizeSettings(data && data[SETTINGS_KEY]);
    counter = typeof data[COUNTER_KEY] === 'number' && Number.isFinite(data[COUNTER_KEY]) && data[COUNTER_KEY] >= 0
      ? Math.floor(data[COUNTER_KEY])
      : 0;
    dailyCounter = core.normalizeDailyCounter(data && data[DAILY_KEY]);
    reactionStats = core.sanitizeReactionStats(data && data[STATS_KEY]);
    if (Array.isArray(data[CATALOG_KEY]) && data[CATALOG_KEY].length > 0) {
      reactions = data[CATALOG_KEY];
    }

    renderAll();

    var selectedItem = reactionGridEl.querySelector('.reaction-item.is-selected');
    if (selectedItem && typeof selectedItem.scrollIntoView === 'function') {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }

  init();
})();
