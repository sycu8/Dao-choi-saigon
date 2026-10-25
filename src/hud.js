const $ = (id) => document.getElementById(id);

export const setToast = (text) => ($('toast').textContent = text);
export const setWeatherLabel = (text) => ($('weather').textContent = text);
export const setFlyLabel = (flying) => ($('fly').textContent = flying ? '🛬 Hạ cánh' : '🚀 Bay');
export const setFps = (fps) => ($('fps').textContent = Math.round(fps) + ' FPS');
export const setQualityLabel = (name) => ($('quality').value = name);
export const setMuteLabel = (muted) => {
  $('sound').textContent = $('psound').textContent = muted ? '🔇 Tắt tiếng' : '🔊 Âm thanh';
};
export const setQualityButtons = (name) => document.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('sel', b.dataset.q === name));
export const setPaused = (on) => $('pause').classList.toggle('on', on);

const formatTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

export function updateMissionHud(mission, objective, bearing, altitude) {
  const el = $('mission');
  el.classList.toggle('on', !!mission);
  if (!mission) return;
  set('mtitle', `${mission.title}${mission.legs.length > 1 ? ` · ${mission.leg + 1}/${mission.legs.length}` : ''}`);
  set('mtext', objective.text);
  let dist = Math.round(bearing.dist) + ' m';
  if (objective.alt !== null) {
    const dy = objective.alt - altitude;
    dist += Math.abs(dy) > 12 ? (dy > 0 ? ` · ↑ ${Math.round(dy)} m` : ` · ↓ ${Math.round(-dy)} m`) : ' · ✓ độ cao';
  }
  set('mdist', dist);
  set('mtimer', '⏱ ' + formatTime(mission.time));
  $('mtimer').classList.toggle('warn', mission.time < 15);
  $('marrow').style.transform = `rotate(${bearing.angle.toFixed(2)}rad)`;
}

export function updateProgress({ energy, money, score }) {
  const e = $('energy');
  const w = Math.round(energy) + '%';
  if (e.style.width !== w) e.style.width = w;
  e.classList.toggle('low', energy < 20);
  set('money', `💰 ${money} · ⭐ ${score}`);
}

export function setStats(rows) {
  $('pstats').innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
}

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

export function bindButtons({ onFly, onWeather, onCamera, onCar, onReset, onTime, onQuality, onMute, onMission, onPause, onCancel, onStunt }) {
  $('sound').onclick = $('psound').onclick = onMute;
  $('missionBtn').onclick = onMission;
  $('pauseBtn').onclick = $('resume').onclick = onPause;
  $('pcamera').onclick = onCamera;
  $('ptime').onclick = onTime;
  $('pcancel').onclick = onCancel;
  $('preset').onclick = onReset;
  document.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => onQuality(b.dataset.q)));
  $('fly').onclick = onFly;
  $('mfly').onclick = onFly;
  $('stunt').onclick = onStunt;
  $('mstunt').onclick = onStunt;
  $('rain').onclick = onWeather;
  $('camera').onclick = onCamera;
  $('time').onclick = onTime;
  $('car').onchange = (e) => onCar(+e.target.value);
  $('quality').onchange = (e) => onQuality(e.target.value);
  $('reset').onclick = onReset;
}
