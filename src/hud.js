const $ = (id) => document.getElementById(id);

export const setToast = (text) => ($('toast').textContent = text);
export const setWeatherLabel = (text) => ($('weather').textContent = text);
export const setFlyLabel = (flying) => ($('fly').textContent = flying ? '🛬 Hạ cánh' : '🚀 Bay');

export function updateHud({ speed, altitude, place, trafficLabel }) {
  $('speed').textContent = Math.round(Math.abs(speed) * 3.6);
  $('alt').textContent = 'Độ cao ' + Math.round(altitude) + ' m';
  $('traffic').textContent = '🚦 Giao thông: ' + trafficLabel;
  $('place').textContent = place;
}

export function bindButtons({ onFly, onWeather, onCamera, onCar, onReset }) {
  $('fly').onclick = onFly;
  $('mfly').onclick = onFly;
  $('rain').onclick = onWeather;
  $('camera').onclick = onCamera;
  $('car').onchange = (e) => onCar(+e.target.value);
  $('reset').onclick = onReset;
}
