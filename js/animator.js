/* Animator: drives the step-through visualisation for each tab.
 *
 * A "frame" is a fully self-contained snapshot. apply(frame) renders the SVG
 * + info panel into exactly the state for that frame index, so goto(i) is
 * idempotent and the user can scrub freely.
 *
 * Each tab builds its own frame array; the player just plays them.
 */
(function (global) {
  'use strict';
  const NS = (global.RegexFA = global.RegexFA || {});
  const V = NS.visualizer;

  /* ========== Player ========== */
  class Player {
    constructor({ svg, infoBody, infoTitle, vizTitle, counter, onChange }) {
      this.svg = svg;
      this.infoBody = infoBody;
      this.infoTitle = infoTitle;
      this.vizTitle = vizTitle;
      this.counter = counter;
      this.onChange = onChange || (()=>{});
      this.frames = [];
      this.idx = 0;
      this.timer = null;
      this.speed = 800;
    }
    load(frames, title) {
      this.pause();
      this.frames = frames;
      this.idx = 0;
      if (title) this.vizTitle.textContent = title;
      this.render();
    }
    setSpeed(ms) { this.speed = ms; if (this.timer) { this.pause(); this.play(); } }
    next() {
      if (this.idx < this.frames.length - 1) { this.idx++; this.render(); }
      else this.pause();
    }
    prev() { if (this.idx > 0) { this.idx--; this.render(); } }
    goto(i) {
      this.idx = Math.max(0, Math.min(this.frames.length - 1, i));
      this.render();
    }
    reset() { this.pause(); this.idx = 0; this.render(); }
    play() {
      if (this.frames.length === 0) return;
      if (this.idx >= this.frames.length - 1) this.idx = 0;
      this.timer = setInterval(() => {
        if (this.idx >= this.frames.length - 1) { this.pause(); return; }
        this.idx++;
        this.render();
      }, this.speed);
      this.onChange({ playing: true });
    }
    pause() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.onChange({ playing: false });
    }
    isPlaying() { return !!this.timer; }
    render() {
      const f = this.frames[this.idx];
      if (!f) return;
      this.counter.textContent = `${this.idx + 1} / ${this.frames.length}`;
      this.infoTitle.textContent = f.title || 'Step';
      this.infoBody.innerHTML = f.html || '';
      f.apply(this.svg);
      this.onChange({ playing: this.isPlaying(), idx: this.idx });
    }
  }

  /* ========== Frame builders ========== */

  // Parse Tree: just one frame (or animated reveal)
  function buildParseTreeFrames(ast, regex) {
    const frames = [];
    frames.push({
      title: 'Parsed Regular Expression',
      html: `
        <p>The regex <code>${escapeHtml(regex)}</code> was parsed into the abstract
        syntax tree shown on the left.</p>
        <p class="muted">Operators (in pink-purple) drive Thompson's construction;
        leaves (pink) become the elementary one-symbol NFAs.</p>
        <p><b>Operator precedence (low → high):</b><br/>
          alternation <code>|</code> &nbsp;&lt;&nbsp;
          concatenation &nbsp;&lt;&nbsp;
          unary <code>* + ?</code></p>
      `,
      apply: (svg) => V.renderParseTree(svg, ast)
    });
    return frames;
  }

  // NFA construction: one frame per AST sub-fragment built (post-order)
  function buildNFAFrames(nfa, regex) {
    const frames = [];
    const layout = NS.layout.layoutAutomaton(nfa);

    // Frame 0: empty canvas with a "starting" message
    frames.push({
      title: 'Thompson’s Construction begins',
      html: `<p>We will recursively build an ε-NFA fragment for each part of
        <code>${escapeHtml(regex)}</code> using Thompson's rules.</p>
        <p class="muted">Each fragment has exactly one start state and one
        accept state, joined to others through ε-transitions.</p>`,
      apply: (svg) => {
        V.renderAutomaton(svg, nfa, layout, { isNFA: true });
        V.hideAllStates(svg); V.hideAllEdges(svg);
      }
    });

    // One frame per buildStep, accumulating visible states/edges
    const cumStates = new Set();
    const cumEdges = new Set();
    const stepRows = [];

    for (let i = 0; i < nfa.buildSteps.length; i++) {
      const step = nfa.buildSteps[i];
      step.statesAdded.forEach(s => cumStates.add(s));
      step.transitionsAdded.forEach(t => cumEdges.add(`${t.from}|${t.to}|${t.symbol}`));
      const visStates = new Set(cumStates);
      const visEdges  = new Set(cumEdges);
      stepRows.push(stepRow(step, i + 1));

      const isLast = i === nfa.buildSteps.length - 1;
      const title = isLast
        ? 'Construction complete'
        : `Step ${i + 1}: ${describeOp(step.kind)}`;
      const html = `
        <p>Built fragment for <code>${escapeHtml(step.regex)}</code> —
        <i>${describeOp(step.kind)}</i>.
        Start = q${step.fragment.start}, Accept = q${step.fragment.accept}.</p>
        ${ruleHtml(step.kind)}
        <div class="step-list">${stepRows.slice(-6).join('')}</div>
        ${isLast ? `<p class="muted">The full ε-NFA has <b>${nfa.states.length}</b> states and <b>${nfa.transitions.length}</b> transitions.</p>` : ''}
      `;
      frames.push({
        title, html,
        apply: (svg) => {
          V.renderAutomaton(svg, nfa, layout, { isNFA: true });
          V.hideAllStates(svg); V.hideAllEdges(svg);
          for (const id of visStates) V.setStateVisible(svg, id, true);
          // Show edges where both endpoints are visible
          for (const t of nfa.transitions) {
            if (visStates.has(t.from) && visStates.has(t.to)) {
              V.setEdgeVisible(svg, t.from, t.to, true);
            }
          }
          // Highlight the latest fragment's states
          step.statesAdded.forEach(id => V.setStateClass(svg, id, 'flash', true));
        }
      });
    }
    return frames;
  }

  function stepRow(step, n) {
    return `<span class="step-row">
      <b>${n}.</b> ${describeOp(step.kind)} →
      <code>${escapeHtml(step.regex)}</code>
    </span>`;
  }

  function describeOp(kind) {
    return ({
      symbol:   'Symbol',
      epsilon:  'Epsilon',
      concat:   'Concatenation',
      union:    'Union (|)',
      star:     'Kleene Star (*)',
      plus:     'Plus (+)',
      optional: 'Optional (?)'
    })[kind] || kind;
  }

  function ruleHtml(kind) {
    const rules = {
      symbol:   'Rule: a single symbol <code>a</code> becomes <code>q₀ ─a→ q₁</code>.',
      epsilon:  'Rule: ε is implemented as a single ε-transition between two new states.',
      concat:   'Rule: <code>RS</code> — connect accept of <code>R</code> to start of <code>S</code> with ε.',
      union:    'Rule: <code>R|S</code> — new start with ε to both, new accept with ε from both.',
      star:     'Rule: <code>R*</code> — wrap <code>R</code> with new start/accept; ε bypass + ε loop back.',
      plus:     'Rule: <code>R+</code> — same as <code>R*</code> but no bypass (must execute R at least once).',
      optional: 'Rule: <code>R?</code> — bypass ε from start to accept; otherwise execute R.'
    };
    return `<p class="muted">${rules[kind] || ''}</p>`;
  }

  // DFA construction: one frame per buildStep
  function buildDFAFrames(dfa, regex) {
    const frames = [];
    const layout = NS.layout.layoutAutomaton(dfa);

    // Separate dead steps (added post-processing) from subset-construction steps
    const subsetSteps = dfa.buildSteps.filter(s => s.kind !== 'dead');
    const deadSteps   = dfa.buildSteps.filter(s => s.kind === 'dead');
    const deadIds     = new Set(dfa.states.filter(s => s.isDead).map(s => s.id));

    // Helper: hide dead state and its edges in a given svg (used in all construction frames)
    function hideDeadFromSvg(svg) {
      for (const id of deadIds) {
        V.setStateVisible(svg, id, false);
        dfa.transitions.filter(t => t.from === id || t.to === id)
          .forEach(t => V.setEdgeVisible(svg, t.from, t.to, false));
      }
    }

    const cumStates = new Set();
    const cumEdges = new Set();

    frames.push({
      title: 'Subset Construction begins',
      html: `<p>We convert the ε-NFA into an equivalent DFA using the subset
        construction. Each DFA state is a <i>set</i> of NFA states the machine
        could simultaneously be in.</p>
        <p class="muted">We start with the ε-closure of the NFA's start state.</p>`,
      apply: (svg) => {
        V.renderAutomaton(svg, dfa, layout, { subLabel: (id, s) => s ? s.label : '' });
        V.hideAllStates(svg); V.hideAllEdges(svg);
      }
    });

    for (let i = 0; i < subsetSteps.length; i++) {
      const step = subsetSteps[i];
      let title = '', text = '';
      if (step.kind === 'init') {
        cumStates.add(step.stateId);
        title = `Step 1: Start state D${step.stateId}`;
        text = `<p>${escapeHtml(step.reason)}</p>
                <p class="muted">This forms our DFA start state <b>D${step.stateId}</b>.</p>`;
      } else {
        cumStates.add(step.stateId);
        title = `Step ${i + 1}: process D${step.stateId}`;
        const moveLines = step.moves.map(m => {
          cumStates.add(m.to);
          cumEdges.add(`${step.stateId}|${m.to}|${m.symbol}`);
          return `<span class="step-row${m.isNew ? ' highlight' : ''}">
            δ(D${step.stateId}, <b>${escapeHtml(m.symbol)}</b>) =
            ε-closure(${escapeHtml(setStr(m.moveSet))}) =
            ${escapeHtml(setStr(m.closure))}
            → ${m.isNew ? 'new ' : ''}D${m.to}
          </span>`;
        }).join('');
        text = `<p>From <b>D${step.stateId}</b> = ${escapeHtml(setStr(step.nfaStates))}, we compute
                δ for each input symbol:</p>${moveLines}`;
      }

      const visStates = new Set(cumStates);
      const visEdges  = new Set(cumEdges);

      frames.push({
        title, html: text,
        apply: (svg) => {
          V.renderAutomaton(svg, dfa, layout, { subLabel: (id, s) => s ? s.label : '' });
          V.hideAllStates(svg); V.hideAllEdges(svg);
          for (const id of visStates) V.setStateVisible(svg, id, true);
          for (const t of dfa.transitions) {
            const k = `${t.from}|${t.to}|${t.symbol}`;
            if (visEdges.has(k)) V.setEdgeVisible(svg, t.from, t.to, true);
          }
          hideDeadFromSvg(svg);  // always hide dead state during construction steps
          if (step.kind === 'process') {
            V.setStateClass(svg, step.stateId, 'flash', true);
            step.moves.forEach(m => {
              if (m.isNew) V.setStateClass(svg, m.to, 'flash', true);
            });
          } else {
            V.setStateClass(svg, step.stateId, 'flash', true);
          }
        }
      });
    }

    // Frame: show subset-construction result (without dead state) + transition table
    const nonDeadStates = dfa.states.filter(s => !s.isDead);
    const nonDeadCount  = nonDeadStates.length;
    frames.push({
      title: 'Subset Construction complete',
      html: `<p>The subset construction produced <b>${nonDeadCount}</b> DFA state${nonDeadCount !== 1 ? 's' : ''}.
             Cells marked <b>—</b> have no defined transition yet.</p>
             ${transitionTable(dfa, true)}`,
      apply: (svg) => {
        V.renderAutomaton(svg, dfa, layout, { subLabel: (id, s) => s ? s.label : '' });
        V.showAllStates(svg); V.showAllEdges(svg);
        hideDeadFromSvg(svg);
      }
    });

    // If a dead state was added, show one more frame revealing it
    if (deadIds.size > 0) {
      const missingCount = deadSteps.reduce((n, s) => n + (s.missingCount || 0), 0);
      frames.push({
        title: 'Dead state ∅ added',
        html: `<p><b>${missingCount}</b> transition${missingCount !== 1 ? 's' : ''} were undefined
               (shown as — in the table). We add a <b>dead state ∅</b>: a non-accepting trap
               state that loops to itself on every symbol. Once reached, the DFA can never
               return to a useful state.</p>
               <p class="muted">The complete DFA now has <b>${dfa.states.length}</b> states and
               <b>${dfa.transitions.length}</b> transitions.</p>
               ${transitionTable(dfa)}`,
        apply: (svg) => {
          V.renderAutomaton(svg, dfa, layout, { subLabel: (id, s) => s ? s.label : '' });
          V.showAllStates(svg); V.showAllEdges(svg);
          for (const id of deadIds) V.setStateClass(svg, id, 'flash', true);
        }
      });
    }

    return frames;
  }

  // Minimization: re-color DFA states by partition, then collapse
  function buildMinFrames(dfa, minDfa) {
    const frames = [];
    const layoutDfa = NS.layout.layoutAutomaton(dfa);
    const layoutMin = NS.layout.layoutAutomaton(minDfa);
    const palette = ['#7dd3fc', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#c084fc'];

    minDfa.buildSteps.forEach((step, i) => {
      const partition = step.partition;
      const groupOf = (sid) => partition.findIndex(g => g.includes(sid));
      const html = stepHtml(step, partition, palette, dfa);

      frames.push({
        title: titleOfMinStep(step, i),
        html,
        apply: (svg) => {
          V.renderAutomaton(svg, dfa, layoutDfa, {
            subLabel: (id, s) => s ? s.label : ''
          });
          V.showAllStates(svg); V.showAllEdges(svg);
          // Color states by partition group
          partition.forEach((group, gi) => {
            for (const sid of group) {
              const el = svg.querySelector(`g.state[data-state="${sid}"] circle.bg`);
              const out = svg.querySelector(`g.state[data-state="${sid}"] circle.outer`);
              const col = palette[gi % palette.length];
              if (el)  el.style.stroke = col;
              if (out) out.style.stroke = col;
              const label = svg.querySelector(`g.state[data-state="${sid}"] text.label`);
              if (label) label.style.fill = '#0b1020';
              if (el) el.style.fill = col + '33'; // translucent fill
              const sub = svg.querySelector(`g.state[data-state="${sid}"] text.sublabel`);
              if (sub) sub.style.fill = col;
              const main = svg.querySelector(`g.state[data-state="${sid}"] text.label`);
              if (main) main.style.fill = '#e2e8f0';
            }
          });
        }
      });
    });

    // Final frame: render the actual minimized DFA + grammar
    frames.push({
      title: 'Minimised DFA',
      html: `<p>Each equivalence class became a state of the minimal DFA.
              We end up with <b>${minDfa.states.length}</b> states (down from
              <b>${dfa.states.length}</b>).</p>
              ${transitionTable(minDfa)}
              ${buildGrammar(minDfa)}`,
      apply: (svg) => {
        V.renderAutomaton(svg, minDfa, layoutMin, {
          subLabel: (id, s) => s ? s.label : ''
        });
      }
    });

    return frames;
  }

  function titleOfMinStep(step, i) {
    if (step.kind === 'initial') return 'Initial Partition: Accepting vs Non-accepting';
    if (step.kind === 'refine')  return `Refinement Pass ${i}`;
    if (step.kind === 'final')   return 'Final Partition (stable)';
    return 'Step';
  }

  function stepHtml(step, partition, palette, dfa) {
    // Map old DFA state id → isDead
    const deadSet = new Set((dfa ? dfa.states : []).filter(s => s.isDead).map(s => s.id));
    let html = `<p>${escapeHtml(step.reason || '')}</p>`;
    html += '<div class="step-list">';
    partition.forEach((g, gi) => {
      const color = palette[gi % palette.length];
      const labels = g.map(s => deadSet.has(s) ? '∅' : 'q' + s).join(', ');
      html += `<span class="step-row" style="border-left-color:${color}">
        Group ${gi}: ${labels}
      </span>`;
    });
    html += '</div>';
    return html;
  }

  /* ========== Helpers ========== */
  function setStr(arr) {
    return '{' + arr.slice().sort((a,b)=>a-b).map(x => 'q' + x).join(', ') + '}';
  }

  // stateLabel: return the display label for a state id in an automaton
  function stateLabel(automaton, id) {
    const s = automaton.states.find(s => (typeof s === 'object' ? s.id : s) === id);
    if (s && s.isDead) return '∅';
    if (s && s.label)  return s.label;
    return 'q' + id;
  }

  // transitionTable: pass hideUndefined=true to show — for undefined cells (before dead state added)
  function transitionTable(automaton, hideUndefined = false) {
    const alphabet = automaton.alphabet;
    let html = '<table><thead><tr><th>State</th>';
    for (const a of alphabet) html += `<th>${escapeHtml(a)}</th>`;
    html += '</tr></thead><tbody>';
    const stateObjs = automaton.states.map(s => typeof s === 'object' ? s : { id: s });
    const accepts = automaton.accepts;
    for (const sObj of stateObjs) {
      const id = sObj.id;
      const isDead = sObj.isDead;
      const isStart = id === automaton.start;
      const isAcc = accepts.has(id);
      const prefix = (isStart ? '→' : '') + (isAcc ? '*' : '');
      const lbl = isDead ? '∅' : `q${id}`;
      const rowClass = isDead ? 'dead-row' : (isAcc ? 'accept' : '');
      html += `<tr><td class="${rowClass}">${prefix}${lbl}</td>`;
      for (const a of alphabet) {
        let dest = null;
        for (const t of automaton.transitions) {
          if (t.from === id && t.symbol === a) { dest = t.to; break; }
        }
        if (dest === null) {
          html += `<td class="undef">—</td>`;
        } else {
          const destLabel = stateLabel(automaton, dest);
          const destDead = automaton.states.find(s => typeof s === 'object' && s.id === dest && s.isDead);
          html += `<td class="${destDead ? 'dead-cell' : ''}">${destLabel}</td>`;
        }
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Right-linear grammar derived from a (min) DFA.
  // Each state qᵢ → non-terminal Sᵢ.
  // Productions: Sᵢ → aSⱼ for each transition, Sᵢ → ε for each accept state.
  function buildGrammar(automaton) {
    const { states, transitions, accepts, start } = automaton;

    function nt(id) {
      const s = states.find(st => st.id === id);
      return (s && s.isDead) ? 'S<sub>∅</sub>' : 'S<sub>' + id + '</sub>';
    }

    // Collect productions per state
    const prodMap = new Map(states.map(s => [s.id, []]));
    for (const t of transitions) {
      prodMap.get(t.from).push(escapeHtml(t.symbol) + nt(t.to));
    }
    for (const s of states) {
      if (accepts.has(s.id)) prodMap.get(s.id).push('<span class="g-eps">ε</span>');
    }

    // Render order: start first, then non-dead (sorted), then dead states last
    const order = [
      start,
      ...states.filter(s => s.id !== start && !s.isDead).map(s => s.id).sort((a, b) => a - b),
      ...states.filter(s => s.isDead).map(s => s.id)
    ];

    let html = `<div class="grammar-block">
      <div class="grammar-head">
        <span class="grammar-title">Right-Linear Grammar</span>
        <span class="grammar-hint">start&nbsp;=&nbsp;${nt(start)}</span>
      </div>
      <table class="grammar-table"><tbody>`;

    for (const id of order) {
      const prods = prodMap.get(id);
      if (!prods || prods.length === 0) continue;
      const s       = states.find(st => st.id === id);
      const isDead  = s && s.isDead;
      const isStart = id === start;
      const isAcc   = accepts.has(id);
      const prefix  = (isStart ? '→' : ' ') + (isAcc ? '*' : ' ');
      html += `<tr class="grammar-row${isDead ? ' g-dead' : ''}">
        <td class="g-prefix">${prefix}</td>
        <td class="g-nt">${nt(id)}</td>
        <td class="g-arrow">→</td>
        <td class="g-rhs">${prods.join('&ensp;<span class="g-pipe">|</span>&ensp;')}</td>
      </tr>`;
    }

    html += `</tbody></table>
      <p class="grammar-note muted">
        Each production S<sub>i</sub>&thinsp;→&thinsp;aS<sub>j</sub> corresponds to
        transition q<sub>i</sub>&thinsp;—a→&thinsp;q<sub>j</sub>.&ensp;
        S<sub>i</sub>&thinsp;→&thinsp;ε marks an accepting state.
      </p>
    </div>`;
    return html;
  }

  NS.animator = {
    Player,
    buildParseTreeFrames,
    buildNFAFrames,
    buildDFAFrames,
    buildMinFrames,
    transitionTable,
    buildGrammar,
    escapeHtml
  };
})(window);
