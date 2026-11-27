(function () {
  'use strict';

  var core = window.EXBO_QR_CORE;
  var SNOWMAN_MISSES_KEY = 'exboQrSnowmanMisses';

  var cardEl = document.querySelector('.chances-card');
  var valueEl = document.getElementById('chanceValue');
  var metaEl = document.getElementById('chanceMeta');
  var closeBtn = document.getElementById('closePageBtn');

  var activeRafId = 0;

  function animateValue(targetText) {
    if (activeRafId) {
      cancelAnimationFrame(activeRafId);
      activeRafId = 0;
    }

    var str = String(targetText || '');
    if (!str.length) {
      valueEl.textContent = '';
      return;
    }

    var schedule = core.buildAcceleratedRevealSchedule(str, 50, 0.0052);
    var startTs = performance.now();
    var revealed = 0;
    valueEl.textContent = '';

    function step(now) {
      var elapsed = now - startTs;
      while (revealed < str.length && schedule[revealed] <= elapsed) {
        revealed += 1;
      }
      valueEl.textContent = str.slice(0, revealed);
      if (revealed < str.length) {
        activeRafId = requestAnimationFrame(step);
      } else {
        activeRafId = 0;
        valueEl.textContent = str;
      }
    }

    activeRafId = requestAnimationFrame(step);
  }

  function render(missesRaw) {
    var misses = typeof missesRaw === 'number' && Number.isFinite(missesRaw) && missesRaw > 0
      ? Math.floor(missesRaw)
      : 0;

    var targetText = core.formatSnowmanChancePercent(misses);
    animateValue(targetText);

    if (misses > 0) {
      var bonus = (misses * core.SNOWMAN_MISS_BONUS_PERCENT).toFixed(2).replace('.', ',');
      metaEl.textContent = 'Сдвиг шанса: +' + bonus + '% (попыток: ' + misses + ').';
    } else {
      metaEl.textContent = 'Подсказка: ставь реакцию снеговика на чужие сообщения (+0,99% за попытку).';
    }
  }

  chrome.storage.local.get(SNOWMAN_MISSES_KEY).then(function (data) {
    render(data && data[SNOWMAN_MISSES_KEY]);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (cardEl) {
          cardEl.classList.add('is-revealed');
        }
      });
    });
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes[SNOWMAN_MISSES_KEY]) {
      render(changes[SNOWMAN_MISSES_KEY].newValue);
    }
  });

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
