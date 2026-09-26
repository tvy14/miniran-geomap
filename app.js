/**
 * Mini-RAN Geo Planner — Main Application
 * Handles map, placement, link budget updates, heatmap, and UI.
 */

(function() {
  'use strict';

  // ── State ────────────────────────────────────────────────────────
  const state = {
    bsList: [],         // [{id, lat, lng, height, marker}]
    ueList: [],         // [{id, lat, lng, height, marker, linkLine, servingBs}]
    selectedUe: null,
    mode: 'bs',         // 'bs' | 'ue' | 'move'
    direction: 'dl',    // 'dl' | 'ul'
    mapType: 'streets',
    showHeatmap: true,
    showCells: true,
    showLinks: true,
    autoRefresh: true,
    nextId: 1,
  };

  const params = readParams();
  let backendConnected = false;
  const disabledBeforeConnect = new Map();

  // ── Map Init ─────────────────────────────────────────────────────
  const map = L.map('map', {
    center: [24.8138, 120.9675], // Hsinchu City, Taiwan
    zoom: 13,
    zoomControl: true,
  });

  const layers = {
    streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri',
      maxZoom: 19,
    }),
    terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenTopoMap',
      maxZoom: 17,
    }),
  };

  layers.streets.addTo(map);

  // Layer groups
  const bsLayer = L.layerGroup().addTo(map);
  const ueLayer = L.layerGroup().addTo(map);
  const heatmapLayer = L.layerGroup().addTo(map);
  const linkLayer = L.layerGroup().addTo(map);
  const cellLayer = L.layerGroup().addTo(map);

  // ── Event: Map Click ─────────────────────────────────────────────
  map.on('click', function(e) {
    if (backendConnected) return;
    const { lat, lng } = e.latlng;
    if (state.mode === 'bs') {
      placeBs(lat, lng);
    } else if (state.mode === 'ue') {
      placeUe(lat, lng);
    }
  });

  // ── Placement ────────────────────────────────────────────────────
  function placeBs(lat, lng, options = {}) {
    const id = options.id ?? state.nextId++;
    state.nextId = Math.max(state.nextId, id + 1);
    const icon = L.divIcon({
      html: `<div class="bs-marker">📡</div>`,
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const marker = L.marker([lat, lng], { icon, draggable: !backendConnected })
      .addTo(bsLayer)
      .on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (state.mode === 'move') {
          selectBs(marker);
        }
      })
      .on('dragend', () => {
        Object.assign(bs, marker.getLatLng());
        if (state.autoRefresh) refreshAll();
      });

    const bs = { id, lat, lng, height: options.height ?? (parseFloat(params.bsHeight) || 25), marker };
    state.bsList.push(bs);
    updateKpis();
    if (state.autoRefresh) refreshAll();
  }

  function placeUe(lat, lng, options = {}) {
    const id = options.id ?? state.nextId++;
    state.nextId = Math.max(state.nextId, id + 1);
    const icon = L.divIcon({
      html: `<div class="ue-marker" id="ue-icon-${id}"></div>`,
      className: '',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    const marker = L.marker([lat, lng], { icon, draggable: !backendConnected })
      .addTo(ueLayer)
      .on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        selectUe(ue);
      })
      .on('dragend', () => {
        Object.assign(ue, marker.getLatLng());
        if (state.autoRefresh) refreshAll();
      });

    const ue = { id, lat, lng, height: options.height ?? (parseFloat(params.ueHeight) || 1.5), marker, linkLine: null, servingBs: null };
    state.ueList.push(ue);
    if (state.autoRefresh) refreshAll();
  }

  function selectUe(ue) {
    // Clear previous selection
    if (state.selectedUe) {
      const prevEl = document.getElementById(`ue-icon-${state.selectedUe.id}`);
      if (prevEl) prevEl.classList.remove('selected');
    }
    state.selectedUe = ue;
    const el = document.getElementById(`ue-icon-${ue.id}`);
    if (el) el.classList.add('selected');
    updateLinkAnalysis(ue);
  }

  function selectBs(marker) {
    // For now, just visual feedback
    // Could be extended for BS parameter editing
  }

  // ── Link Computation ─────────────────────────────────────────────
  function computeLinks() {
    if (state.bsList.length === 0) return;

    for (const ue of state.ueList) {
      let bestSinr = -Infinity;
      let bestBs = null;

      for (const bs of state.bsList) {
        const d2d = LinkBudget.haversine(bs.lat, bs.lng, ue.lat, ue.lng);
        const d3d = Math.sqrt(d2d ** 2 + (bs.height - ue.height) ** 2);

        const linkParams = {
          distance2d: d2d,
          distance3d: d3d,
          fcMHz: parseFloat(params.freqMHz),
          hBs: bs.height,
          hUt: ue.height,
          scenario: params.scenario,
          dlTxPowerDbm: parseFloat(params.txPower),
          ueTxPowerDbm: parseFloat(params.ueTxPower),
          bsGainDb: parseFloat(params.antGain),
          ueGainDb: 0,
          bsCableLossDb: parseFloat(params.cableLoss),
          ueNoiseFigureDb: parseFloat(params.ueNf),
          bsNoiseFigureDb: parseFloat(params.bsNf),
          bandwidthHz: parseFloat(params.bandwidth) * 1e6,
          nPrb: parseInt(params.allocatedPrbs) || NRNumerology.prbCount(parseInt(params.scs), parseFloat(params.bandwidth)),
          scsKHz: parseInt(params.scs),
        };

        const dl = LinkBudget.computeDL(linkParams);
        const ul = LinkBudget.computeUL(linkParams);

        const sinr = state.direction === 'dl' ? dl.sinrDb : ul.sinrDb;
        if (sinr > bestSinr) {
          bestSinr = sinr;
          bestBs = bs;
          ue._dl = dl;
          ue._ul = ul;
        }
      }

      ue.servingBs = bestBs;
      ue._servingLink = state.direction === 'dl' ? ue._dl : ue._ul;
    }
  }

  // ── UI Refresh ───────────────────────────────────────────────────
  function refreshAll() {
    // Connected mode has one authoritative KPI source: the Python RIC runtime.
    if (backendConnected) return;
    computeLinks();
    renderLinks();
    renderCells();
    if (state.showHeatmap) renderHeatmap();
    updateKpis();
    if (state.selectedUe) updateLinkAnalysis(state.selectedUe);
    if (state.selectedUe) drawTerrainProfile(state.selectedUe);
  }

  function renderLinks() {
    linkLayer.clearLayers();
    if (!state.showLinks) return;

    for (const ue of state.ueList) {
      if (!ue.servingBs) continue;
      const link = ue._servingLink;
      if (!link) return;

      let color;
      if (link.sinrDb > 10) color = '#1f6feb';
      else if (link.sinrDb > 0) color = '#3fb950';
      else if (link.sinrDb > -5) color = '#d29922';
      else color = '#f85149';

      const line = L.polyline(
        [[ue.servingBs.lat, ue.servingBs.lng], [ue.lat, ue.lng]],
        { color, weight: 2, opacity: 0.8 }
      ).addTo(linkLayer);
    }
  }

  function renderCells() {
    cellLayer.clearLayers();
    if (!state.showCells || state.bsList.length === 0) return;

    // Draw simple Voronoi-like cell boundaries using nearest-BS regions
    // Use circles at 50% of distance to nearest neighbor for simplicity
    for (const bs of state.bsList) {
      let minDist = Infinity;
      for (const other of state.bsList) {
        if (other === bs) continue;
        const d = LinkBudget.haversine(bs.lat, bs.lng, other.lat, other.lng);
        if (d < minDist) minDist = d;
      }
      const radius = minDist === Infinity ? 500 : minDist / 2;
      L.circle([bs.lat, bs.lng], {
        radius,
        color: '#58a6ff',
        weight: 1,
        fillOpacity: 0.03,
        dashArray: '4 4',
      }).addTo(cellLayer);
    }
  }

  function renderHeatmap() {
    heatmapLayer.clearLayers();
    // The standalone coverage overlay is not backend telemetry.
    if (backendConnected) return;
    if (!state.showHeatmap || state.bsList.length === 0) return;

    // Compute coverage grid (coarse for performance)
    const bounds = map.getBounds();
    const latStep = (bounds.getNorth() - bounds.getSouth()) / 40;
    const lngStep = (bounds.getEast() - bounds.getWest()) / 40;

    for (let lat = bounds.getSouth(); lat <= bounds.getNorth(); lat += latStep) {
      for (let lng = bounds.getWest(); lng <= bounds.getEast(); lng += lngStep) {
        let bestRsrp = -Infinity;
        for (const bs of state.bsList) {
          const d2d = LinkBudget.haversine(bs.lat, bs.lng, lat, lng);
          const d3d = Math.sqrt(d2d ** 2 + (bs.height - 1.5) ** 2);
          const fcGHz = parseFloat(params.freqMHz) / 1000;
          const los = ChannelModels.sampleCondition(params.scenario, d2d, 1.5);
          const pl = ChannelModels.computePathLoss(params.scenario, los, d3d, fcGHz, bs.height, 1.5, d2d);
          const rsrp = ChannelModels.computeRsrp(parseFloat(params.txPower), pl, parseFloat(params.antGain), parseFloat(params.cableLoss));
          if (rsrp > bestRsrp) bestRsrp = rsrp;
        }

        // Color based on RSRP
        let color, opacity;
        if (bestRsrp > -80) { color = '#1f6feb'; opacity = 0.4; }
        else if (bestRsrp > -90) { color = '#3fb950'; opacity = 0.35; }
        else if (bestRsrp > -100) { color = '#d29922'; opacity = 0.3; }
        else if (bestRsrp > -110) { color = '#f85149'; opacity = 0.25; }
        else { color = '#484f58'; opacity = 0.15; }

        L.rectangle(
          [[lat, lng], [lat + latStep, lng + lngStep]],
          { color: 'transparent', fillColor: color, fillOpacity: opacity, weight: 0 }
        ).addTo(heatmapLayer);
      }
    }
  }

  function updateKpis() {
    const bsCount = state.bsList.length;
    const ueCount = state.ueList.length;
    document.getElementById('kpi-bs').textContent = bsCount;
    document.getElementById('kpi-ue').textContent = ueCount;

    if (ueCount === 0 || bsCount === 0) {
      document.getElementById('kpi-rsrp').textContent = '—';
      document.getElementById('kpi-sinr').textContent = '—';
      document.getElementById('kpi-tput').textContent = '—';
      document.getElementById('kpi-coverage').textContent = '—';
      return;
    }

    let totalRsrp = 0, totalSinr = 0, totalTput = 0, coveredCount = 0;
    for (const ue of state.ueList) {
      if (ue._servingLink) {
        totalRsrp += ue._servingLink.rsrpDbm;
        totalSinr += ue._servingLink.sinrDb;
        totalTput += ue._servingLink.throughputMbps;
        if (ue._servingLink.rsrpDbm > -110) coveredCount++;
      }
    }

    document.getElementById('kpi-rsrp').textContent = (totalRsrp / ueCount).toFixed(1);
    document.getElementById('kpi-sinr').textContent = (totalSinr / ueCount).toFixed(1);
    document.getElementById('kpi-tput').textContent = (totalTput / ueCount).toFixed(1);
    document.getElementById('kpi-coverage').textContent = ((coveredCount / ueCount) * 100).toFixed(0) + '%';
  }

  function updateLinkAnalysis(ue) {
    const panel = document.getElementById('link-analysis');
    if (backendConnected && ue?._backend) {
      const data = ue._backend;
      const rows = [
        ['Source', 'RIC digital-twin DL telemetry'],
        ['UE / serving gNB', `${data.id} / ${data.serving ?? 'unattached'}`],
        ['RSRP', `${data.rsrp_dbm.toFixed(1)} dBm`],
        ['SINR', `${data.sinr_db.toFixed(1)} dB`],
        ['Allocated PRBs', String(data.prb_allocated)],
        ['DL throughput', `${data.dl_mbps.toFixed(2)} Mbps`],
      ];
      panel.replaceChildren(...rows.map(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'link-row';
        const name = document.createElement('span');
        name.className = 'label';
        name.textContent = label;
        const detail = document.createElement('span');
        detail.className = 'value';
        detail.textContent = value;
        row.append(name, detail);
        return row;
      }));
      drawTerrainProfile(ue);
      return;
    }
    if (!ue || !ue._servingLink) {
      panel.innerHTML = '<p class="placeholder">No link computed. Place at least one BS and UE.</p>';
      return;
    }

    const dl = ue._dl || {};
    const ul = ue._ul || {};
    const serving = ue._servingLink;
    const isDl = state.direction === 'dl';
    const link = isDl ? dl : ul;

    function valClass(v, good, bad) {
      if (v >= good) return 'good';
      if (v >= bad) return 'warn';
      return 'bad';
    }

    panel.innerHTML = `
      <div class="link-row"><span class="label">Direction</span><span class="value">${isDl ? 'Downlink (DL)' : 'Uplink (UL)'}</span></div>
      <div class="link-row"><span class="label">Distance (2D)</span><span class="value">${link.distance2d?.toFixed(0)} m</span></div>
      <div class="link-row"><span class="label">Distance (3D)</span><span class="value">${link.distance3d?.toFixed(0)} m</span></div>
      <div class="link-row"><span class="label">Path Loss</span><span class="value">${link.pathLossDb?.toFixed(1)} dB</span></div>
      <div class="link-row"><span class="label">RSRP</span><span class="value ${valClass(link.rsrpDbm, -80, -100)}">${link.rsrpDbm?.toFixed(1)} dBm</span></div>
      <div class="link-row"><span class="label">SINR</span><span class="value ${valClass(link.sinrDb, 10, 0)}">${link.sinrDb?.toFixed(1)} dB</span></div>
      <div class="link-row"><span class="label">MCS</span><span class="value">${link.mcs} (${link.mcsModulation})</span></div>
      <div class="link-row"><span class="label">Code Rate</span><span class="value">${(link.mcsCodeRate * 1024).toFixed(0)}/1024</span></div>
      <div class="link-row"><span class="label">Throughput</span><span class="value ${valClass(link.throughputMbps, 10, 1)}">${link.throughputMbps?.toFixed(2)} Mbps</span></div>
      <div class="link-row"><span class="label">LOS/NLOS</span><span class="value">${link.los ? 'LOS' : 'NLOS'}</span></div>
    `;

    drawTerrainProfile(ue);
  }

  function drawTerrainProfile(ue) {
    const canvas = document.getElementById('terrain-canvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!ue || !ue.servingBs) {
      document.getElementById('terrain-info').textContent = 'Place BS and UE to see profile.';
      return;
    }

    const bs = ue.servingBs;
    const distance = LinkBudget.haversine(bs.lat, bs.lng, ue.lat, ue.lng);
    document.getElementById('terrain-info').textContent =
      `BS ↔ UE: ${distance.toFixed(0)} m · ${bs.height}m → ${ue.height}m`;

    // Draw sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0d1117');
    grad.addColorStop(1, '#161b22');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Draw ground line
    const groundY = h * 0.75;
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(w, groundY);
    ctx.stroke();

    // Draw BS tower
    const bsX = 30;
    const bsTop = groundY - (bs.height / 50) * (h * 0.6);
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bsX, groundY);
    ctx.lineTo(bsX, bsTop);
    ctx.stroke();
    ctx.fillStyle = '#58a6ff';
    ctx.beginPath();
    ctx.arc(bsX, bsTop, 5, 0, Math.PI * 2);
    ctx.fill();

    // Draw UE marker
    const ueX = w - 30;
    const ueTop = groundY - (ue.height / 50) * (h * 0.6);
    ctx.fillStyle = '#3fb950';
    ctx.beginPath();
    ctx.arc(ueX, ueTop, 5, 0, Math.PI * 2);
    ctx.fill();

    // Draw LOS line
    ctx.strokeStyle = '#d29922';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(bsX, bsTop);
    ctx.lineTo(ueX, ueTop);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`BS ${bs.height}m`, bsX, groundY + 14);
    ctx.fillText(`UE ${ue.height}m`, ueX, groundY + 14);
    ctx.fillText(`${distance.toFixed(0)}m`, w / 2, groundY + 14);
  }

  // ── Parameter Reader ─────────────────────────────────────────────
  function readParams() {
    return {
      freqMHz: document.getElementById('freq-mhz').value,
      scs: document.getElementById('scs').value,
      bandwidth: document.getElementById('bandwidth').value,
      allocatedPrbs: document.getElementById('allocated-prbs').value,
      txPower: document.getElementById('tx-power').value,
      ueTxPower: document.getElementById('ue-tx-power').value,
      antGain: document.getElementById('ant-gain').value,
      cableLoss: document.getElementById('cable-loss').value,
      bsHeight: document.getElementById('bs-height').value,
      ueHeight: document.getElementById('ue-height').value,
      ueNf: document.getElementById('ue-nf').value,
      bsNf: document.getElementById('bs-nf').value,
      scenario: document.getElementById('scenario').value,
      propCondition: document.getElementById('prop-condition').value,
      antPattern: document.getElementById('ant-pattern').value,
      azimuth: document.getElementById('azimuth').value,
      downtilt: document.getElementById('downtilt').value,
      hBw: document.getElementById('h-bw').value,
      vBw: document.getElementById('v-bw').value,
    };
  }

  // ── Event Bindings ───────────────────────────────────────────────
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
    });
  });

  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.direction = btn.dataset.dir;
      refreshAll();
    });
  });

  document.querySelectorAll('.map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mapType = btn.dataset.map;
      Object.values(layers).forEach(l => map.removeLayer(l));
      layers[mapType].addTo(map);
    });
  });

  // Param change listeners (debounced)
  let paramTimeout;
  document.querySelectorAll('.param-grid input, .param-grid select').forEach(el => {
    el.addEventListener('change', () => {
      Object.assign(params, readParams());
      if (state.autoRefresh) {
        clearTimeout(paramTimeout);
        paramTimeout = setTimeout(refreshAll, 150);
      }
    });
  });

  // Checkbox listeners
  document.getElementById('show-heatmap').addEventListener('change', function() {
    state.showHeatmap = this.checked;
    if (this.checked) refreshAll();
    else heatmapLayer.clearLayers();
  });

  document.getElementById('show-cells').addEventListener('change', function() {
    state.showCells = this.checked;
    if (state.showCells) renderCells();
    else cellLayer.clearLayers();
  });

  document.getElementById('show-links').addEventListener('change', function() {
    state.showLinks = this.checked;
    if (state.showLinks) renderLinks();
    else linkLayer.clearLayers();
  });

  document.getElementById('auto-refresh').addEventListener('change', function() {
    state.autoRefresh = this.checked;
  });

  // ── Action Buttons ──────────────────────────────────────────────
  document.getElementById('btn-reset').addEventListener('click', () => {
    state.bsList = [];
    state.ueList = [];
    state.selectedUe = null;
    bsLayer.clearLayers();
    ueLayer.clearLayers();
    linkLayer.clearLayers();
    cellLayer.clearLayers();
    heatmapLayer.clearLayers();
    updateKpis();
    document.getElementById('link-analysis').innerHTML = '<p class="placeholder">Click a UE to see link budget details.</p>';
    document.getElementById('terrain-canvas').getContext('2d').clearRect(0, 0, 320, 120);
    document.getElementById('terrain-info').textContent = 'Place BS and UE to see profile.';
  });

  document.getElementById('btn-demo').addEventListener('click', () => {
    // Load a synthetic demo topology — Hsinchu City, Taiwan
    document.getElementById('btn-reset').click();
    const demoBs = [
      { lat: 24.8238, lng: 120.9775, h: 30 },
      { lat: 24.8338, lng: 120.9875, h: 25 },
      { lat: 24.8138, lng: 120.9675, h: 35 },
      { lat: 24.8188, lng: 120.9825, h: 20 },
      { lat: 24.8288, lng: 120.9625, h: 28 },
      { lat: 24.8088, lng: 120.9725, h: 22 },
    ];
    for (const d of demoBs) {
      placeBs(d.lat, d.lng);
      state.bsList[state.bsList.length - 1].height = d.h;
    }
    const demoUe = [
      { lat: 24.8268, lng: 120.9795, h: 1.5 },
      { lat: 24.8208, lng: 120.9755, h: 1.5 },
      { lat: 24.8158, lng: 120.9705, h: 10 },
      { lat: 24.8308, lng: 120.9855, h: 1.5 },
    ];
    for (const d of demoUe) {
      placeUe(d.lat, d.lng);
      state.ueList[state.ueList.length - 1].height = d.h;
    }
    refreshAll();
  });

  document.getElementById('btn-add-cluster').addEventListener('click', () => {
    // Add a cluster of 7 BSs around map center
    const center = map.getCenter();
    const radius = 0.003; // ~300m
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      const lat = center.lat + (i === 0 ? 0 : Math.sin(angle) * radius);
      const lng = center.lng + (i === 0 ? 0 : Math.cos(angle) * radius);
      placeBs(lat, lng);
    }
    refreshAll();
  });

  // ── Map Move Refresh ─────────────────────────────────────────────
  map.on('moveend', () => {
    if (state.showHeatmap) renderHeatmap();
  });

  // ── Keyboard Shortcuts ──────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (backendConnected || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'b') { state.mode = 'bs'; updateModeButtons(); }
    else if (e.key === 'u') { state.mode = 'ue'; updateModeButtons(); }
    else if (e.key === 'm') { state.mode = 'move'; updateModeButtons(); }
    else if (e.key === 'r') refreshAll();
    else if (e.key === 'Escape') {
      if (state.selectedUe) {
        const prevEl = document.getElementById(`ue-icon-${state.selectedUe.id}`);
        if (prevEl) prevEl.classList.remove('selected');
        state.selectedUe = null;
        document.getElementById('link-analysis').innerHTML = '<p class="placeholder">Click a UE to see link budget details.</p>';
      }
    }
  });

  function updateModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === state.mode);
    });
  }

  // Boundary for the optional software-stack dashboard; the static planner
  // remains independent of network I/O.
  window.MiniRANPlanner = {
    topology() {
      const entity = ({ id, marker, height }) => ({ id, ...marker.getLatLng(), height });
      const current = readParams();
      return {
        gnbs: state.bsList.map(entity), ues: state.ueList.map(entity),
        radio: {
          freq_mhz: Number(current.freqMHz), bandwidth_mhz: Number(current.bandwidth),
          tx_power_dbm: Number(current.txPower), antenna_gain_db: Number(current.antGain),
          scenario: current.scenario,
        },
      };
    },
    setConnected(connected) {
      if (connected === backendConnected) return;
      backendConnected = connected;
      const controls = document.querySelectorAll(
        '.mode-btn, .dir-btn, .param-grid input, .param-grid select, #show-heatmap, ' +
        '#auto-refresh, #show-rsrp, #btn-demo, #btn-reset, #btn-add-cluster'
      );
      for (const el of controls) {
        if (connected) {
          disabledBeforeConnect.set(el, el.disabled);
          el.disabled = true;
        } else {
          el.disabled = disabledBeforeConnect.get(el) ?? false;
        }
      }
      for (const item of [...state.bsList, ...state.ueList]) {
        if (connected) item.marker.dragging.disable();
        else item.marker.dragging.enable();
      }
      if (connected) {
        heatmapLayer.clearLayers();
        state.direction = 'dl';
        document.querySelectorAll('.dir-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.dir === 'dl');
        });
      } else {
        disabledBeforeConnect.clear();
        refreshAll();
      }
    },
    renderState(snapshot) {
      if (!backendConnected) return;
      const selectedId = state.selectedUe?.id;
      function reconcile(items, incoming, layer, place) {
        const ids = new Set(incoming.map(item => item.id));
        for (const item of [...items]) {
          if (!ids.has(item.id)) {
            layer.removeLayer(item.marker);
            items.splice(items.indexOf(item), 1);
          }
        }
        for (const data of incoming) {
          let item = items.find(item => item.id === data.id);
          if (!item) {
            place(data.lat, data.lng, data);
            item = items[items.length - 1];
          }
          Object.assign(item, { lat: data.lat, lng: data.lng, height: data.height });
          item.marker.setLatLng([data.lat, data.lng]);
          item._backend = data;
        }
      }
      reconcile(state.bsList, snapshot.gnbs, bsLayer, placeBs);
      reconcile(state.ueList, snapshot.ues, ueLayer, placeUe);
      for (const ue of state.ueList) {
        const data = ue._backend;
        ue.servingBs = state.bsList.find(bs => bs.id === data.serving) ?? null;
        ue._servingLink = {
          sinrDb: data.sinr_db, rsrpDbm: data.rsrp_dbm, throughputMbps: data.dl_mbps,
        };
      }
      state.selectedUe = state.ueList.find(ue => ue.id === selectedId) ?? null;
      renderLinks();
      renderCells();
      updateKpis();
      if (state.selectedUe) selectUe(state.selectedUe);
    },
  };

  // ── Initial State ───────────────────────────────────────────────
  // Pre-load demo for immediate visual feedback
  document.getElementById('btn-demo').click();

})();
