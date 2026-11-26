(function (global) {
  'use strict';

  var DEFAULT_REACTIONS = [
    { id: '32', identifier: 'blue_heart', uc: '💙', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f499/512.png', type: 'emoji', enabled: true },
    { id: '33', identifier: 'fire', uc: '🔥', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.png', type: 'emoji', enabled: true },
    { id: '34', identifier: 'joyful', uc: '😂', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.png', type: 'emoji', enabled: true },
    { id: '35', identifier: 'thumbsup', uc: '👍', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44d/512.png', type: 'emoji', enabled: true },
    { id: '38', identifier: 'sob', uc: '😭', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f62d/512.png', type: 'emoji', enabled: true },
    { id: '39', identifier: 'pout', uc: '😡', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f621/512.png', type: 'emoji', enabled: true },
    { id: '40', identifier: 'thumbsdown', uc: '👎', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44e/512.png', type: 'emoji', enabled: true },
    { id: '42', identifier: 'grin', uc: '😁', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f601/512.png', type: 'emoji', enabled: true },
    { id: '43', identifier: 'thinking', uc: '🤔', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f914/512.png', type: 'emoji', enabled: true },
    { id: '44', identifier: 'pray', uc: '🙏', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f64f/512.png', type: 'emoji', enabled: true },
    { id: '45', identifier: 'love', uc: '🥰', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f970/512.png', type: 'emoji', enabled: true },
    { id: '46', identifier: 'tada', uc: '🎉', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f389/512.png', type: 'emoji', enabled: true },
    { id: '47', identifier: 'clown', uc: '🤡', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f921/512.png', type: 'emoji', enabled: true },
    { id: '48', identifier: 'scream', uc: '😱', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f631/512.png', type: 'emoji', enabled: true },
    { id: '50', identifier: 'imp', uc: '😈', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f608/512.png', type: 'emoji', enabled: true },
    { id: '51', identifier: 'salute', uc: '🫡', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1fae1/512.png', type: 'emoji', enabled: true },
    { id: '52', identifier: 'broken_heart', uc: '💔', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f494/512.png', type: 'emoji', enabled: true },
    { id: '54', identifier: 'clap', uc: '👏', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44f/512.png', type: 'emoji', enabled: true },
    { id: '55', identifier: 'vomiting', uc: '🤮', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f92e/512.png', type: 'emoji', enabled: true },
    { id: '56', identifier: 'cry', uc: '😢', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f622/512.png', type: 'emoji', enabled: true },
    { id: '57', identifier: 'eyes', uc: '👀', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f440/512.png', type: 'emoji', enabled: true },
    { id: '59', identifier: 'exploding_head', uc: '🤯', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f92f/512.png', type: 'emoji', enabled: true },
    { id: '60', identifier: 'sleeping', uc: '😴', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f634/512.png', type: 'emoji', enabled: true },
    { id: '61', identifier: 'white_check_mark', uc: '✅', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/2705/512.png', type: 'emoji', enabled: true },
    { id: '63', identifier: '100', uc: '💯', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4af/512.png', type: 'emoji', enabled: true },
    { id: '65', identifier: 'moai', uc: '🗿', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f5ff/512.png', type: 'emoji', enabled: true },
    { id: '67', identifier: 'new_moon_face', uc: '🌚', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f31a/512.png', type: 'emoji', enabled: true },
    { id: '68', identifier: 'handshake', uc: '🤝', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f91d/512.png', type: 'emoji', enabled: true },
    { id: '69', identifier: 'mammoth', uc: '🦣', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f9a3/512.png', type: 'emoji', enabled: true },
    { id: '72', identifier: 'yawn', uc: '🥱', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f971/512.png', type: 'emoji', enabled: true },
    { id: '73', identifier: 'nerd', uc: '🤓', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f913/512.png', type: 'emoji', enabled: true },
    { id: '74', identifier: 'fist', uc: '✊', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/270a/512.png', type: 'emoji', enabled: true },
    { id: '75', identifier: 'gorilla', uc: '🦍', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f98d/512.png', type: 'emoji', enabled: true },
    { id: '76', identifier: 'pill', uc: '💊', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f48a/512.png', type: 'emoji', enabled: true },
    { id: '77', identifier: 'candle', uc: '🕯', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f56f/512.png', type: 'emoji', enabled: true },
    { id: '80', identifier: 'poop', uc: '💩', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4a9/512.png', type: 'emoji', enabled: true },
    { id: '81', identifier: 'frog_face', uc: '🐸', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f438/512.png', type: 'emoji', enabled: true },
    { id: '82', identifier: 'scull', uc: '💀', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f480/512.png', type: 'emoji', enabled: true },
    { id: '83', identifier: 'heart', uc: '❤', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/2764/512.png', type: 'emoji', enabled: true },
    { id: '84', identifier: 'zap', uc: '⚡', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/26a1/512.png', type: 'emoji', enabled: true },
    { id: '85', identifier: 'robot', uc: '🤖', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f916/512.png', type: 'emoji', enabled: true },
    { id: '86', identifier: 'wilted_rose', uc: '🥀', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f940/512.png', type: 'emoji', enabled: true },
    { id: '87', identifier: 'eagle', uc: '🦅', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f985/512.png', type: 'emoji', enabled: true },
    { id: '88', identifier: 'expressionless', uc: '😑', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f611/512.png', type: 'emoji', enabled: true },
    { id: '89', identifier: 'snowman', uc: '⛄', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/26c4/512.png', type: 'emoji', enabled: true }
  ];

  global.EXBO_QR_CATALOG = {
    DEFAULT_REACTIONS: DEFAULT_REACTIONS
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
