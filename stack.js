/* Same-origin control surface. This is not a native E2/E3 protocol adapter. */
(() => {
  'use strict';
  const planner = window.MiniRANPlanner;
  const el = id => document.getElementById(`stack-${id}`);
  let connected = false;
  let busy = false;
  let snapshot = null;
  let timer;

  async function api(path, body) {
    const response = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const result = isJson ? await response.json() : null;
    if (!response.ok || !isJson) {
      throw new Error(result?.detail ? JSON.stringify(result.detail) :
        `Backend unavailable (HTTP ${response.status}). Open the software_stack server, not the static-only server.`);
    }
    return result;
  }

  function options(id, values, prefix) {
    const select = el(id);
    const previous = select.value;
    select.replaceChildren(...values.map(value => new Option(`${prefix} ${value}`, String(value))));
    if (values.some(value => String(value) === previous)) select.value = previous;
  }

  function controls() {
    el('connect').disabled = busy || connected;
    el('publish').disabled = busy || connected;
    for (const id of ['edit', 'pause', 'step', 'dapp', 'ue', 'target', 'quota', 'handover']) {
      el(id).disabled = busy || !connected;
    }
    el('step').disabled ||= Boolean(snapshot?.running);
    el('quota').disabled ||= !snapshot?.ues.length;
    el('handover').disabled ||= !snapshot?.ues.length || !snapshot?.gnbs.length;
  }

  function render(data) {
    if (data.mode !== 'digital_twin') throw new Error('Unsupported backend mode; refusing to treat native data as a digital twin.');
    snapshot = data;
    planner.renderState(data);
    el('status').textContent = `RIC digital twin · ${data.running ? 'running' : 'paused'} · tick ${data.tick}`;
    el('status').dataset.state = 'connected';
    el('pause').textContent = data.running ? 'Pause' : 'Resume';
    el('dapp').checked = data.dapp.enabled;
    options('ue', data.ues.map(ue => ue.id), 'UE');
    options('target', data.gnbs.map(gnb => gnb.id), 'gNB');
    el('evidence').textContent = JSON.stringify({
      mode: data.mode, radio: data.radio, capabilities: data.capabilities,
      dapp: data.dapp, kpm: data.kpm, events: data.events.slice(-8),
    }, null, 2);
    controls();
  }

  async function refresh() {
    render(await api('state'));
  }

  async function action(fn) {
    if (busy) return;
    busy = true;
    controls();
    try {
      await fn();
    } catch (error) {
      el('result').textContent = error.message;
      // Retain the last observed backend state. Never silently substitute local KPIs.
      if (connected) {
        el('status').textContent = 'Backend request failed — last observation may be stale';
        el('status').dataset.state = 'error';
        if (snapshot) el('dapp').checked = snapshot.dapp.enabled;
      }
    } finally {
      busy = false;
      controls();
    }
  }

  function connect(data) {
    if (data.mode !== 'digital_twin') throw new Error('Only the explicit digital_twin mode is supported by this UI.');
    planner.setConnected(true);
    connected = true;
    render(data);
    clearInterval(timer);
    timer = setInterval(() => {
      if (connected && !busy) action(refresh);
    }, 1000);
  }

  el('connect').addEventListener('click', () => action(async () => {
    connect(await api('state'));
    el('result').textContent = 'Connected to existing runtime. Edit topology pauses it; publish replaces its topology.';
  }));
  el('edit').addEventListener('click', () => action(async () => {
    await api('runtime', { running: false });
    await refresh();
    clearInterval(timer);
    connected = false;
    planner.setConnected(false);
    el('status').textContent = 'Standalone draft — backend paused; publish to apply edits';
    el('status').dataset.state = '';
    el('result').textContent = 'Map edits are local until you publish. Radio profile on publish: 10 MHz / 15 kHz.';
  }));
  el('publish').addEventListener('click', () => action(async () => {
    const topology = planner.topology();
    // Fixed supported backend profile, disclosed next to the publish button.
    topology.radio.bandwidth_mhz = 10;
    await api('topology', topology);
    connect(await api('state'));
    el('result').textContent = 'Map topology published; read back from RIC. Policies reset. Backend uses 10 MHz / 15 kHz DL.';
  }));
  el('pause').addEventListener('click', () => action(async () => {
    await api('runtime', { running: !snapshot.running });
    await refresh();
  }));
  el('step').addEventListener('click', () => action(async () => {
    await api('step', { steps: 1 });
    await refresh();
  }));
  el('dapp').addEventListener('change', () => action(async () => {
    await api('dapp', { enabled: el('dapp').checked });
    await refresh();
    el('result').textContent = 'Scheduler dApp setting read back. Step or resume to observe decisions.';
  }));
  el('quota').addEventListener('click', () => action(async () => {
    const low = Number(el('min').value);
    const high = Number(el('max').value);
    if (!Number.isInteger(low) || !Number.isInteger(high) || low < 0 || low > high || high > 100) {
      throw new Error('PRB quota must be integer percentages with 0 ≤ min ≤ max ≤ 100.');
    }
    const result = await api('control', {
      kind: 'prb_quota', ue_id: Number(el('ue').value), min_prb_ratio: low, max_prb_ratio: high,
    });
    await refresh();
    el('result').textContent = JSON.stringify(result);
  }));
  el('handover').addEventListener('click', () => action(async () => {
    const result = await api('control', {
      kind: 'handover', ue_id: Number(el('ue').value), target_gnb_id: Number(el('target').value),
    });
    await refresh();
    el('result').textContent = JSON.stringify(result);
  }));
  controls();
})();
