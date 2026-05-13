const PROBE_PATH = "/__origin_latency_probe";
const INTERVAL_MS = 5000;
const MAX_SAMPLES = 120;
const REQUEST_TIMEOUT_MS = 4000;
const RESUME_THRESHOLD_MS = INTERVAL_MS * 3;

const state = {
  samples: [],
  warmSamples: [],
  coldLatency: null,
  lastProbeStartedAt: 0,
  totalChecks: 0,
  successfulChecks: 0,
  consecutiveFailures: 0,
  timer: null,
  chartPoints: [],
  hoverPoint: null,
};

const els = {
  status: document.getElementById("status"),
  statusText: document.getElementById("statusText"),
  latestLatency: document.getElementById("latestLatency"),
  averageLatency: document.getElementById("averageLatency"),
  averageJitter: document.getElementById("averageJitter"),
  coldLatency: document.getElementById("coldLatency"),
  sampleWindow: document.getElementById("sampleWindow"),
  successRate: document.getElementById("successRate"),
  lastCheck: document.getElementById("lastCheck"),
  appName: document.getElementById("appName"),
  canvas: document.getElementById("latencyChart"),
  chartTooltip: document.getElementById("chartTooltip"),
};

function formatMs(value) {
  if (!Number.isFinite(value)) return "--";
  if (value < 100) return value.toFixed(1);
  return Math.round(value).toString();
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageJitter(samples) {
  if (samples.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < samples.length; i += 1) {
    diffs.push(Math.abs(samples[i].latency - samples[i - 1].latency));
  }
  return average(diffs);
}

function nowLabel(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isResumeSample(startedAt) {
  return state.lastProbeStartedAt > 0 && startedAt - state.lastProbeStartedAt > RESUME_THRESHOLD_MS;
}

function pushSample(sample) {
  state.samples.push(sample);
  if (state.samples.length > MAX_SAMPLES) {
    state.samples.shift();
  }

  if (sample.kind === "warm") {
    state.warmSamples.push(sample);
    if (state.warmSamples.length > MAX_SAMPLES) {
      state.warmSamples.shift();
    }
  }
}

function setStatus(kind, text) {
  els.status.classList.remove("ok", "error");
  if (kind) els.status.classList.add(kind);
  els.statusText.textContent = text;
}

async function runProbe() {
  const startedAtWall = Date.now();
  const startedAt = performance.now();
  const coldOrResume = state.coldLatency === null || isResumeSample(startedAtWall);
  state.lastProbeStartedAt = startedAtWall;
  state.totalChecks += 1;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const nonce = `${startedAtWall}-${Math.random().toString(16).slice(2)}`;
  const url = `${PROBE_PATH}?ts=${encodeURIComponent(startedAtWall)}&nonce=${encodeURIComponent(nonce)}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    const endedAt = performance.now();
    const latency = endedAt - startedAt;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const kind = coldOrResume ? "cold" : "warm";
    const sample = {
      kind,
      latency,
      at: new Date(),
    };

    if (kind === "cold" && state.coldLatency === null) {
      state.coldLatency = latency;
    }

    pushSample(sample);
    state.successfulChecks += 1;
    state.consecutiveFailures = 0;
    if (payload.app) {
      els.appName.textContent = payload.app;
    }
    setStatus("ok", "Online");
  } catch (error) {
    pushSample({
      kind: "error",
      latency: null,
      at: new Date(),
      error: error.name === "AbortError" ? "Timeout" : error.message,
    });
    state.consecutiveFailures += 1;
    setStatus("error", state.consecutiveFailures > 1 ? `${state.consecutiveFailures} failures` : "Error");
  } finally {
    window.clearTimeout(timeout);
    render();
  }
}

function updateMetrics() {
  const latestWarm = state.warmSamples[state.warmSamples.length - 1];
  const warmLatencies = state.warmSamples.map((sample) => sample.latency);
  const avgLatency = average(warmLatencies);
  const avgJitter = averageJitter(state.warmSamples);
  const successRate = state.totalChecks
    ? `${Math.round((state.successfulChecks / state.totalChecks) * 100)}%`
    : "--";
  const lastSample = state.samples[state.samples.length - 1];

  els.latestLatency.textContent = latestWarm ? formatMs(latestWarm.latency) : "--";
  els.averageLatency.textContent = formatMs(avgLatency);
  els.averageJitter.textContent = formatMs(avgJitter);
  els.coldLatency.textContent = formatMs(state.coldLatency);
  els.sampleWindow.textContent = `${state.warmSamples.length} / ${MAX_SAMPLES}`;
  els.successRate.textContent = successRate;
  els.lastCheck.textContent = lastSample ? nowLabel(lastSample.at) : "--";
}

function drawChart() {
  const canvas = els.canvas;
  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.round(rect.width * ratio));
  const height = Math.max(240, Math.round(rect.height * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.scale(ratio, ratio);

  const cssWidth = width / ratio;
  const cssHeight = height / ratio;
  const pad = { top: 24, right: 44, bottom: 34, left: 54 };
  const plotWidth = cssWidth - pad.left - pad.right;
  const plotHeight = cssHeight - pad.top - pad.bottom;
  const latencies = state.samples
    .filter((sample) => Number.isFinite(sample.latency))
    .map((sample) => sample.latency);
  const maxLatency = Math.max(50, Math.ceil((Math.max(...latencies, 0) * 1.2) / 10) * 10);

  context.font = "12px system-ui, sans-serif";
  context.lineWidth = 1;
  context.strokeStyle = "#e8edf2";
  context.fillStyle = "#8b95a1";

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (plotHeight / 4) * i;
    const value = maxLatency - (maxLatency / 4) * i;
    context.beginPath();
    context.moveTo(pad.left, y);
    context.lineTo(pad.left + plotWidth, y);
    context.stroke();
    context.fillText(`${Math.round(value)}ms`, 12, y + 4);
  }

  context.strokeStyle = "#eef2f6";
  for (let i = 0; i <= 6; i += 1) {
    const x = pad.left + (plotWidth / 6) * i;
    context.beginPath();
    context.moveTo(x, pad.top);
    context.lineTo(x, pad.top + plotHeight);
    context.stroke();
  }

  if (!state.samples.length) {
    context.fillStyle = "#9ca3af";
    context.fillText("Collecting first sample", pad.left + 12, pad.top + 30);
    drawEmptySparkline(context, pad, plotWidth, plotHeight);
    context.setTransform(1, 0, 0, 1, 0, 0);
    updateTooltip();
    return;
  }

  if (state.samples.length < 3) {
    drawEmptySparkline(context, pad, plotWidth, plotHeight);
  }

  const xFor = (index) => {
    if (MAX_SAMPLES === 1) return pad.left;
    return pad.left + (plotWidth * index) / (MAX_SAMPLES - 1);
  };
  const yFor = (latency) => pad.top + plotHeight - (latency / maxLatency) * plotHeight;
  const offset = Math.max(0, MAX_SAMPLES - state.samples.length);
  state.chartPoints = [];

  context.strokeStyle = "#0f766e";
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  let drawing = false;
  state.samples.forEach((sample, index) => {
    const x = xFor(offset + index);
    if (sample.kind !== "warm" || !Number.isFinite(sample.latency)) {
      drawing = false;
      return;
    }
    const y = yFor(sample.latency);
    if (!drawing) {
      context.moveTo(x, y);
      drawing = true;
    } else {
      context.lineTo(x, y);
    }
  });
  context.stroke();

  state.samples.forEach((sample, index) => {
    const x = xFor(offset + index);
    if (sample.kind === "error") {
      const y = pad.top + plotHeight + 10;
      context.fillStyle = "#b91c1c";
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
      state.chartPoints.push({ x, y, sample });
      return;
    }
    if (!Number.isFinite(sample.latency)) return;
    const y = yFor(sample.latency);
    state.chartPoints.push({ x, y, sample });
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(x, y, sample.kind === "cold" ? 6 : 4.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = sample.kind === "cold" ? "#b45309" : "#0f766e";
    context.beginPath();
    context.arc(x, y, sample.kind === "cold" ? 4 : 3, 0, Math.PI * 2);
    context.fill();
  });

  if (state.hoverPoint) {
    context.strokeStyle = "rgba(17, 24, 39, 0.16)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(state.hoverPoint.x, pad.top);
    context.lineTo(state.hoverPoint.x, pad.top + plotHeight);
    context.stroke();

    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(state.hoverPoint.x, state.hoverPoint.y, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = state.hoverPoint.sample.kind === "cold" ? "#b45309" : "#0f766e";
    context.beginPath();
    context.arc(state.hoverPoint.x, state.hoverPoint.y, 4, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "#8b95a1";
  context.fillText("oldest", pad.left, cssHeight - 10);
  context.fillText("latest", pad.left + plotWidth - 34, cssHeight - 10);
  context.setTransform(1, 0, 0, 1, 0, 0);
  updateTooltip();
}

function drawEmptySparkline(context, pad, plotWidth, plotHeight) {
  context.save();
  context.strokeStyle = "#dbe3ea";
  context.lineWidth = 2;
  context.lineCap = "round";
  context.beginPath();
  for (let i = 0; i < 12; i += 1) {
    const x = pad.left + (plotWidth / 11) * i;
    const y = pad.top + plotHeight * (0.58 + Math.sin(i * 0.85) * 0.06);
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.restore();
}

function updateTooltip() {
  const tooltip = els.chartTooltip;
  const point = state.hoverPoint;
  if (!point || point.sample.kind === "error") {
    tooltip.classList.remove("visible");
    return;
  }

  tooltip.innerHTML = `
    <strong>${formatMs(point.sample.latency)} ms</strong>
    <span>${point.sample.kind === "cold" ? "Cold/resume" : "Warm"} sample</span>
    <span>${nowLabel(point.sample.at)}</span>
  `;
  tooltip.style.left = `${point.x}px`;
  tooltip.style.top = `${point.y}px`;
  tooltip.classList.add("visible");
}

function render() {
  updateMetrics();
  drawChart();
}

function start() {
  render();
  runProbe();
  state.timer = window.setInterval(runProbe, INTERVAL_MS);
}

window.addEventListener("resize", drawChart);
els.canvas.addEventListener("mousemove", (event) => {
  const rect = els.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const nearest = state.chartPoints
    .filter((point) => point.sample.kind !== "error")
    .map((point) => ({
      point,
      distance: Math.hypot(point.x - x, point.y - y),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  state.hoverPoint = nearest && nearest.distance < 24 ? nearest.point : null;
  drawChart();
});
els.canvas.addEventListener("mouseleave", () => {
  state.hoverPoint = null;
  drawChart();
});
window.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    runProbe();
  }
});

start();
