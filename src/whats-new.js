(function () {
  'use strict';

  var core = window.EXBO_QR_CORE;
  var LAST_SEEN_KEY = 'exboQrLastSeenVersion';
  var COUNTER_KEY = 'exboQrCounter';

  var headingEl = document.getElementById('wnHeading');
  var versionBadgeEl = document.getElementById('wnVersionBadge');
  var highlightsEl = document.getElementById('wnHighlights');
  var mysteriesEl = document.getElementById('wnMysteries');
  var statsNoteEl = document.getElementById('wnStatsNote');
  var closeBtn = document.getElementById('wnCloseBtn');

  var manifest = chrome.runtime && typeof chrome.runtime.getManifest === 'function'
    ? chrome.runtime.getManifest()
    : null;
  var currentVersion = (manifest && manifest.version) || (core && core.EXTENSION_VERSION) || '1.1.0';
  var releases = (core && Array.isArray(core.CHANGELOG_RELEASES)) ? core.CHANGELOG_RELEASES : [];
  var latestRelease = releases.find(function (r) { return r && r.version === currentVersion; }) || releases[0];

  if (versionBadgeEl) {
    versionBadgeEl.textContent = 'v' + currentVersion;
  }

  if (headingEl && latestRelease && latestRelease.title) {
    headingEl.textContent = latestRelease.title;
  }

  if (highlightsEl && latestRelease && Array.isArray(latestRelease.highlights)) {
    latestRelease.highlights.forEach(function (text) {
      var li = document.createElement('li');
      li.textContent = text;
      highlightsEl.appendChild(li);
    });
  }

  if (mysteriesEl && latestRelease && Array.isArray(latestRelease.mysteries)) {
    latestRelease.mysteries.forEach(function (hint) {
      var li = document.createElement('li');
      li.textContent = hint;
      mysteriesEl.appendChild(li);
    });
  }

  chrome.storage.local.get([COUNTER_KEY]).then(function (data) {
    var count = data && typeof data[COUNTER_KEY] === 'number' && Number.isFinite(data[COUNTER_KEY]) && data[COUNTER_KEY] > 0
      ? Math.floor(data[COUNTER_KEY])
      : 0;
    if (statsNoteEl) {
      statsNoteEl.textContent = count > 0
        ? 'Накопленная статистика сохранена: уже поставлено реакций — ' + count + '.'
        : 'Статистика реакций начнёт накапливаться автоматически и сохранится при будущих обновлениях.';
    }
    return chrome.storage.local.set({ [LAST_SEEN_KEY]: currentVersion });
  }).catch(function () {});

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      window.close();
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.code === 'Escape') {
      window.close();
    }
  });
})();
