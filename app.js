let ctx, stream, src, hp, lp, inv, g, lim, an, mode = 'trans', run = false, wake = null;
const $ = id => document.getElementById(id);

function wire() {
  [src, hp, lp, inv, g].forEach(n => { try { n.disconnect(); } catch (e) {} });
  g.gain.value = parseFloat($('gain').value);
  if (mode === 'trans') {
    hp.frequency.value = 100;
    src.connect(hp); hp.connect(g);
  } else {
    lp.frequency.value = parseFloat($('freq').value);
    inv.gain.value = -1;
    src.connect(lp); lp.connect(inv); inv.connect(g);
  }
  g.connect(lim);
  src.connect(an);
}

async function start() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
    });
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    src = ctx.createMediaStreamSource(stream);
    hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    inv = ctx.createGain(); g = ctx.createGain();
    lim = ctx.createDynamicsCompressor(); lim.threshold.value = -12; lim.ratio.value = 20;
    an = ctx.createAnalyser(); an.fftSize = 256;
    lim.connect(ctx.destination);
    try { ctx.createMediaElementSource($('aud')).connect(ctx.destination); } catch (e) {}
    wire();
    run = true;
    $('go').textContent = 'Stop';
    $('st').textContent = 'Running. Base latency ~' + Math.round((ctx.baseLatency + (ctx.outputLatency || 0)) * 1000) + ' ms (plus Bluetooth).';
    try { wake = await navigator.wakeLock.request('screen'); } catch (e) {}
    meter();
  } catch (e) {
    $('st').textContent = 'Mic blocked or unavailable: ' + e.message;
  }
}

function stop() {
  run = false;
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (ctx) ctx.close();
  if (wake) { wake.release(); wake = null; }
  $('go').textContent = 'Start';
  $('st').textContent = 'Idle.';
  $('lvl').style.width = '0';
}

function meter() {
  if (!run) return;
  const d = new Uint8Array(an.fftSize);
  an.getByteTimeDomainData(d);
  let m = 0;
  for (const v of d) m = Math.max(m, Math.abs(v - 128));
  $('lvl').style.width = Math.min(100, m * 2) + '%';
  requestAnimationFrame(meter);
}

$('go').onclick = () => run ? stop() : start();
$('modes').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  mode = b.dataset.m;
  document.querySelectorAll('#modes button').forEach(x => x.classList.toggle('on', x === b));
  if (run) wire();
};
$('gain').oninput = e => { $('gv').textContent = (+e.target.value).toFixed(1); if (run) wire(); };
$('freq').oninput = e => { $('fv').textContent = e.target.value + ' Hz'; if (run) wire(); };
$('file').onchange = e => {
  const f = e.target.files[0];
  if (f) { $('aud').src = URL.createObjectURL(f); $('aud').play(); }
};

document.addEventListener('visibilitychange', async () => {
  if (run && document.visibilityState === 'visible') {
    try { wake = await navigator.wakeLock.request('screen'); } catch (e) {}
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
