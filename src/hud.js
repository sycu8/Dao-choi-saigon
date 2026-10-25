const $ = (id) => document.getElementById(id);

export const setToast = (text) => ($('toast').textContent = text);
export const setWeatherLabel = (text) => ($('weather').textContent = text);
export const setFlyLabel = (flying) => ($('fly').textContent = flying ? '🛬 Hạ cánh' : '🚀 Bay');
export const setFps = (fps) => ($('fps').textContent = Math.round(fps) + ' FPS');
export const setQualityLabel = (name) => ($('quality').value = name);

const last = {};
function set(id, text) {
  if (last[id] === text) return;
  last[id] = text;
  $(id).textContent = text;
}

export function updateHud({ speed, altitude, place, trafficLabel, clock }) {
  set('speed', String(Math.round(Math.abs(speed) * 3.6)));
  set('alt', 'Độ cao ' + Math.round(altitude) + ' m');
  set('traffic', '🚦 Giao thông: ' + trafficLabel);
  set('place', place);
  set('clock', '🕒 ' + clock);
}

export function bindButtons({ onFly, onWeather, onCamera, onCar, onReset, onTime, onQuality }) {
  $('fly').onclick = onFly;
  $('mfly').onclick = onFly;
  $('rain').onclick = onWeather;
  $('camera').onclick = onCamera;
  $('time').onclick = onTime;
  $('car').onchange = (e) => onCar(+e.target.value);
  $('quality').onchange = (e) => onQuality(e.target.value);
  $('reset').onclick = onReset;
}
