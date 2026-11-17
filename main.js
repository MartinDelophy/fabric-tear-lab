import './styles.css';
import { createClothScene } from './scene.js';

const canvas = document.querySelector('#scene');
const status = document.querySelector('#status-text');
const modeButtons = document.querySelectorAll('[data-mode]');
const colorButtons = document.querySelectorAll('[data-color]');
const inputs = document.querySelectorAll('[data-setting]');
const hint = document.querySelector('#stage-hint');
const reset = document.querySelector('#reset');

let scene;
let mode = 'fabric';
let hasTear = false;

function updateStatus() {
  status.textContent = mode === 'water' ? '泼水模式' : hasTear ? '样片已撕裂' : '样片完好';
}

try {
  scene = createClothScene(canvas, {
    onReady: updateStatus,
    onTear: () => {
      hasTear = true;
      updateStatus();
    },
  });
  updateStatus();
} catch (error) {
  status.textContent = '3D 场景启动失败';
  hint.textContent = '请在开启硬件加速且支持 WebGL 2 的浏览器中打开。';
  document.querySelectorAll('.controls button, .controls input, .zoom button')
    .forEach((control) => { control.disabled = true; });
  console.error(error);
}

for (const button of modeButtons) {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    for (const control of modeButtons) control.setAttribute('aria-pressed', String(control === button));
    const waterMode = mode === 'water';
    document.querySelector('#fabric-settings').hidden = waterMode;
    document.querySelector('#water-settings').hidden = !waterMode;
    reset.textContent = waterMode ? '清除水分' : '重置样片';
    canvas.classList.toggle('is-water', waterMode);
    hint.textContent = waterMode ? '点击样片泼水 · 滚轮或双指缩放' : '拖拽样片 · 滚轮或双指缩放';
    scene.setMode(mode);
    updateStatus();
  });
}

for (const button of colorButtons) {
  button.addEventListener('click', () => {
    for (const swatch of colorButtons) swatch.setAttribute('aria-pressed', String(swatch === button));
    scene.setColor(button.dataset.color);
  });
}

function applySetting(input) {
  const multiplier = input.dataset.unit === '×';
  document.querySelector(`output[for="${input.id}"]`).value = multiplier
    ? `×${Number(input.value).toFixed(2)}`
    : `${input.value}%`;
  const ratio = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
  input.style.setProperty('--fill', `${ratio * 100}%`);
  scene?.setSetting(input.dataset.setting, Number(input.value));
}

for (const input of inputs) {
  applySetting(input);
  input.addEventListener('input', () => applySetting(input));
}

scene?.setColor(document.querySelector('[data-color][aria-pressed="true"]').dataset.color);
reset.addEventListener('click', () => {
  if (mode === 'water') {
    scene.clearWater();
  } else {
    scene.reset();
    hasTear = false;
  }
  updateStatus();
});
document.querySelector('#zoom-in').addEventListener('click', () => scene.zoom(1.15));
document.querySelector('#zoom-out').addEventListener('click', () => scene.zoom(1 / 1.15));
document.querySelector('#view-reset').addEventListener('click', () => scene.resetView());
