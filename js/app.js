/* App: UI orchestration */
(function (global) {
  'use strict';
  const NS = (global.RegexFA = global.RegexFA || {});
  const V = NS.visualizer;
  const A = NS.animator;

  const state = {
    regex: '',
    ast: null,
    nfa: null,
    dfa: null,
    minDfa: null,
    activeTab: 'parse',
    simResult: null,
    simIdx: 0,
    simTimer: null
  };

  // DOM refs
  const $ = (id) => document.getElementById(id);
  const dom = {};
  let player;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    Object.assign(dom, {
      regexInput: $('regex-input'),
      convertBtn: $('convert-btn'),
      examples:   $('examples'),
      errorBox:   $('error-box'),
      tabs:       $('tabs'),
      svg:        $('main-svg'),
      vizTitle:   $('viz-title'),
      infoTitle:  $('info-title'),
      infoBody:   $('info-body'),
      counter:    $('step-counter'),
      btnPrev:    $('step-prev'),
      btnNext:    $('step-next'),
      btnPlay:    $('step-play'),
      btnReset:   $('step-reset'),
      speed:      $('speed-slider'),
      simPanel:   $('sim-panel'),
      simInput:   $('sim-input'),
      simRun:     $('sim-run'),
      simTape:    $('sim-tape'),
      simStatus:  $('sim-status'),
      helpBtn:    $('theme-help'),
      helpModal:  $('help-modal'),
      helpClose:  $('help-close'),
      // Equivalence checker
      eqR1:       $('eq-r1'),
      eqR2:       $('eq-r2'),
      eqBtn:      $('eq-btn'),
      eqResult:   $('eq-result'),
      eqDfas:     $('eq-dfas'),
      eqSvg1:     $('eq-svg-1'),
      eqSvg2:     $('eq-svg-2'),
      eqTitle1:   $('eq-title-1'),
      eqTitle2:   $('eq-title-2')
    });

    player = new A.Player({
      svg: dom.svg,
      infoBody: dom.infoBody,
      infoTitle: dom.infoTitle,
      vizTitle: dom.vizTitle,
      counter: dom.counter,
      onChange: ({ playing }) => {
        dom.btnPlay.classList.toggle('playing', !!playing);
        dom.btnPlay.textContent = playing ? '❚❚' : '▶';
      }
    });

    // Wire up
    dom.convertBtn.addEventListener('click', onConvert);
    dom.regexInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') onConvert();
    });
    dom.examples.addEventListener('change', e => {
      if (e.target.value) {
        dom.regexInput.value = e.target.value;
        e.target.value = '';
        onConvert();
      }
    });

    dom.tabs.addEventListener('click', e => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });

    dom.btnPrev.addEventListener('click', () => player.prev());
    dom.btnNext.addEventListener('click', () => player.next());
    dom.btnPlay.addEventListener('click', () => {
      if (player.isPlaying()) player.pause();
      else player.play();
    });
    dom.btnReset.addEventListener('click', () => player.reset());
    dom.speed.addEventListener('input', e => {
      // Reverse: higher slider = faster (lower delay)
      const v = +e.target.value;
      const delay = 2200 - v;
      player.setSpeed(delay);
    });

    dom.simRun.addEventListener('click', runSimulation);
    dom.simInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') runSimulation();
    });

    dom.helpBtn.addEventListener('click', () => dom.helpModal.classList.remove('hidden'));
    dom.helpClose.addEventListener('click', () => dom.helpModal.classList.add('hidden'));
    dom.helpModal.addEventListener('click', e => {
      if (e.target === dom.helpModal) dom.helpModal.classList.add('hidden');
    });

    // Equivalence checker
    dom.eqBtn.addEventListener('click', runEquivalenceCheck);
    dom.eqR1.addEventListener('keydown', e => { if (e.key === 'Enter') runEquivalenceCheck(); });
    dom.eqR2.addEventListener('keydown', e => { if (e.key === 'Enter') runEquivalenceCheck(); });

    // Run with default value on load
    onConvert();
  }

  function onConvert() {
    const regex = dom.regexInput.value;
    state.regex = regex;
    dom.errorBox.classList.add('hidden');
    try {
      state.ast    = NS.parser.parse(regex);
      state.nfa    = NS.thompson.build(state.ast);
      state.dfa    = NS.subset.completeWithDeadState(NS.subset.build(state.nfa));
      state.minDfa = NS.minimize.minimize(state.dfa);
      state.simResult = null;
      switchTab(state.activeTab || 'parse');
    } catch (err) {
      console.error(err);
      dom.errorBox.textContent = '⚠ ' + err.message;
      dom.errorBox.classList.remove('hidden');
    }
  }

  function switchTab(name) {
    state.activeTab = name;
    Array.from(dom.tabs.querySelectorAll('.tab')).forEach(t => {
      t.classList.toggle('active', t.dataset.tab === name);
    });

    if (!state.ast) return;
    dom.simPanel.classList.toggle('hidden', name !== 'sim');

    let frames;
    let title;
    switch (name) {
      case 'parse':
        frames = A.buildParseTreeFrames(state.ast, state.regex);
        title = 'Parse Tree';
        break;
      case 'nfa':
        frames = A.buildNFAFrames(state.nfa, state.regex);
        title = 'ε-NFA via Thompson’s Construction';
        break;
      case 'dfa':
        frames = A.buildDFAFrames(state.dfa, state.regex);
        title = 'DFA via Subset Construction';
        break;
      case 'min':
        frames = A.buildMinFrames(state.dfa, state.minDfa);
        title = 'DFA Minimisation';
        break;
      case 'sim':
        showSimTab();
        return;
    }
    player.load(frames, title);
    // Fix label backgrounds after reveal
    requestAnimationFrame(() => V.fixupEdgeLabels(dom.svg));
  }

  function showSimTab() {
    // Render the minimal DFA and stop the player
    player.pause();
    const layout = NS.layout.layoutAutomaton(state.minDfa);
    V.renderAutomaton(dom.svg, state.minDfa, layout, {
      subLabel: (id, s) => s ? s.label : ''
    });
    dom.vizTitle.textContent = 'Simulation on Minimal DFA';
    dom.infoTitle.textContent = 'Test a string';
    dom.infoBody.innerHTML = `
      <p>Enter an input string in the box on the right.
         Each character will be consumed one at a time, and the active state
         and traversed transition will glow.</p>
      <p class="muted">A green tape cell means the symbol was successfully
         consumed. A red one means the machine had no transition on that
         symbol — the string is rejected.</p>
      ${A.transitionTable(state.minDfa)}
      ${A.buildGrammar(state.minDfa)}
    `;
    dom.counter.textContent = '— / —';
    dom.simStatus.textContent = '';
    dom.simStatus.className = 'sim-status idle';
    dom.simTape.innerHTML = '';
    requestAnimationFrame(() => V.fixupEdgeLabels(dom.svg));
  }

  /* ============== Simulation ============== */
  function runSimulation() {
    if (state.activeTab !== 'sim') return;
    const input = dom.simInput.value;
    const result = NS.simulator.simulate(state.minDfa, input);
    state.simResult = result;

    // Reset visuals
    V.clearAllClasses(dom.svg, 'active');
    V.clearAllClasses(dom.svg, 'flash');
    V.clearAllClasses(dom.svg, 'dim');

    // Build tape
    dom.simTape.innerHTML = '';
    if (input.length === 0) {
      const cell = document.createElement('span');
      cell.className = 'tape-cell';
      cell.textContent = 'ε';
      dom.simTape.appendChild(cell);
    } else {
      for (const ch of input) {
        const cell = document.createElement('span');
        cell.className = 'tape-cell';
        cell.textContent = ch;
        dom.simTape.appendChild(cell);
      }
    }

    dom.simStatus.textContent = 'Running…';
    dom.simStatus.className = 'sim-status idle';

    if (state.simTimer) clearInterval(state.simTimer);

    const trace = result.trace;
    let i = 0;
    let alreadyRejected = false;

    // Highlight initial state
    V.setStateClass(dom.svg, trace[0].state, 'active', true);
    const tapeCells = dom.simTape.querySelectorAll('.tape-cell');
    if (tapeCells[0] && input.length > 0) tapeCells[0].classList.add('current');

    state.simTimer = setInterval(() => {
      i++;
      if (i >= trace.length) {
        clearInterval(state.simTimer);
        if (!alreadyRejected) finishSim(result);
        return;
      }
      const t = trace[i];

      // Clear ALL previous highlights every tick so nothing lingers
      V.clearAllClasses(dom.svg, 'active');
      V.clearAllClasses(dom.svg, 'dead-active');
      V.clearAllClasses(dom.svg, 'flash');
      dom.svg.querySelectorAll('g.edge.active, g.edge.dead-edge-active')
             .forEach(e => { e.classList.remove('active'); e.classList.remove('dead-edge-active'); });

      // Legacy incomplete-DFA dead path (shouldn't happen now, safety net)
      if (t.dead) {
        if (tapeCells[i - 1]) {
          tapeCells[i - 1].classList.remove('current');
          tapeCells[i - 1].classList.add('rejected');
        }
        V.setStateClass(dom.svg, t.edge.from, 'active', true);
        clearInterval(state.simTimer);
        finishSim(result);
        return;
      }

      // Tape cell styling
      const cellIdx = i - 1;
      if (tapeCells[cellIdx]) {
        tapeCells[cellIdx].classList.remove('current');
        tapeCells[cellIdx].classList.add(t.isDead ? 'rejected' : 'consumed');
      }
      if (tapeCells[i]) tapeCells[i].classList.add(t.isDead ? 'rejected' : 'current');

      // Edge highlight
      if (t.edge) {
        const edgeEl = dom.svg.querySelector(
          `g.edge[data-from="${t.edge.from}"][data-to="${t.edge.to}"]`);
        if (edgeEl) edgeEl.classList.add(t.isDead ? 'dead-edge-active' : 'active');
      }

      // State highlight
      if (t.isDead) {
        V.setStateClass(dom.svg, t.state, 'dead-active', true);
        if (t.justEnteredDead) {
          // Show rejection badge immediately on entering dead state
          dom.simStatus.textContent = '✗ Rejected — entered dead state ∅';
          dom.simStatus.className = 'sim-status reject';
          alreadyRejected = true;
        }
      } else {
        V.setStateClass(dom.svg, t.state, 'active', true);
        V.pulseState(dom.svg, t.state);
      }
    }, 700);
  }

  function finishSim(result) {
    if (result.accepted) {
      dom.simStatus.textContent = '✓ Accepted';
      dom.simStatus.className = 'sim-status accept';
    } else {
      dom.simStatus.textContent = '✗ Rejected';
      dom.simStatus.className = 'sim-status reject';
    }
  }

  /* ============== Equivalence Checker ============== */
  function runEquivalenceCheck() {
    const r1 = dom.eqR1.value.trim();
    const r2 = dom.eqR2.value.trim();
    if (!r1 || !r2) return;

    dom.eqResult.classList.remove('hidden');

    const result = NS.equivalence.checkEquivalence(r1, r2);

    if (result.error) {
      dom.eqResult.innerHTML = `<div class="eq-result-badge differ">
        <span class="eq-badge-icon">⚠</span>
        <div class="eq-badge-body">
          <span>Parse Error</span>
          <span class="eq-badge-detail">${A.escapeHtml(result.error)}</span>
        </div>
      </div>`;
      dom.eqDfas.classList.add('hidden');
      return;
    }

    const { equivalent, min1, min2, counterexample, firstAccepts, mapping } = result;
    const palette = ['#7dd3fc','#a78bfa','#f472b6','#34d399','#fbbf24','#fb7185','#60a5fa','#c084fc'];

    if (equivalent) {
      // Build state-mapping chip list
      let mapHtml = '';
      if (mapping) {
        const pairs = Array.from(mapping.entries()).map(([s1, s2]) => {
          const st1 = min1.states.find(s => s.id === s1);
          const st2 = min2.states.find(s => s.id === s2);
          const l1  = (st1 && st1.isDead) ? '∅' : 'q' + s1;
          const l2  = (st2 && st2.isDead) ? '∅' : 'q' + s2;
          const cls = (st1 && st1.isDead) ? 'eq-map-pair dead-pair' : 'eq-map-pair';
          return `<span class="${cls}">${l1} ↔ ${l2}</span>`;
        });
        mapHtml = `<div class="eq-mapping">
          <div class="eq-mapping-label">State correspondence</div>
          <div class="eq-mapping-pairs">${pairs.join('')}</div>
        </div>`;
      }

      dom.eqResult.innerHTML = `<div class="eq-result-badge equiv">
        <span class="eq-badge-icon">✓</span>
        <div class="eq-badge-body">
          <span>Equivalent — both describe the same language</span>
          <span class="eq-badge-detail">
            Min DFA 1: <code>${min1.states.length} state${min1.states.length !== 1 ? 's' : ''}</code>
            &ensp;·&ensp;
            Min DFA 2: <code>${min2.states.length} state${min2.states.length !== 1 ? 's' : ''}</code>
            &ensp;·&ensp;structurally isomorphic
          </span>
        </div>
      </div>${mapHtml}`;
    } else {
      const ceDisplay = counterexample === ''
        ? '<code>ε (empty string)</code>'
        : `<code>${A.escapeHtml(counterexample)}</code>`;
      const whichAccepts = firstAccepts
        ? 'accepted by Regex&nbsp;1, rejected by Regex&nbsp;2'
        : 'rejected by Regex&nbsp;1, accepted by Regex&nbsp;2';

      dom.eqResult.innerHTML = `<div class="eq-result-badge differ">
        <span class="eq-badge-icon">✗</span>
        <div class="eq-badge-body">
          <span>Not Equivalent</span>
          <span class="eq-badge-detail">
            Counterexample: ${ceDisplay} — ${whichAccepts}
          </span>
        </div>
      </div>`;
    }

    // Render both minimized DFAs
    dom.eqDfas.classList.remove('hidden');
    const lay1 = NS.layout.layoutAutomaton(min1);
    const lay2 = NS.layout.layoutAutomaton(min2);
    V.renderAutomaton(dom.eqSvg1, min1, lay1, { subLabel: (id, s) => s ? s.label : '' });
    V.renderAutomaton(dom.eqSvg2, min2, lay2, { subLabel: (id, s) => s ? s.label : '' });
    dom.eqTitle1.textContent = `Min DFA — ${r1}  (${min1.states.length} state${min1.states.length !== 1 ? 's' : ''})`;
    dom.eqTitle2.textContent = `Min DFA — ${r2}  (${min2.states.length} state${min2.states.length !== 1 ? 's' : ''})`;

    // For equivalent DFAs: color corresponding states with matching colors so the
    // isomorphism is immediately visible even though state IDs may differ.
    if (equivalent && mapping) {
      let ci = 0;
      for (const [s1, s2] of mapping.entries()) {
        const col = palette[ci % palette.length];
        ci++;
        const applyColor = (svg, id) => {
          const bg  = svg.querySelector(`g.state[data-state="${id}"] circle.bg`);
          const out = svg.querySelector(`g.state[data-state="${id}"] circle.outer`);
          if (bg)  { bg.style.fill   = col + '28'; bg.style.stroke  = col; }
          if (out) { out.style.stroke = col; }
        };
        applyColor(dom.eqSvg1, s1);
        applyColor(dom.eqSvg2, s2);
      }
    }

    // Fix edge-label backgrounds after layout
    requestAnimationFrame(() => {
      V.fixupEdgeLabels(dom.eqSvg1);
      V.fixupEdgeLabels(dom.eqSvg2);
    });
  }
})(window);
