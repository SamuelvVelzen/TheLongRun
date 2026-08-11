// src/lib/format.ts
function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "";
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
function formatPace(distanceMeters, movingSeconds) {
  if (!distanceMeters || !movingSeconds) return "";
  const pace = movingSeconds / (distanceMeters / 1e3);
  if (!Number.isFinite(pace) || pace <= 0) return "";
  const m = Math.floor(pace / 60);
  const s = Math.round(pace % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// src/lib/hr-zones.ts
var HR_ZONE_DEFS = [
  { zone: 1, label: "Recovery", minPct: 0, maxPct: 60 },
  { zone: 2, label: "Easy", minPct: 60, maxPct: 70 },
  { zone: 3, label: "Aerobic", minPct: 70, maxPct: 80 },
  { zone: 4, label: "Threshold", minPct: 80, maxPct: 90 },
  { zone: 5, label: "Max", minPct: 90, maxPct: 100 }
];
function zoneForHr(hr, hrMax) {
  if (!Number.isFinite(hr) || !Number.isFinite(hrMax) || hrMax <= 0) return 0;
  const pct = hr / hrMax * 100;
  for (const z of HR_ZONE_DEFS) {
    if (pct < z.maxPct || z.zone === 5) return z.zone;
  }
  return 5;
}
function bandShell(hrMax) {
  return HR_ZONE_DEFS.map((z) => ({
    zone: z.zone,
    label: z.label,
    minPct: z.minPct,
    maxPct: z.maxPct,
    minBpm: Math.round(z.minPct / 100 * hrMax),
    maxBpm: Math.round(z.maxPct / 100 * hrMax),
    seconds: 0,
    pct: 0
  }));
}
function buildHrZoneSummary(opts) {
  const hrMax = opts.hrMax != null && opts.hrMax > 0 ? Math.round(opts.hrMax) : null;
  if (hrMax == null) return null;
  const source = opts.source ?? "activity";
  const avgHr = opts.avgHr != null && Number.isFinite(opts.avgHr) && opts.avgHr > 0 ? Math.round(opts.avgHr) : null;
  const avgZone = avgHr != null ? zoneForHr(avgHr, hrMax) : null;
  const samples = (opts.samples ?? []).filter((s) => Number.isFinite(s.timeMs) && Number.isFinite(s.hr) && s.hr > 0).sort((a, b) => a.timeMs - b.timeMs);
  if (samples.length < 2) {
    return { hrMax, source, distribution: null, avgZone, avgHr };
  }
  const bands = bandShell(hrMax);
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].timeMs - samples[i - 1].timeMs) / 1e3;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 45) continue;
    const hr = samples[i].hr;
    const z = zoneForHr(hr, hrMax);
    const band = bands.find((b) => b.zone === z);
    if (band) {
      band.seconds += dt;
      total += dt;
    }
  }
  if (total <= 0) {
    return { hrMax, source, distribution: null, avgZone, avgHr };
  }
  for (const b of bands) {
    b.seconds = Math.round(b.seconds);
    b.pct = Math.round(b.seconds / total * 1e3) / 10;
  }
  return { hrMax, source, distribution: bands, avgZone, avgHr };
}

