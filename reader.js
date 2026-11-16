(() => {
  const assistant = '[data-message-author-role="assistant"]';
  const turnRoot = '[data-testid^="conversation-turn-"], article, [data-turn="assistant"]';
  const moreActions = 'button[aria-haspopup="menu"][aria-label*="More" i], button[data-testid="more-actions-turn-action-button"]';
  const readLabel = /^(read aloud|ज़ोर से पढ़ें|जोर से पढ़ें)$/i;
  const readButton = [
    '[data-testid="voice-play-turn-action-button"]',
    'button[aria-label^="Read aloud" i]',
    'button[title^="Read aloud" i]'
  ].join(', ');
  const generationStop = '[data-testid="stop-button"], button[aria-label^="Stop generating" i], [data-testid="composer-stop-button"]';
  const replies = () => [...document.querySelectorAll(assistant)];
  const key = node => node.getAttribute('data-message-id') || node;
  let seen = new Set(replies().map(key));
  const directActions = () => [...document.querySelectorAll(readButton)];
  const actionKey = action => {
    const turn = action.closest('[data-turn-id], [data-testid^="conversation-turn-"], article');
    const message = turn && [...turn.querySelectorAll(assistant)].at(-1);
    return (message && key(message)) || turn || action;
  };
  let seenActions = new Set(directActions().map(actionKey));
  let pathname = location.pathname;
  let sentAt = -Infinity;
  let quietUntil = Date.now() + 3000;

  function absorbHistory(nodes, actions) {
    for (const node of nodes) {
      if (!seen.has(key(node))) quietUntil = Math.max(quietUntil, Date.now() + 1500);
      seen.add(key(node));
    }
    for (const action of actions) {
      const id = actionKey(action);
      if (!seenActions.has(id)) quietUntil = Math.max(quietUntil, Date.now() + 1500);
      seenActions.add(id);
    }
  }
  let actionCandidate;

  function expectReply() {
    sentAt = Date.now();
    quietUntil = 0;
    seen = new Set(replies().map(key));
    seenActions = new Set(directActions().map(actionKey));
    candidate = null;
    actionCandidate = null;
  }
  let candidate;
  let openingMenu = false;

  function findAction(node, selector) {
    for (let scope = node; scope; scope = scope.parentElement) {
      if (scope !== node && !scope.matches(turnRoot)) continue;
      const messages = scope.querySelectorAll(assistant);
      if (messages.length > 1 && messages[messages.length - 1] !== node) break;
      const action = [...scope.querySelectorAll(selector)].find(button =>
        node.contains(button) ||
        Boolean(node.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
      if (action) return action;
    }
    return null;
  }

  function findFollowingReadButton(node) {
    const following = element => Boolean(
      node.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    const button = directActions().find(following);
    if (!button) return null;

    // The action can be a sibling of the reply. Reject buttons beyond the
    // next message, or buttons explicitly owned by another assistant turn.
    const nextMessage = [...document.querySelectorAll('[data-message-author-role]')]
      .find(message => !node.contains(message) && following(message));
    if (nextMessage && (nextMessage.compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_FOLLOWING)) return null;
    const ownerTurn = button.closest(turnRoot);
    if (ownerTurn && ownerTurn.querySelector(assistant) && !ownerTurn.contains(node)) return null;
    return button;
  }

  function play(node, action) {
    if (!action || action.disabled || action.getAttribute('aria-disabled') === 'true') return false;
    if (node) seen.add(key(node));
    seenActions.add(actionKey(action));
    console.debug('[ChatGPT Auto Read] Clicking native Read aloud');
    candidate = null;
    action.click();
    return true;
  }

  async function readFromMenu(node, trigger) {
    openingMenu = true;
    const originalPath = pathname;
    const existingMenus = new Set(document.querySelectorAll('[role="menu"]'));
    try {
      trigger.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true
      }));
      if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 150));
        if (!enabled || originalPath !== location.pathname || replies().at(-1) !== node ||
            document.querySelector(generationStop)) return;
        const menuId = trigger.getAttribute('aria-controls');
        const menu = (menuId && document.getElementById(menuId)) ||
          [...document.querySelectorAll('[role="menu"]')].find(item => !existingMenus.has(item));
        const action = menu && (menu.querySelector(readButton) ||
          [...menu.querySelectorAll('[role="menuitem"], button')].find(item =>
            [item.getAttribute('aria-label'), item.textContent].some(label => readLabel.test(label?.trim() || ''))));
        if (play(node, action)) return;
      }
      if (trigger.getAttribute('aria-expanded') === 'true') {
        const menuId = trigger.getAttribute('aria-controls');
        const menu = (menuId && document.getElementById(menuId)) ||
          [...document.querySelectorAll('[role="menu"]')].find(item => !existingMenus.has(item));
        menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      if (candidate?.key === key(node)) candidate.retryAt = Date.now() + 5000;
    } finally {
      openingMenu = false;
    }
  }
  let enabled = false;
  let ready = false;
  const updateSpeed = value => document.documentElement.setAttribute('data-auto-read-speed', String(value ?? 1));

  chrome.storage.local.onChanged.addListener(changes => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue ?? true;
      quietUntil = Date.now() + 1500;
      seen = new Set(replies().map(key));
      seenActions = new Set(directActions().map(actionKey));
      candidate = null;
    }
    if (changes.speed) updateSpeed(changes.speed.newValue);
  });
  chrome.storage.local.get({ enabled: true, speed: 1 }, settings => {
    enabled = settings.enabled;
    updateSpeed(settings.speed);
    ready = true;
  });

  document.addEventListener('click', event => {
    if (event.isTrusted && event.target.closest?.(
      '[data-testid="send-button"], [data-testid="regenerate-button"], [data-testid="composer-submit-button"]:not([aria-label*="Stop" i])'
    )) expectReply();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.isTrusted && event.key === 'Enter' && !event.shiftKey && !event.isComposing &&
        event.target.closest?.('#prompt-textarea')) expectReply();
  }, true);

  function checkReply() {
    const nodes = replies();
    if (pathname !== location.pathname) {
      const justStartedChat = !pathname.includes('/c/') &&
        location.pathname.includes('/c/') && Date.now() - sentAt < 30000;
      pathname = location.pathname;
      if (!justStartedChat) {
        quietUntil = Date.now() + 3000;
        seen = new Set(nodes.map(key));
        seenActions = new Set(directActions().map(actionKey));
        candidate = null;
        actionCandidate = null;
        return;
      }
    }

    if (!ready || !enabled || openingMenu) return;
    const generating = Boolean(document.querySelector(generationStop));
    const actions = directActions();
    if (Date.now() < quietUntil) {
      if (!generating) {
        absorbHistory(nodes, actions);
        return;
      }
      quietUntil = 0;
    }
    if (generating) {
      candidate = null;
      actionCandidate = null;
      return;
    }

    const node = nodes.at(-1);
    const freshNode = node && !seen.has(key(node));
    const action = actions.at(-1);
    if (action && !seenActions.has(actionKey(action)) &&
        (!node || node.contains(action) ||
          Boolean(node.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING))) {
      if (actionCandidate?.action !== action) actionCandidate = { action, since: Date.now() };
      if (Date.now() - actionCandidate.since >= 1400 && play(freshNode ? node : null, action)) return;
    }

    if (!freshNode) return;
    const text = (node.querySelector('.markdown') || node).textContent?.trim();
    if (!text) {
      candidate = null;
      return;
    }
    if (candidate?.key !== key(node) || candidate.text !== text) {
      candidate = { key: key(node), text, since: Date.now() };
      return;
    }
    if (Date.now() - candidate.since < 1400) return;

    const direct = findAction(node, readButton) || findFollowingReadButton(node);
    if (direct && !seenActions.has(actionKey(direct)) && play(node, direct)) return;
    const trigger = findAction(node, moreActions);
    if (trigger && Date.now() >= (candidate.retryAt || 0)) void readFromMenu(node, trigger);
  }

  const timer = setInterval(checkReply, 350);
  window.addEventListener('pagehide', event => {
    if (!event.persisted) clearInterval(timer);
  });
})();
