const enabled = document.getElementById('enabled');
const speed = document.getElementById('speed');
const value = document.getElementById('speed-value');

function updateLabel() {
  value.textContent = Number(speed.value).toFixed(2) + '×';
}

chrome.storage.local.get({ enabled: true, speed: 1 }, settings => {
  enabled.checked = settings.enabled;
  speed.value = settings.speed;
  updateLabel();
});
enabled.addEventListener('change', () => chrome.storage.local.set({ enabled: enabled.checked }));
speed.addEventListener('input', () => {
  updateLabel();
  chrome.storage.local.set({ speed: Number(speed.value) });
});
