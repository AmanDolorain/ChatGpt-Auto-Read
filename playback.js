(() => {
  const speedAttribute = 'data-auto-read-speed';
  const readAction = '[data-testid="voice-play-turn-action-button"], button[aria-label="Read aloud" i], button[title="Read aloud" i]';
  const originalPlay = HTMLMediaElement.prototype.play;
  let readRequestedAt = -Infinity;
  let readAudio;

  function applySpeed() {
    const speed = Number(document.documentElement.getAttribute(speedAttribute) || 1);
    if (readAudio && speed >= 0.5 && speed <= 2) readAudio.playbackRate = speed;
  }

  document.addEventListener('click', event => {
    const menuItem = event.target.closest?.('[role="menuitem"]');
    if (event.target.closest?.(readAction) || [menuItem?.getAttribute('aria-label'), menuItem?.textContent]
      .some(label => /^(read aloud|ज़ोर से पढ़ें|जोर से पढ़ें)$/i.test(label?.trim() || ''))) {
      readRequestedAt = Date.now();
    }
  }, true);

  // ChatGPT can create an audio element without attaching it to the document.
  HTMLMediaElement.prototype.play = function (...args) {
    if (this instanceof HTMLAudioElement && Date.now() - readRequestedAt < 30000) {
      readAudio = this;
      readRequestedAt = -Infinity;
      applySpeed();
    }
    return Reflect.apply(originalPlay, this, args);
  };

  function observeSpeed() {
    new MutationObserver(applySpeed).observe(document.documentElement, {
      attributes: true,
      attributeFilter: [speedAttribute]
    });
    applySpeed();
  }
  if (document.documentElement) observeSpeed();
  else document.addEventListener('DOMContentLoaded', observeSpeed, { once: true });
})();
