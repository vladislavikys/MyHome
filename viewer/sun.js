// Положение солнца по дате, времени и координатам (упрощённый алгоритм NOAA, точность ~0,5°).
// Высота el и азимут az — в градусах; азимут от севера по часовой стрелке (90° — восток).

const RAD = Math.PI / 180;

export function sunPosition(utcMs, lat, lon) {
  const d = utcMs / 86400000 + 2440587.5 - 2451545.0;          // сутки от J2000
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const H = (gmst * 15 + lon) * RAD - ra;
  const la = lat * RAD;
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H) * Math.cos(dec), Math.sin(dec) * Math.cos(la) - Math.cos(dec) * Math.sin(la) * Math.cos(H));
  return { el: el / RAD, az: ((az / RAD) + 360) % 360 };
}

// Местное время (часы, дробные) → UTC-миллисекунды для даты 'YYYY-MM-DD' и пояса tz (часы).
export function localToUtc(dateStr, hours, tz) {
  const [y, m, dd] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, dd) + (hours - tz) * 3600e3;
}

// Восход и закат (местное время, часы) — по пересечению высоты −0,833°.
export function sunTimes(dateStr, lat, lon, tz) {
  let rise = null, set = null, prev = null;
  for (let m = 0; m <= 24 * 60; m += 5) {
    const el = sunPosition(localToUtc(dateStr, m / 60, tz), lat, lon).el + 0.833;
    if (prev !== null) {
      if (prev < 0 && el >= 0 && rise === null) rise = (m - 5 * el / (el - prev)) / 60;
      if (prev >= 0 && el < 0) set = (m - 5 * el / (el - prev)) / 60;
    }
    prev = el;
  }
  return { rise, set };
}

export const fmtTime = h => {
  if (h == null) return '—';
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