// src/lib/splits.ts
var EARTH_M = 6371e3;
var MAX_MOVING_GAP_S = 45;
function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function interpolateSample(a, b, t) {
  return {
    lat: lerp(a.lat, b.lat, t),
    lng: lerp(a.lng, b.lng, t),
    timeMs: a.timeMs != null && b.timeMs != null ? Math.round(lerp(a.timeMs, b.timeMs, t)) : void 0,
    hr: a.hr != null && b.hr != null ? Math.round(lerp(a.hr, b.hr, t)) : b.hr ?? a.hr,
    elev: a.elev != null && b.elev != null ? lerp(a.elev, b.elev, t) : b.elev ?? a.elev
  };
}
function movingSegSeconds(a, b, frac = 1) {
  if (a.timeMs == null || b.timeMs == null) return 0;
  const dt = (b.timeMs - a.timeMs) / 1e3 * frac;
  if (!Number.isFinite(dt) || dt <= 0 || dt > MAX_MOVING_GAP_S) return 0;
  return dt;
}
function computeRouteAnalytics(samples, opts) {
  const pts = samples.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0)
  );
  if (pts.length < 2) return null;
  const canPace = pts.filter((p) => p.timeMs != null && Number.isFinite(p.timeMs)).length >= 2;
  const splits = [];
  const kmMarkers = [];
  let cum = 0;
  let nextKm = 1e3;
  let splitStartCum = 0;
  let splitMoving = 0;
  const hrBuf = [];
  const finishSplit = (endCum, isPartial) => {
    const distM = endCum - splitStartCum;
    if (distM < 50) return;
    const distanceKm = Math.round(distM / 1e3 * 100) / 100;
    let seconds = 0;
    let pace = "";
    if (canPace) {
      seconds = Math.max(1, Math.round(splitMoving));
      pace = formatPace(distM, seconds);
      if (!pace) return;
    }
    const avgHr = hrBuf.length ? Math.round(hrBuf.reduce((a, b) => a + b, 0) / hrBuf.length) : null;
    splits.push({
      km: splits.length + 1,
      distanceKm,
      pace,
      seconds,
      avgHr,
      isPartial
    });
  };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = haversineMeters(a.lat, a.lng, b.lat, b.lng);
    if (!Number.isFinite(seg) || seg <= 0) continue;
    if (seg > 200) continue;
    const startCum = cum;
    const endCum = cum + seg;
    const fullMoving = canPace ? movingSegSeconds(a, b, 1) : 0;
    let consumed = 0;
    while (nextKm <= endCum) {
      const t = seg > 0 ? (nextKm - startCum) / seg : 0;
      const at = interpolateSample(a, b, Math.min(1, Math.max(0, t)));
      kmMarkers.push({ km: nextKm / 1e3, lat: at.lat, lng: at.lng });
      const frac = Math.min(1, Math.max(0, t)) - consumed;
      if (canPace && frac > 0) {
        splitMoving += movingSegSeconds(a, b, frac);
      }
      if (canPace) finishSplit(nextKm, false);
      splitStartCum = nextKm;
      splitMoving = 0;
      hrBuf.length = 0;
      if (at.hr != null && at.hr > 0) hrBuf.push(at.hr);
      consumed = Math.min(1, Math.max(0, t));
      nextKm += 1e3;
    }
    const remainFrac = 1 - consumed;
    if (canPace && remainFrac > 0) {
      splitMoving += fullMoving > 0 ? fullMoving * remainFrac : movingSegSeconds(a, b, remainFrac);
    }
    if (b.hr != null && b.hr > 0) hrBuf.push(b.hr);
    cum = endCum;
  }
  if (canPace && cum - splitStartCum >= 150) {
    finishSplit(cum, true);
  }
  const hrMax = opts?.profileMaxHr ?? opts?.maxHr ?? null;
  const hrSamplesFull = pts.filter((p) => p.timeMs != null && p.hr != null && p.hr > 0).map((p) => ({ timeMs: p.timeMs, hr: p.hr }));
  const hrZones = buildHrZoneSummary({
    hrMax,
    source: opts?.profileMaxHr != null ? "profile" : "activity",
    avgHr: opts?.avgHr ?? null,
    samples: hrSamplesFull
  });
  if (!splits.length && !kmMarkers.length && !hrZones) return null;
  return {
    splits: canPace ? splits : [],
    hrZones,
    kmMarkers,
    hrSamples: hrSamplesFull.map((s) => ({ t: Math.round(s.timeMs / 1e3), hr: s.hr }))
  };
}
function analyticsToProperties(analytics) {
  const series = analytics.hrSamples ?? [];
  const cap = 360;
  const step = series.length > cap ? (series.length - 1) / (cap - 1) : 1;
  const hrSeries = series.length > cap ? Array.from({ length: cap }, (_, i) => series[Math.round(i * step)]) : series;
  return {
    splits: analytics.splits,
    hr_zones: analytics.hrZones,
    km_markers: analytics.kmMarkers,
    hr_series: hrSeries.map((s) => [s.t, s.hr])
  };
}

