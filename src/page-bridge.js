(function () {
  'use strict';

  var REQ_EVENT = 'exbo-qr:request';
  var RES_EVENT = 'exbo-qr:response';
  var ROUTE_EVENT = 'exbo-qr:route-change';

  if (window.__exboQrBridgeInstalled) {
    return;
  }
  window.__exboQrBridgeInstalled = true;

  function serializeReactions() {
    try {
      if (!window.app || !window.app.forum || typeof window.app.forum.reactions !== 'function') {
        return [];
      }
      var fof = window.flarum && window.flarum.extensions && window.flarum.extensions['fof-reactions'];
      var emojiUtil = fof && fof.commonUtil && typeof fof.commonUtil.emoji === 'function'
        ? fof.commonUtil.emoji
        : null;

      return window.app.forum.reactions()
        .filter(function (r) {
          return r && typeof r.enabled === 'function' ? Boolean(r.enabled()) : true;
        })
        .map(function (r) {
          var id = String(r.id());
          var identifier = typeof r.identifier === 'function' ? r.identifier() : '';
          var display = typeof r.display === 'function' ? (r.display() || null) : null;
          var type = typeof r.type === 'function' ? r.type() : 'emoji';
          var emojiInfo = type === 'emoji' && emojiUtil ? emojiUtil(identifier) : null;

          return {
            id: id,
            identifier: identifier,
            display: display,
            type: type,
            enabled: true,
            uc: emojiInfo && emojiInfo.uc ? emojiInfo.uc : null,
            url: emojiInfo && emojiInfo.url ? emojiInfo.url : null
          };
        });
    } catch (_err) {
      return [];
    }
  }

  function getPostModel(postId) {
    if (!window.app || !window.app.store || typeof window.app.store.getById !== 'function') {
      return null;
    }
    var model = window.app.store.getById('posts', String(postId));
    if (!model || typeof model.id !== 'function' || String(model.id()) !== String(postId)) {
      return null;
    }
    return model;
  }

  function isCommentPostModel(post) {
    if (!post) {
      return false;
    }
    var contentType = typeof post.contentType === 'function'
      ? post.contentType()
      : (post.data && post.data.attributes ? post.data.attributes.contentType : null);
    return contentType === 'comment';
  }

  function handleGetContext(payload) {
    var postIds = Array.isArray(payload && payload.postIds) ? payload.postIds : [];
    var posts = {};
    var appReady = Boolean(window.app && window.app.store && window.app.forum);
    var allowAnon = appReady && typeof window.app.forum.attribute === 'function'
      ? Boolean(window.app.forum.attribute('fofReactionsAllowAnonymous'))
      : false;
    var isAuthenticated = Boolean(appReady && window.app.session && window.app.session.user);

    var sessionUserId = isAuthenticated && typeof window.app.session.user.id === 'function'
      ? String(window.app.session.user.id())
      : null;

    for (var i = 0; i < postIds.length; i++) {
      var id = String(postIds[i]);
      var post = getPostModel(id);
      if (!post || !isCommentPostModel(post)) {
        posts[id] = {
          exists: false,
          isComment: false,
          canReact: false,
          canReply: false,
          isOwn: false,
          userReaction: null
        };
        continue;
      }

      var userReaction = typeof post.userReaction === 'function' ? post.userReaction() : null;
      var canReact = typeof post.canReact === 'function' ? Boolean(post.canReact()) : false;
      var postUser = typeof post.user === 'function' ? post.user() : null;
      var postAuthorId = postUser && typeof postUser.id === 'function'
        ? String(postUser.id())
        : (post.data && post.data.relationships && post.data.relationships.user && post.data.relationships.user.data
          ? String(post.data.relationships.user.data.id)
          : null);
      var isOwn = Boolean(sessionUserId && postAuthorId && sessionUserId === postAuthorId);

      var disc = typeof post.discussion === 'function' ? post.discussion() : null;
      var discCanReply = disc && typeof disc.canReply === 'function' ? Boolean(disc.canReply()) : true;
      var postCanReply = typeof post.canReply === 'function' ? Boolean(post.canReply()) : true;
      var isHidden = typeof post.isHidden === 'function'
        ? Boolean(post.isHidden())
        : Boolean(post.data && post.data.attributes && post.data.attributes.isHidden);

      posts[id] = {
        exists: true,
        isComment: true,
        canReact: canReact,
        canReply: Boolean(isAuthenticated && discCanReply && postCanReply && !isHidden),
        isOwn: isOwn,
        userReaction: userReaction != null ? String(userReaction) : null
      };
    }

    return {
      ok: true,
      appReady: appReady,
      isAuthenticated: isAuthenticated,
      allowAnonymous: allowAnon,
      reactions: serializeReactions(),
      posts: posts
    };
  }

  function formatFlarumError(err) {
    if (!err) {
      return 'Не удалось выполнить запрос к форуму.';
    }
    if (err.status === 401) {
      return 'Требуется авторизация на форуме.';
    }
    if (err.status === 403) {
      return 'Нет прав для установки реакции.';
    }
    if (err.status === 429) {
      return 'Слишком много запросов. Попробуйте чуть позже.';
    }
    if (err.response && Array.isArray(err.response.errors) && err.response.errors[0]) {
      var first = err.response.errors[0];
      if (first.detail) {
        return String(first.detail);
      }
      if (first.code) {
        return 'Ошибка форума: ' + String(first.code);
      }
    }
    if (err.message) {
      return String(err.message);
    }
    return 'Ошибка при отправке реакции.';
  }

  function handleReact(payload) {
    var postId = payload && payload.postId != null ? String(payload.postId) : '';
    var targetReactionId = payload && payload.reactionId != null ? String(payload.reactionId) : '';
    var trigger = payload && payload.trigger ? String(payload.trigger) : 'button';

    if (!/^\d+$/.test(postId)) {
      return Promise.resolve({
        ok: false,
        code: 'INVALID_POST_ID',
        error: 'Некорректный ID поста.'
      });
    }

    if (!window.app || !window.app.store || !window.app.forum) {
      return Promise.resolve({
        ok: false,
        code: 'APP_NOT_READY',
        error: 'Приложение форума ещё не загрузилось.'
      });
    }

    var post = getPostModel(postId);
    if (!post || !isCommentPostModel(post)) {
      return Promise.resolve({
        ok: false,
        code: 'NO_MODEL',
        error: 'Модель поста не найдена.'
      });
    }

    var allowAnon = typeof window.app.forum.attribute === 'function'
      ? Boolean(window.app.forum.attribute('fofReactionsAllowAnonymous'))
      : false;
    var isAuthenticated = Boolean(window.app.session && window.app.session.user);

    if (!isAuthenticated && !allowAnon) {
      return Promise.resolve({
        ok: false,
        code: 'AUTH_REQUIRED',
        error: 'Войдите на форум, чтобы ставить реакции.'
      });
    }

    if (isAuthenticated && window.app.session.user) {
      var sessionId = typeof window.app.session.user.id === 'function' ? String(window.app.session.user.id()) : null;
      var postUser = typeof post.user === 'function' ? post.user() : null;
      var authorId = postUser && typeof postUser.id === 'function'
        ? String(postUser.id())
        : (post.data && post.data.relationships && post.data.relationships.user && post.data.relationships.user.data
          ? String(post.data.relationships.user.data.id)
          : null);
      if (sessionId && authorId && sessionId === authorId) {
        return Promise.resolve({
          ok: false,
          code: 'OWN_POST',
          error: 'Нельзя поставить реакцию на собственное сообщение.'
        });
      }
    }

    if (typeof post.canReact === 'function' && !post.canReact()) {
      return Promise.resolve({
        ok: false,
        code: 'FORBIDDEN',
        error: 'Вы не можете поставить реакцию на этот пост.'
      });
    }

    var forumReactions = typeof window.app.forum.reactions === 'function'
      ? window.app.forum.reactions()
      : [];
    var reactionModel = forumReactions.find(function (r) {
      return r && String(r.id()) === targetReactionId;
    }) || window.app.store.getById('reactions', targetReactionId);

    if (!reactionModel || (typeof reactionModel.enabled === 'function' && !reactionModel.enabled())) {
      return Promise.resolve({
        ok: false,
        code: 'INVALID_REACTION',
        error: 'Выбранная реакция недоступна на форуме.'
      });
    }

    var prevRaw = typeof post.userReaction === 'function' ? post.userReaction() : null;
    var prevReactionId = prevRaw != null ? String(prevRaw) : null;

    if ((trigger === 'dblclick' || trigger === 'hotkey') && prevReactionId === targetReactionId) {
      return Promise.resolve({
        ok: true,
        action: 'already_set',
        prevReactionId: prevReactionId,
        nextReactionId: prevReactionId,
        targetReactionId: targetReactionId
      });
    }

    return post.save({ reaction: targetReactionId }).then(function (updatedPost) {
      var targetPost = updatedPost || post;
      var nextRaw = typeof targetPost.userReaction === 'function' ? targetPost.userReaction() : null;
      var nextReactionId = nextRaw != null ? String(nextRaw) : null;

      if (window.m && typeof window.m.redraw === 'function') {
        window.m.redraw();
      }

      var action = 'updated';
      if (prevReactionId === targetReactionId && nextReactionId !== targetReactionId) {
        action = 'removed';
      } else if (prevReactionId && prevReactionId !== targetReactionId && nextReactionId === targetReactionId) {
        action = 'switched';
      } else if (nextReactionId === targetReactionId) {
        action = 'added';
      }

      return {
        ok: true,
        action: action,
        prevReactionId: prevReactionId,
        nextReactionId: nextReactionId,
        targetReactionId: targetReactionId
      };
    }).catch(function (err) {
      if (window.m && typeof window.m.redraw === 'function') {
        window.m.redraw();
      }
      return {
        ok: false,
        code: 'REQUEST_FAILED',
        status: err && err.status ? err.status : null,
        error: formatFlarumError(err)
      };
    });
  }

  function findComposerTextarea() {
    return document.querySelector(
      '.Composer textarea.FormControl, .Composer .TextEditor-editor, .Composer textarea, .TextEditor textarea'
    );
  }

  function applyTextToComposer(text) {
    if (window.app && window.app.composer && typeof window.app.composer.setFields === 'function') {
      window.app.composer.setFields({ content: text });
    }

    var editor = window.app && window.app.composer && window.app.composer.editor;
    if (editor && typeof editor.insertAtCursor === 'function') {
      var currentVal = typeof editor.value === 'function' ? editor.value() : '';
      if (!currentVal || currentVal.indexOf(text) === -1) {
        editor.insertAtCursor((currentVal && !/\s$/.test(currentVal) ? '\n' : '') + text);
        return true;
      }
      return true;
    }

    var textarea = findComposerTextarea();
    if (!textarea) {
      return false;
    }

    var cur = textarea.value || '';
    var next = cur && cur.trim() !== ''
      ? (cur.indexOf(text) !== -1 ? cur : cur.replace(/\s*$/, '') + '\n' + text)
      : text;

    var proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
    var setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
    if (setter && typeof setter.set === 'function') {
      setter.set.call(textarea, next);
    } else {
      textarea.value = next;
    }

    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.focus();
    if (typeof textarea.setSelectionRange === 'function') {
      textarea.setSelectionRange(next.length, next.length);
    }
    return true;
  }

  function handleQuickReply(payload) {
    var postId = payload && payload.postId != null ? String(payload.postId) : '';
    var text = payload && typeof payload.text === 'string' && payload.text.trim() !== ''
      ? payload.text
      : '@"kravv285"#1459207 дроноеб';

    if (!window.app || !window.app.session || !window.app.session.user) {
      return Promise.resolve({
        ok: false,
        error: 'Войдите на форум, чтобы написать ответ.'
      });
    }

    var targetPost = postId ? getPostModel(postId) : null;
    if (targetPost) {
      var sessId = typeof window.app.session.user.id === 'function' ? String(window.app.session.user.id()) : null;
      var pUser = typeof targetPost.user === 'function' ? targetPost.user() : null;
      var pAuthId = pUser && typeof pUser.id === 'function' ? String(pUser.id()) : null;
      var discModel = typeof targetPost.discussion === 'function' ? targetPost.discussion() : null;
      var allowDiscReply = discModel && typeof discModel.canReply === 'function' ? Boolean(discModel.canReply()) : true;
      var allowPostReply = typeof targetPost.canReply === 'function' ? Boolean(targetPost.canReply()) : true;
      if ((sessId && pAuthId && sessId === pAuthId) || !allowDiscReply || !allowPostReply) {
        return Promise.resolve({
          ok: false,
          error: 'На это сообщение нельзя отправить быстрый ответ.'
        });
      }
    }

    // 1. Open composer using native button or sandbox composer API
    if (window.app.composer && typeof window.app.composer.openReply === 'function') {
      window.app.composer.openReply(postId, text);
      return Promise.resolve({ ok: true });
    }

    var itemEl = postId
      ? document.querySelector('.PostStream-item[data-id="' + postId + '"][data-type="comment"]')
      : null;
    var nativeReplyBtn = itemEl ? itemEl.querySelector('.item-reply button') : null;
    if (nativeReplyBtn) {
      nativeReplyBtn.click();
    } else {
      var placeholder = document.querySelector('.ReplyPlaceholder');
      if (placeholder) {
        placeholder.click();
      }
    }

    return new Promise(function (resolve) {
      var attempts = 0;
      function tryFill() {
        attempts += 1;
        if (applyTextToComposer(text)) {
          resolve({ ok: true });
          return;
        }
        if (attempts >= 12) {
          resolve({
            ok: false,
            error: 'Не удалось открыть окно ответа форума.'
          });
          return;
        }
        setTimeout(tryFill, 50);
      }
      setTimeout(tryFill, 30);
    });
  }

  function sendResponse(requestId, result) {
    document.dispatchEvent(new CustomEvent(RES_EVENT, {
      detail: JSON.stringify({
        requestId: requestId,
        result: result
      })
    }));
  }

  document.addEventListener(REQ_EVENT, function (event) {
    var msg;
    try {
      msg = JSON.parse(event.detail);
    } catch (_err) {
      return;
    }
    if (!msg || !msg.requestId) {
      return;
    }

    if (msg.action === 'get-context') {
      sendResponse(msg.requestId, handleGetContext(msg.payload));
      return;
    }

    if (msg.action === 'react') {
      handleReact(msg.payload).then(function (res) {
        sendResponse(msg.requestId, res);
      });
      return;
    }

    if (msg.action === 'quick-reply') {
      handleQuickReply(msg.payload).then(function (res) {
        sendResponse(msg.requestId, res);
      });
    }
  });

  function notifyRouteChange() {
    document.dispatchEvent(new CustomEvent(ROUTE_EVENT, {
      detail: JSON.stringify({ href: window.location.href })
    }));
  }

  var origPushState = window.history.pushState;
  var origReplaceState = window.history.replaceState;

  window.history.pushState = function () {
    var ret = origPushState.apply(this, arguments);
    notifyRouteChange();
    return ret;
  };

  window.history.replaceState = function () {
    var ret = origReplaceState.apply(this, arguments);
    notifyRouteChange();
    return ret;
  };

  window.addEventListener('popstate', notifyRouteChange);
})();
