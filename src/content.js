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
    var target = event.target;
    if (!target || typeof target.closest !== 'function') {
      return;
    }
    var itemEl = target.closest('.PostStream-item[data-id][data-type="comment"]');
    if (itemEl) {
      lastHoveredItemEl = itemEl;
    }
  }, true);

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
      if (!settings.enabled) {
        openFavPostId = null;
        removeAllExtensionNodesFromRoot(document);
      } else {
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
    startObserver();
    if (settings.enabled) {
      scheduleSync();
      scheduleBootRetries();
    } else {
      removeAllExtensionNodesFromRoot(document);
    }
  });
})();