// src/lib/server/gpx.ts
var MAX_MOVING_GAP_S2 = 45;
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, "i"));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
function child(block, name) {
  const m = block.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]+)</(?:\\w+:)?${name}>`, "i"));
  return m ? m[1].trim() : null;
}
function downsample(items, max) {
  if (items.length <= max) return items;
  const out = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
}
function parseGpx(xml) {
  const detectedType = child(xml, "type") ?? "";
  const blocks = xml.match(/<trkpt\b[^>]*>[\s\S]*?<\/trkpt>|<trkpt\b[^>]*\/>/gi) ?? [];
  const track = [];
  for (const block of blocks) {
    const openTag = block.match(/<trkpt\b[^>]*?(?:\/?>)/i)?.[0] ?? block;
    const lat = attr(openTag, "lat");
    const lon = attr(openTag, "lon");
    if (lat == null || lon == null) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || lat === 0 && lon === 0) continue;
    const sample = { lat, lng: lon };
    const timeStr = child(block, "time");
    if (timeStr) {
      const ms = Date.parse(timeStr);
      if (!Number.isNaN(ms)) sample.timeMs = ms;
    }
    const hr = child(block, "hr");
    if (hr != null) {
      const n = Number(hr);
      if (Number.isFinite(n) && n > 0) sample.hr = Math.round(n);
    }
    const ele = child(block, "ele");
    if (ele != null) {
      const n = Number(ele);
      if (Number.isFinite(n)) sample.elev = n;
    }
    track.push(sample);
  }
  const TZ = "Europe/Amsterdam";
  let date = "";
  let startClock = "";
  const firstTime = blocks.map((b) => child(b, "time")).find(Boolean) ?? child(xml, "time");
  if (firstTime) {
    const ms = Date.parse(firstTime);
    if (!Number.isNaN(ms)) {
      const d = new Date(ms);
      date = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(d);
      startClock = new Intl.DateTimeFormat("en-GB", {
        timeZone: TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(d);
    }
  }
  let distanceMeters = 0;
  let movingSeconds = 0;
  let elevGain = 0;
  const hrs = [];
  const series = [];
  for (let i = 0; i < track.length; i++) {
    const p = track[i];
    if (p.hr != null) hrs.push(p.hr);
    if (i > 0) {
      const a = track[i - 1];
      const seg = haversineMeters(a.lat, a.lng, p.lat, p.lng);
      if (Number.isFinite(seg) && seg > 0 && seg <= 200) {
        distanceMeters += seg;
        if (a.timeMs != null && p.timeMs != null) {
          const dt = (p.timeMs - a.timeMs) / 1e3;
          if (dt > 0 && dt <= MAX_MOVING_GAP_S2) movingSeconds += dt;
        }
      }
      if (a.elev != null && p.elev != null) {
        const d = p.elev - a.elev;
        if (d > 0 && d < 50) elevGain += d;
      }
    }
    if (p.timeMs != null) series.push({ t: p.timeMs, d: distanceMeters });
  }
  let maxSpeedKmh = 0;
  const WIN_MS = 5e3;
  for (let i = 0, j = 0; i < series.length; i++) {
    while (j < i && series[i].t - series[j].t > WIN_MS) j++;
    const dt = (series[i].t - series[j].t) / 1e3;
    if (dt >= 2) {
      const kmh = (series[i].d - series[j].d) / dt * 3.6;
      if (Number.isFinite(kmh) && kmh > maxSpeedKmh && kmh < 120) maxSpeedKmh = kmh;
    }
  }
  const first = track.find((p) => p.timeMs != null)?.timeMs ?? null;
  const last = [...track].reverse().find((p) => p.timeMs != null)?.timeMs ?? null;
  const elapsedSeconds = first != null && last != null ? Math.max(0, (last - first) / 1e3) : null;
  const distanceKm = distanceMeters > 0 ? Math.round(distanceMeters / 1e3 * 100) / 100 : null;
  const moving = movingSeconds > 0 ? Math.round(movingSeconds) : null;
  const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
  const maxHr = hrs.length ? Math.max(...hrs) : null;
  const analytics = track.length >= 2 ? computeRouteAnalytics(track, { avgHr, maxHr }) : null;
  return {
    date,
    startClock,
    distanceKm,
    movingSeconds: moving,
    time: moving != null ? formatDuration(moving) : "",
    elapsedTime: elapsedSeconds != null ? formatDuration(elapsedSeconds) : "",
    avgPace: distanceMeters && moving ? formatPace(distanceMeters, moving) : "",
    avgHr,
    maxHr,
    elevGain: elevGain > 0 ? Math.round(elevGain * 10) / 10 : null,
    maxSpeed: maxSpeedKmh > 0 ? Math.round(maxSpeedKmh * 10) / 10 : null,
    points: downsample(
      track.map((p) => ({ lat: p.lat, lng: p.lng })),
      2500
    ),
    analytics,
    detectedType
  };
}
export {
  analyticsToProperties,
  computeRouteAnalytics,
  parseGpx
};
