(function () {
  'use strict';

  var core = window.EXBO_QR_CORE;
  var catalog = window.EXBO_QR_CATALOG;

  if (!core || !catalog) {
    return;
  }

  var REQ_EVENT = 'exbo-qr:request';
  var RES_EVENT = 'exbo-qr:response';
  var ROUTE_EVENT = 'exbo-qr:route-change';
  var SETTINGS_KEY = 'exboQrSettings';
  var CATALOG_KEY = 'exboQrCatalog';
  var SNOWMAN_MISSES_KEY = 'exboQrSnowmanMisses';

  var settings = core.normalizeSettings(null);
  var reactionMap = new Map();
  var postStateMap = new Map();
  var postStatusMap = new Map();
  var inFlightPosts = new Set();
  var pendingRequests = new Map();
  var openFavPostId = null;
  var requestSeq = 0;
  var syncScheduled = false;
  var syncInProgress = false;
  var syncPendingAfter = false;
  var catalogSynced = false;
  var appReadyOnce = false;
  var lastHoveredItemEl = null;
  var highlightedItemEl = null;

  function clearHoveredPostHighlight() {
    if (highlightedItemEl) {
      highlightedItemEl.classList.remove('exbo-qr-hovered-post');
      highlightedItemEl = null;
    }
  }

  function syncHoverHighlightRootClass() {
    var active = Boolean(settings.enabled && settings.highlightHoveredPost);
    if (document.documentElement) {
      document.documentElement.classList.toggle('exbo-qr-hover-enabled', active);
    }
    if (!active) {
      clearHoveredPostHighlight();
    }
  }

  function updateHoveredPostHighlight(itemEl) {
    if (!settings.enabled || !settings.highlightHoveredPost) {
      clearHoveredPostHighlight();
      return;
    }
    if (highlightedItemEl === itemEl) {
      return;
    }
    clearHoveredPostHighlight();
    if (itemEl && document.contains(itemEl)) {
      itemEl.classList.add('exbo-qr-hovered-post');
      highlightedItemEl = itemEl;
    }
  }

  function resolveHoveredPostItem(target) {
    var el = target && target.nodeType === 3 ? target.parentElement : target;
    if (!el || typeof el.closest !== 'function') {
      return null;
    }
    var itemEl = el.closest('.PostStream-item[data-id][data-type="comment"]');
    if (itemEl && !itemEl.querySelector('.ReplyPlaceholder')) {
      return itemEl;
    }
    var fallbackItem = el.closest('.PostStream-item');
    if (fallbackItem && fallbackItem.querySelector('.CommentPost') && !fallbackItem.querySelector('.ReplyPlaceholder')) {
      return fallbackItem;
    }
    return null;
  }

  syncHoverHighlightRootClass();

  function seedCatalogMap(list) {
    var next = new Map();
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (item && item.id != null) {
        next.set(String(item.id), item);
      }
    }
    reactionMap = next;
  }

  seedCatalogMap(catalog.DEFAULT_REACTIONS);

  document.addEventListener(RES_EVENT, function (event) {
    var parsed;
    try {
      parsed = JSON.parse(event.detail);
    } catch (_err) {
      return;
    }
    if (!parsed || !parsed.requestId) {
      return;
    }
    var pending = pendingRequests.get(parsed.requestId);
    if (!pending) {
      return;
    }
    pendingRequests.delete(parsed.requestId);
    clearTimeout(pending.timer);
    pending.resolve(parsed.result);
  });

  function callBridge(action, payload, timeoutMs) {
    var requestId = 'qr_' + (++requestSeq) + '_' + Date.now();
    var limit = typeof timeoutMs === 'number' ? timeoutMs : 8000;

    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        pendingRequests.delete(requestId);
        reject(new Error('Таймаут ожидания ответа от страницы форума.'));
      }, limit);

      pendingRequests.set(requestId, { resolve: resolve, reject: reject, timer: timer });

      document.dispatchEvent(new CustomEvent(REQ_EVENT, {
        detail: JSON.stringify({
          requestId: requestId,
          action: action,
          payload: payload || {}
        })
      }));
    });
  }

  function getReactionById(id) {
    var key = String(id);
    return reactionMap.get(key) || {
      id: key,
      identifier: 'reaction_' + key,
      display: null,
      uc: '✨',
      url: null
    };
  }

  function getFavoriteReactions() {
    var ids = Array.isArray(settings.favoriteReactionIds) ? settings.favoriteReactionIds : [];
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var r = reactionMap.get(String(ids[i]));
      if (r) {
        out.push(r);
      }
    }
    return out;
  }

  function findActionsList(descriptor) {
    return descriptor.postEl.querySelector('.Post-actions > ul') || descriptor.postEl.querySelector('.Post-actions ul');
  }

  function setPostStatus(postId, kind, text, ttlMs) {
    var prev = postStatusMap.get(postId);
    if (prev && prev.timer) {
      clearTimeout(prev.timer);
    }
    if (!kind) {
      postStatusMap.delete(postId);
      return;
    }
    var entry = { kind: kind, text: text, timer: null };
    if (typeof ttlMs === 'number' && ttlMs > 0) {
      entry.timer = setTimeout(function () {
        var cur = postStatusMap.get(postId);
        if (cur === entry) {
          postStatusMap.delete(postId);
          var itemEl = document.querySelector('.PostStream-item[data-id="' + postId + '"][data-type="comment"]');
          var desc = itemEl ? core.extractPostDescriptor(itemEl) : null;
          if (desc) {
            renderPostActions(desc, postStateMap.get(postId));
          }
        }
      }, ttlMs);
    }
    postStatusMap.set(postId, entry);
  }

  function showPostToast(descriptor, message, variant) {
    var itemEl = descriptor.itemEl;
    var existing = itemEl.querySelector('.exbo-qr-toast');
    if (existing) {
      if (existing._dismissTimer) {
        clearTimeout(existing._dismissTimer);
      }
      existing.remove();
    }

    var toast = document.createElement('div');
    toast.className = 'exbo-qr-toast exbo-qr-toast--' + (variant || 'info');
    toast.setAttribute('role', 'status');
    toast.textContent = message;

    var actionsEl = descriptor.postEl.querySelector('.Post-actions');
    if (actionsEl && actionsEl.parentNode) {
      actionsEl.parentNode.insertBefore(toast, actionsEl.nextSibling);
    } else {
      descriptor.postEl.appendChild(toast);
    }

    toast._dismissTimer = setTimeout(function () {
      toast.remove();
    }, 3200);
  }

  function appendReactionIcon(container, reaction, clsPrefix) {
    if (reaction.url) {
      var img = document.createElement('img');
      img.className = clsPrefix + '__emoji';
      img.src = reaction.url;
      img.alt = reaction.uc || core.formatReactionLabel(reaction);
      img.width = 16;
      img.height = 16;
      img.draggable = false;
      container.appendChild(img);
    } else {
      var glyph = document.createElement('span');
      glyph.className = clsPrefix + '__glyph';
      glyph.textContent = reaction.uc || '⚡';
      container.appendChild(glyph);
    }
  }

  function updateReactionGroupVisuals(li, postId, reaction, modelState, isLoading) {
    var isActive = Boolean(modelState && modelState.userReaction != null && String(modelState.userReaction) === String(reaction.id));
    var btn = li.querySelector('.exbo-qr-btn');
    var label = core.formatReactionLabel(reaction);

    btn.dataset.postId = postId;
    btn.dataset.reactionId = reaction.id;
    btn.classList.toggle('is-active', isActive);
    btn.classList.toggle('is-loading', Boolean(isLoading));
    btn.disabled = Boolean(isLoading);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.title = isLoading
      ? 'Отправляется реакция...'
      : (isActive ? 'Убрать быструю реакцию: ' + label : 'Быстрая реакция: ' + label);
    btn.setAttribute('aria-label', btn.title);

    while (btn.firstChild) {
      btn.removeChild(btn.firstChild);
    }

    var iconWrap = document.createElement('span');
    iconWrap.className = 'exbo-qr-btn__icon';
    if (isLoading) {
      var spinner = document.createElement('span');
      spinner.className = 'exbo-qr-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      iconWrap.appendChild(spinner);
    } else {
      appendReactionIcon(iconWrap, reaction, 'exbo-qr-btn');
    }
    btn.appendChild(iconWrap);

    var textSpan = document.createElement('span');
    textSpan.className = 'Button-label exbo-qr-btn__label';
    textSpan.textContent = isLoading ? 'Отправка' : (isActive ? 'Снять' : 'Быстро');
    btn.appendChild(textSpan);

    // Compact favorites arrow & menu
    var favToggle = li.querySelector('.exbo-qr-fav-toggle');
    var favMenu = li.querySelector('.exbo-qr-fav-menu');
    var favorites = getFavoriteReactions();
    var showFavs = favorites.length > 0;
    var menuOpen = showFavs && openFavPostId === postId;

    favToggle.style.display = showFavs ? '' : 'none';
    favToggle.disabled = Boolean(isLoading);
    favToggle.dataset.postId = postId;
    favToggle.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');

    favMenu.classList.toggle('is-hidden', !menuOpen);
    while (favMenu.firstChild) {
      favMenu.removeChild(favMenu.firstChild);
    }
    if (menuOpen) {
      favorites.forEach(function (fav) {
        var opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'exbo-qr-fav-option';
        if (modelState && modelState.userReaction != null && String(modelState.userReaction) === String(fav.id)) {
          opt.classList.add('is-active');
        }
        opt.dataset.postId = postId;
        opt.dataset.reactionId = String(fav.id);
        opt.title = core.formatReactionLabel(fav);
        opt.setAttribute('aria-label', 'Избранная реакция: ' + opt.title);
        appendReactionIcon(opt, fav, 'exbo-qr-fav-option');
        favMenu.appendChild(opt);
      });
    }

    // Inline status badge
    var statusEl = li.querySelector('.exbo-qr-status');
    var statusInfo = postStatusMap.get(postId);
    if (statusInfo) {
      statusEl.textContent = statusInfo.text;
      statusEl.className = 'exbo-qr-status exbo-qr-status--' + statusInfo.kind;
      statusEl.style.display = '';
    } else {
      statusEl.textContent = '';
      statusEl.className = 'exbo-qr-status';
      statusEl.style.display = 'none';
    }
  }

  function createReactionGroupElement() {
    var li = document.createElement('li');
    li.className = 'item-exbo-qr';

    var group = document.createElement('div');
    group.className = 'exbo-qr-group';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'Button Button--link exbo-qr-btn';

    var favToggle = document.createElement('button');
    favToggle.type = 'button';
    favToggle.className = 'Button Button--link exbo-qr-fav-toggle';
    favToggle.title = 'Выбрать из избранных реакций';
    favToggle.setAttribute('aria-label', 'Избранные реакции');
    favToggle.textContent = '▾';

    var favMenu = document.createElement('div');
    favMenu.className = 'exbo-qr-fav-menu is-hidden';
    favMenu.setAttribute('role', 'menu');
    favMenu.setAttribute('aria-label', 'Избранные реакции');

    group.appendChild(btn);
    group.appendChild(favToggle);
    group.appendChild(favMenu);
    li.appendChild(group);

    var statusEl = document.createElement('span');
    statusEl.className = 'exbo-qr-status';
    statusEl.setAttribute('role', 'status');
    statusEl.style.display = 'none';
    li.appendChild(statusEl);

    return li;
  }

  function createQuickReplyButtonElement(postId) {
    var li = document.createElement('li');
    li.className = 'item-exbo-qr-reply';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'Button Button--link exbo-qr-reply-btn';
    btn.dataset.postId = postId;
    btn.title = 'Быстрый ответ: ' + settings.quickReplyText;
    btn.setAttribute('aria-label', btn.title);

    var icon = document.createElement('span');
    icon.className = 'exbo-qr-reply-btn__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '💬';
    btn.appendChild(icon);

    var textSpan = document.createElement('span');
    textSpan.className = 'Button-label exbo-qr-reply-btn__label';
    textSpan.textContent = 'Быстрый ответ';
    btn.appendChild(textSpan);

    li.appendChild(btn);
    return li;
  }

  function removeAllExtensionNodesFromRoot(root) {
    var nodes = (root || document).querySelectorAll('.item-exbo-qr, .item-exbo-qr-reply, .exbo-qr-toast');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].remove();
    }
  }

  function removeButtonFromPost(itemEl) {
    var items = itemEl.querySelectorAll('.item-exbo-qr, .item-exbo-qr-reply');
    for (var i = 0; i < items.length; i++) {
      items[i].remove();
    }
  }

  function renderPostActions(descriptor, modelState) {
    if (!settings.enabled || !modelState || !modelState.exists || !modelState.isComment) {
      removeButtonFromPost(descriptor.itemEl);
      return;
    }

    var actionsUl = findActionsList(descriptor);
    if (!actionsUl) {
      return;
    }

    var showReactionButton = core.shouldShowQuickReactionButton(settings, modelState);

    if (!showReactionButton) {
      var oldReactItems = actionsUl.querySelectorAll(':scope > .item-exbo-qr');
      for (var r = 0; r < oldReactItems.length; r++) {
        oldReactItems[r].remove();
      }
    } else {
      var reaction = getReactionById(settings.reactionId);
      var isLoading = inFlightPosts.has(descriptor.postId);

      var existingItems = actionsUl.querySelectorAll(':scope > .item-exbo-qr');
      for (var i = 1; i < existingItems.length; i++) {
        existingItems[i].remove();
      }

      var existingLi = existingItems[0];
      if (!existingLi || !existingLi.querySelector('.exbo-qr-fav-menu')) {
        if (existingLi) {
          existingLi.remove();
        }
        existingLi = createReactionGroupElement();
        var reactLi = actionsUl.querySelector(':scope > .item-react');
        if (reactLi && reactLi.nextSibling) {
          actionsUl.insertBefore(existingLi, reactLi.nextSibling);
        } else if (reactLi) {
          actionsUl.appendChild(existingLi);
        } else {
          actionsUl.insertBefore(existingLi, actionsUl.firstChild);
        }
      }
      updateReactionGroupVisuals(existingLi, descriptor.postId, reaction, modelState, isLoading);
    }

    // Quick reply button (hidden on own posts and posts where replying is disabled)
    var hasNativeReplyAction = Boolean(actionsUl.querySelector('.item-reply'));
    var showReplyButton = core.shouldShowQuickReplyButton(settings, modelState, hasNativeReplyAction);
    var existingReplyItems = actionsUl.querySelectorAll(':scope > .item-exbo-qr-reply');
    if (!showReplyButton) {
      for (var q = 0; q < existingReplyItems.length; q++) {
        existingReplyItems[q].remove();
      }
    } else {
      for (var k = 1; k < existingReplyItems.length; k++) {
        existingReplyItems[k].remove();
      }
      var replyLi = existingReplyItems[0];
      if (replyLi) {
        var replyBtn = replyLi.querySelector('.exbo-qr-reply-btn');
        if (replyBtn) {
          replyBtn.dataset.postId = descriptor.postId;
          replyBtn.title = 'Быстрый ответ: ' + settings.quickReplyText;
          replyBtn.setAttribute('aria-label', replyBtn.title);
        } else {
          replyLi.remove();
          replyLi = null;
        }
      }
      if (!replyLi) {
        var newReplyLi = createQuickReplyButtonElement(descriptor.postId);
        var anchor = actionsUl.querySelector(':scope > .item-exbo-qr') || actionsUl.querySelector(':scope > .item-react');
        if (anchor && anchor.nextSibling) {
          actionsUl.insertBefore(newReplyLi, anchor.nextSibling);
        } else {
          actionsUl.appendChild(newReplyLi);
        }
      }
    }
  }

  function collectDescriptors() {
    var items = document.querySelectorAll('.PostStream-item[data-id][data-type="comment"]');
    var list = [];
    for (var i = 0; i < items.length; i++) {
      var desc = core.extractPostDescriptor(items[i]);
      if (desc) {
        list.push(desc);
      }
    }
    return list;
  }

  async function syncPostsNow() {
    if (!settings.enabled) {
      removeAllExtensionNodesFromRoot(document);
      return;
    }

    if (syncInProgress) {
      syncPendingAfter = true;
      return;
    }

    syncInProgress = true;
    try {
      var descriptors = collectDescriptors();

      var allItems = document.querySelectorAll('.PostStream-item');
      for (var k = 0; k < allItems.length; k++) {
        if (!core.extractPostDescriptor(allItems[k])) {
          removeButtonFromPost(allItems[k]);
        }
      }

      if (descriptors.length === 0) {
        return;
      }

      var postIds = descriptors.map(function (d) { return d.postId; });
      var ctx = await callBridge('get-context', { postIds: postIds }, 4000);
      if (!ctx || !ctx.ok || !ctx.appReady) {
        return;
      }
      appReadyOnce = true;

      if (Array.isArray(ctx.reactions) && ctx.reactions.length > 0) {
        seedCatalogMap(ctx.reactions);
        if (!catalogSynced) {
          catalogSynced = true;
          chrome.storage.local.set({ [CATALOG_KEY]: ctx.reactions }).catch(function () {});
        }
      }

      var posts = ctx.posts || {};
      for (var i = 0; i < descriptors.length; i++) {
        var desc = descriptors[i];
        var state = posts[desc.postId];
        if (state && state.exists && state.isComment) {
          postStateMap.set(desc.postId, state);
        } else {
          postStateMap.delete(desc.postId);
        }
        renderPostActions(desc, state);
      }
    } catch (_err) {
      // Wait for next mutation/boot retry
    } finally {
      syncInProgress = false;
      if (syncPendingAfter) {
        syncPendingAfter = false;
        scheduleSync();
      }
    }
  }

  function scheduleSync() {
    if (syncScheduled) {
      return;
    }
    syncScheduled = true;
    requestAnimationFrame(function () {
      syncScheduled = false;
      syncPostsNow();
    });
  }

  async function incrementCounter(reactionId) {
    try {
      await chrome.runtime.sendMessage({
        type: 'EXBO_QR_INCREMENT_COUNTER',
        reactionId: reactionId
      });
    } catch (_err) {
      var today = core.getLocalDateKey();
      var data = await chrome.storage.local.get(['exboQrCounter', 'exboQrDailyCounter', 'exboQrReactionStats']);
      var cur = typeof data.exboQrCounter === 'number' && Number.isFinite(data.exboQrCounter) ? data.exboQrCounter : 0;
      var daily = core.normalizeDailyCounter(data.exboQrDailyCounter, today);
      daily.count += 1;
      var stats = data.exboQrReactionStats && typeof data.exboQrReactionStats === 'object'
        ? Object.assign({}, data.exboQrReactionStats)
        : {};
      if (reactionId) {
        stats[String(reactionId)] = (Number(stats[String(reactionId)]) || 0) + 1;
      }
      await chrome.storage.local.set({
        exboQrCounter: cur + 1,
        exboQrDailyCounter: daily,
        exboQrReactionStats: stats
      });
    }
  }

  var activeFireworksCleanup = null;

  function launchSnowmanFireworks() {
    if (typeof activeFireworksCleanup === 'function') {
      activeFireworksCleanup();
    }

    var canvas = document.createElement('canvas');
    canvas.className = 'exbo-qr-fireworks-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);

    var banner = document.createElement('div');
    banner.className = 'exbo-qr-festive-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = '⛄ Событие сработало! С наступающим! 🎄';
    document.body.appendChild(banner);
    requestAnimationFrame(function () {
      banner.classList.add('is-visible');
    });

    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var width = window.innerWidth;
    var height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Festive non-purple winter & New Year palette (gold, ice cyan, crimson, emerald, snow, warm orange, coral)
    var colors = ['#fbbf24', '#38bdf8', '#ef4444', '#34d399', '#f8fafc', '#fb923c', '#fb7185'];
    var particles = [];
    var rockets = [];
    var snowflakes = [];

    for (var s = 0; s < 68; s++) {
      snowflakes.push({
        x: Math.random() * width,
        y: Math.random() * height * 0.7 - 40,
        vx: (Math.random() - 0.5) * 1.1,
        vy: 1.1 + Math.random() * 2.0,
        size: 2.0 + Math.random() * 2.8,
        alpha: 0.4 + Math.random() * 0.48
      });
    }

    function spawnRocket(waveIdx, indexInWave) {
      var spreadRatio = 0.06 + Math.random() * 0.88;
      rockets.push({
        x: width * spreadRatio,
        y: height + 16,
        vx: (Math.random() - 0.5) * 4.2,
        vy: -(10.5 + Math.random() * 5.8),
        targetY: height * (0.09 + Math.random() * 0.42),
        color: colors[(waveIdx * 5 + indexInWave) % colors.length],
        delayFrames: waveIdx * 52 + indexInWave * 7
      });
    }

    // 18 rockets across 3 grand volleys covering the full viewport width
    for (var w = 0; w < 3; w++) {
      for (var r = 0; r < 6; r++) {
        spawnRocket(w, r);
      }
    }

    function explode(x, y, baseColor) {
      var outerCount = 52;
      var innerCount = 20;
      var maxSpeedScale = Math.min(1.45, Math.max(0.95, Math.min(width, height) / 760));

      for (var i = 0; i < outerCount; i++) {
        var angle = (Math.PI * 2 * i) / outerCount + (Math.random() - 0.5) * 0.14;
        var speed = (3.4 + Math.random() * 6.8) * maxSpeedScale;
        particles.push({
          x: x,
          y: y,
          prevX: x,
          prevY: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: i % 5 === 0 ? '#f8fafc' : baseColor,
          alpha: 1,
          decay: 0.009 + Math.random() * 0.009,
          radius: 2.8 + Math.random() * 2.8
        });
      }

      for (var j = 0; j < innerCount; j++) {
        var innerAngle = (Math.PI * 2 * j) / innerCount + (Math.random() - 0.5) * 0.2;
        var innerSpeed = (1.4 + Math.random() * 3.2) * maxSpeedScale;
        particles.push({
          x: x,
          y: y,
          prevX: x,
          prevY: y,
          vx: Math.cos(innerAngle) * innerSpeed,
          vy: Math.sin(innerAngle) * innerSpeed,
          color: j % 2 === 0 ? '#fef08a' : '#f8fafc',
          alpha: 1,
          decay: 0.011 + Math.random() * 0.01,
          radius: 2.2 + Math.random() * 2.1
        });
      }
    }

    var rafId = 0;
    var stopped = false;
    var startTs = performance.now();
    var durationMs = 5400;

    function tick(now) {
      if (stopped || !ctx) {
        return;
      }
      var elapsed = now - startTs;
      ctx.clearRect(0, 0, width, height);

      // Lightweight drifting snow
      ctx.fillStyle = '#e0f2fe';
      for (var i = 0; i < snowflakes.length; i++) {
        var sf = snowflakes[i];
        sf.x += sf.vx + Math.sin(elapsed * 0.002 + i) * 0.4;
        sf.y += sf.vy;
        if (sf.y > height + 10) {
          sf.y = -10;
          sf.x = Math.random() * width;
        }
        ctx.globalAlpha = sf.alpha;
        ctx.beginPath();
        ctx.arc(sf.x, sf.y, sf.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rockets rising across waves
      for (var j = rockets.length - 1; j >= 0; j--) {
        var rk = rockets[j];
        if (rk.delayFrames > 0) {
          rk.delayFrames -= 1;
          continue;
        }
        var oldX = rk.x;
        var oldY = rk.y;
        rk.x += rk.vx;
        rk.y += rk.vy;
        rk.vy += 0.145;

        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = rk.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(oldX, oldY);
        ctx.lineTo(rk.x, rk.y);
        ctx.stroke();

        ctx.globalAlpha = 0.98;
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(rk.x, rk.y, 3.4, 0, Math.PI * 2);
        ctx.fill();

        if (rk.y <= rk.targetY || rk.vy >= -0.7) {
          explode(rk.x, rk.y, rk.color);
          rockets[j] = rockets[rockets.length - 1];
          rockets.pop();
        }
      }

      // Sparks with fast swap-and-pop removal & lightweight trail streaks (zero shadowBlur)
      for (var p = particles.length - 1; p >= 0; p--) {
        var pt = particles[p];
        pt.prevX = pt.x;
        pt.prevY = pt.y;
        pt.vx *= 0.976;
        pt.vy = pt.vy * 0.976 + 0.068;
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.alpha -= pt.decay;
        if (pt.alpha <= 0.025) {
          particles[p] = particles[particles.length - 1];
          particles.pop();
          continue;
        }

        ctx.globalAlpha = pt.alpha * 0.45;
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = pt.radius * 0.9;
        ctx.beginPath();
        ctx.moveTo(pt.prevX, pt.prevY);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();

        ctx.globalAlpha = pt.alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      if (elapsed < durationMs || particles.length > 0 || rockets.length > 0) {
        rafId = requestAnimationFrame(tick);
      } else {
        cleanup();
      }
    }

    var fadeTimer = setTimeout(function () {
      canvas.classList.add('is-fading');
      banner.classList.remove('is-visible');
    }, 5100);

    var removeTimer = setTimeout(function () {
      cleanup();
    }, 6100);

    function cleanup() {
      if (stopped) {
        return;
      }
      stopped = true;
      cancelAnimationFrame(rafId);
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
      canvas.remove();
      banner.remove();
      if (activeFireworksCleanup === cleanup) {
        activeFireworksCleanup = null;
      }
    }

    activeFireworksCleanup = cleanup;
    rafId = requestAnimationFrame(tick);
  }

  async function handleSnowmanEvent() {
    try {
      var data = await chrome.storage.local.get(SNOWMAN_MISSES_KEY);
      var raw = data && data[SNOWMAN_MISSES_KEY];
      var misses = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
      var triggered = core.rollSnowmanEvent(misses);
      if (triggered) {
        await chrome.storage.local.set({ [SNOWMAN_MISSES_KEY]: 0 });
        launchSnowmanFireworks();
      } else {
        await chrome.storage.local.set({ [SNOWMAN_MISSES_KEY]: misses + 1 });
      }
    } catch (_err) {
      // Ignore storage errors for optional festive effect
    }
  }

  async function triggerQuickReaction(descriptor, trigger, overrideReactionId) {
    if (!settings.enabled || !descriptor || !descriptor.postId) {
      return;
    }

    var postId = descriptor.postId;
    var currentState = postStateMap.get(postId);
    if (currentState && currentState.isOwn) {
      return;
    }
    if (inFlightPosts.has(postId)) {
      return;
    }

    var targetReactionId = overrideReactionId != null ? String(overrideReactionId) : String(settings.reactionId);
    inFlightPosts.add(postId);
    setPostStatus(postId, 'loading', 'Отправляется…');
    renderPostActions(descriptor, postStateMap.get(postId) || { exists: true, isComment: true, canReact: true, userReaction: null });

    try {
      var res = await callBridge('react', {
        postId: postId,
        reactionId: targetReactionId,
        trigger: trigger
      }, 10000);

      if (!res || !res.ok) {
        var errMsg = (res && res.error) || 'Не удалось поставить реакцию.';
        setPostStatus(postId, 'error', 'Ошибка', 3000);
        showPostToast(descriptor, errMsg, 'error');
        return;
      }

      var prevState = postStateMap.get(postId) || { exists: true, isComment: true, canReact: true };
      postStateMap.set(postId, {
        exists: true,
        isComment: true,
        canReact: prevState.canReact,
        userReaction: res.nextReactionId
      });

      if (core.shouldIncrementCounter(res)) {
        await incrementCounter(res.targetReactionId || targetReactionId);
        if (String(res.targetReactionId || targetReactionId) === core.SNOWMAN_REACTION_ID) {
          handleSnowmanEvent();
        }
        setPostStatus(postId, 'success', 'Готово', 1800);
      } else if (res.action === 'already_set') {
        setPostStatus(postId, 'info', 'Уже стоит', 1800);
        showPostToast(descriptor, 'Реакция уже стоит на этом посте.', 'info');
      } else {
        setPostStatus(postId, 'success', 'Готово', 1800);
      }
    } catch (err) {
      setPostStatus(postId, 'error', 'Ошибка', 3000);
      showPostToast(descriptor, (err && err.message) || 'Ошибка при отправке реакции.', 'error');
    } finally {
      inFlightPosts.delete(postId);
      renderPostActions(descriptor, postStateMap.get(postId));
      scheduleSync();
    }
  }

  async function triggerQuickReply(descriptor) {
    if (!settings.enabled || !settings.showQuickReplyButton || !descriptor || !descriptor.postId) {
      return;
    }
    var state = postStateMap.get(descriptor.postId);
    if (state && (state.isOwn || state.canReply === false)) {
      return;
    }

    try {
      var res = await callBridge('quick-reply', {
        postId: descriptor.postId,
        text: settings.quickReplyText
      }, 6000);
      if (!res || !res.ok) {
        showPostToast(descriptor, (res && res.error) || 'Не удалось вставить быстрый ответ.', 'error');
      }
    } catch (err) {
      showPostToast(descriptor, (err && err.message) || 'Ошибка открытия формы ответа.', 'error');
    }
  }

  document.addEventListener('pointerover', function (event) {
    var itemEl = resolveHoveredPostItem(event.target);
    if (itemEl) {
      lastHoveredItemEl = itemEl;
      updateHoveredPostHighlight(itemEl);
    } else if (event.target && typeof event.target.closest === 'function' && !event.target.closest('.PostStream-item')) {
      clearHoveredPostHighlight();
    }
  }, true);

  document.addEventListener('pointerleave', function () {
    clearHoveredPostHighlight();
  });

  window.addEventListener('blur', function () {
    clearHoveredPostHighlight();
  });

  document.addEventListener('click', function (event) {
    if (!settings.enabled) {
      return;
    }

    var favOpt = event.target && event.target.closest ? event.target.closest('.exbo-qr-fav-option') : null;
    if (favOpt) {
      event.preventDefault();
      event.stopPropagation();
      var optPostId = favOpt.dataset.postId;
      var optReactionId = favOpt.dataset.reactionId;
      openFavPostId = null;
      var optDesc = core.extractPostDescriptor(favOpt);
      if (optDesc && optReactionId) {
        triggerQuickReaction(optDesc, 'button', optReactionId);
      } else if (optPostId) {
        scheduleSync();
      }
      return;
    }

    var favToggle = event.target && event.target.closest ? event.target.closest('.exbo-qr-fav-toggle') : null;
    if (favToggle) {
      event.preventDefault();
      event.stopPropagation();
      var toggleDesc = core.extractPostDescriptor(favToggle);
      if (toggleDesc) {
        openFavPostId = openFavPostId === toggleDesc.postId ? null : toggleDesc.postId;
        scheduleSync();
      }
      return;
    }

    if (openFavPostId !== null && (!event.target || !event.target.closest || !event.target.closest('.exbo-qr-group'))) {
      openFavPostId = null;
      scheduleSync();
    }

    var replyTarget = event.target && event.target.closest ? event.target.closest('.exbo-qr-reply-btn') : null;
    if (replyTarget) {
      event.preventDefault();
      event.stopPropagation();
      var replyDesc = core.extractPostDescriptor(replyTarget);
      if (replyDesc) {
        triggerQuickReply(replyDesc);
      }
      return;
    }

    var target = event.target && event.target.closest ? event.target.closest('.exbo-qr-btn') : null;
    if (!target) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (settings.activationMode !== 'button' && settings.activationMode !== 'both') {
      return;
    }

    var descriptor = core.extractPostDescriptor(target);
    if (descriptor) {
      triggerQuickReaction(descriptor, 'button');
    }
  });

  // Capture phase prevents Flarum/editor handlers from swallowing dblclick inside post content
  document.addEventListener('dblclick', function (event) {
    if (!settings.enabled) {
      return;
    }
    if (settings.activationMode !== 'dblclick' && settings.activationMode !== 'both') {
      return;
    }

    if (!core.isDoubleClickOnPostContent(event.target)) {
      return;
    }

    var descriptor = core.extractPostDescriptor(event.target);
    if (!descriptor) {
      return;
    }

    var sel = window.getSelection ? window.getSelection() : null;
    if (sel && typeof sel.removeAllRanges === 'function') {
      sel.removeAllRanges();
    }

    triggerQuickReaction(descriptor, 'dblclick');
  }, true);

  document.addEventListener('keydown', function (event) {
    if (event.code === 'Escape' && openFavPostId !== null) {
      openFavPostId = null;
      scheduleSync();
    }

    if (!settings.enabled || !settings.hotkey) {
      return;
    }
    if (!core.matchesHotkey(event, settings.hotkey)) {
      return;
    }

    var targetEl = null;
    if (lastHoveredItemEl && document.contains(lastHoveredItemEl)) {
      targetEl = lastHoveredItemEl;
    } else if (document.activeElement && typeof document.activeElement.closest === 'function') {
      targetEl = document.activeElement.closest('.PostStream-item[data-id][data-type="comment"]');
    }

    var descriptor = targetEl ? core.extractPostDescriptor(targetEl) : null;
    if (!descriptor) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    triggerQuickReaction(descriptor, 'hotkey');
  }, true);

  function isExtensionNode(node) {
    if (!node || node.nodeType !== 1) {
      return false;
    }
    if (
      node.classList.contains('item-exbo-qr') ||
      node.classList.contains('item-exbo-qr-reply') ||
      node.classList.contains('exbo-qr-toast')
    ) {
      return true;
    }
    return Boolean(
      node.closest &&
      (node.closest('.item-exbo-qr') || node.closest('.item-exbo-qr-reply') || node.closest('.exbo-qr-toast'))
    );
  }

  var observer = new MutationObserver(function (mutations) {
    if (!settings.enabled) {
      return;
    }
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (isExtensionNode(m.target)) {
        continue;
      }
      var nodes = [].concat(Array.from(m.addedNodes || []), Array.from(m.removedNodes || []));
      for (var j = 0; j < nodes.length; j++) {
        if (!isExtensionNode(nodes[j])) {
          scheduleSync();
          return;
        }
      }
    }
  });

  function startObserver() {
    var root = document.getElementById('content') || document.body;
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
  }

  document.addEventListener(ROUTE_EVENT, function () {
    openFavPostId = null;
    setTimeout(scheduleSync, 50);
    setTimeout(scheduleSync, 300);
    setTimeout(scheduleSync, 900);
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') {
      return;
    }
    if (changes[SETTINGS_KEY]) {
      settings = core.normalizeSettings(changes[SETTINGS_KEY].newValue);
      syncHoverHighlightRootClass();
      if (!settings.enabled) {
        openFavPostId = null;
        clearHoveredPostHighlight();
        removeAllExtensionNodesFromRoot(document);
      } else {
        if (!settings.highlightHoveredPost) {
          clearHoveredPostHighlight();
        }
        scheduleSync();
      }
    }
  });

  function scheduleBootRetries() {
    [250, 800, 1800, 3500].forEach(function (delay) {
      setTimeout(function () {
        if (!appReadyOnce && settings.enabled) {
          scheduleSync();
        }
      }, delay);
    });
  }

  chrome.storage.local.get(SETTINGS_KEY).then(function (data) {
    settings = core.normalizeSettings(data && data[SETTINGS_KEY]);
    syncHoverHighlightRootClass();
    startObserver();
    if (settings.enabled) {
      scheduleSync();
      scheduleBootRetries();
    } else {
      removeAllExtensionNodesFromRoot(document);
    }
  });
})();
