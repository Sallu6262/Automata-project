/* SVG Visualizer for Automata + Parse Trees
 *
 * Renders into a host <svg> element. Supports:
 *   - Automata (NFA / DFA / minimal DFA) with layered layout
 *   - Parse trees (operator + leaf nodes)
 *   - Stable element identity via data-* attributes so the animator can
 *     reveal / hide / highlight elements after the initial render.
 */
(function (global) {
  'use strict';
  const NS = (global.RegexFA = global.RegexFA || {});
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const R = NS.layout.STATE_R;

  function svgEl(name, attrs = {}, parent = null) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      el.setAttribute(k, v);
    }
    if (parent) parent.appendChild(el);
    return el;
  }

  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }

  function ensureDefs(svg) {
    const defs = svgEl('defs', {}, svg);
    // Default arrow
    const arrow = svgEl('marker', {
      id: 'arrowhead', viewBox: '0 0 10 10',
      refX: 9, refY: 5, markerWidth: 6, markerHeight: 6,
      orient: 'auto-start-reverse'
    }, defs);
    svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#aab7d8' }, arrow);
    // Active arrow
    const arrowA = svgEl('marker', {
      id: 'arrowhead-active', viewBox: '0 0 10 10',
      refX: 9, refY: 5, markerWidth: 6, markerHeight: 6,
      orient: 'auto-start-reverse'
    }, defs);
    svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#34d399' }, arrowA);
    // Epsilon arrow
    const arrowE = svgEl('marker', {
      id: 'arrowhead-eps', viewBox: '0 0 10 10',
      refX: 9, refY: 5, markerWidth: 6, markerHeight: 6,
      orient: 'auto-start-reverse'
    }, defs);
    svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#a78bfa' }, arrowE);
    return defs;
  }

  /* ============================================================
   * Automaton renderer
   * ============================================================ */
  function renderAutomaton(svg, automaton, layout, options = {}) {
    clear(svg);
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute('width', layout.width);
    svg.setAttribute('height', layout.height);
    svg.setAttribute('overflow', 'visible');  // allow arcs/labels to extend past viewbox edge

    ensureDefs(svg);
    const edgeLayer  = svgEl('g', { class: 'edges' }, svg);
    const stateLayer = svgEl('g', { class: 'states' }, svg);

    // Collapse parallel transitions same-from-same-to
    const edgeMap = new Map();
    for (const t of automaton.transitions) {
      const key = `${t.from}|${t.to}`;
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key).push(t.symbol);
    }
    // Detect bidirectional pairs
    const bi = new Set();
    for (const k of edgeMap.keys()) {
      const [a, b] = k.split('|');
      if (a !== b && edgeMap.has(`${b}|${a}`)) bi.add(k);
    }

    for (const [key, symbols] of edgeMap.entries()) {
      const [fromS, toS] = key.split('|');
      const from = +fromS, to = +toS;
      drawEdge(edgeLayer, from, to, symbols, layout.positions, bi.has(key));
    }

    const stateIds = automaton.states.map(s => typeof s === 'object' ? s.id : s);
    for (const id of stateIds) {
      const stateObj = options.isNFA ? null : automaton.states.find(s => s.id === id);
      const isAccept = automaton.accepts.has(id);
      const isStart  = id === automaton.start;
      const isDead   = !options.isNFA && stateObj && stateObj.isDead;
      const sublabel = options.subLabel ? options.subLabel(id, stateObj) : null;
      drawState(stateLayer, id, layout.positions.get(id), isAccept, isStart, sublabel, isDead);
    }

    // After elements are in DOM, fix up edge label backgrounds
    fixupEdgeLabels(edgeLayer);
  }

  function drawState(parent, id, pos, isAccept, isStart, sublabel, isDead) {
    const cls = ['state'];
    if (isAccept) cls.push('accept');
    if (isStart)  cls.push('start');
    if (isDead)   cls.push('dead');
    const g = svgEl('g', {
      class: cls.join(' '),
      'data-state': id,
      transform: `translate(${pos.x}, ${pos.y})`
    }, parent);

    if (isAccept) {
      svgEl('circle', { r: R + 4, class: 'outer' }, g);
    }
    svgEl('circle', { r: R, class: 'bg' }, g);

    const text = svgEl('text', {
      class: 'label',
      'text-anchor': 'middle',
      'dominant-baseline': 'central'
    }, g);
    text.textContent = isDead ? '∅' : `q${id}`;

    if (sublabel && !isDead) {
      const sub = svgEl('text', {
        class: 'sublabel',
        x: 0, y: R + 14,
        'text-anchor': 'middle'
      }, g);
      sub.textContent = sublabel;
    }

    if (isStart) {
      svgEl('line', {
        class: 'start-arrow',
        x1: -R - 26, y1: 0, x2: -R - 2, y2: 0,
        'marker-end': 'url(#arrowhead)'
      }, g);
    }
  }

  function drawEdge(parent, from, to, symbols, positions, isBi) {
    const isEps = symbols.length === 1 && symbols[0] === 'ε';
    const cls = ['edge'];
    if (isEps) cls.push('eps');
    const g = svgEl('g', {
      class: cls.join(' '),
      'data-from': from,
      'data-to': to,
      'data-symbols': symbols.join(',')
    }, parent);

    const A = positions.get(from);
    const B = positions.get(to);

    if (from === to) {
      // Self-loop above the state
      const r = 22;
      const cx = A.x;
      const cy = A.y - R - r + 4;
      // Path: from top-left of circle, looping over, to top-right
      const sx = A.x - 10, sy = A.y - R + 2;
      const ex = A.x + 10, ey = A.y - R + 2;
      const c1x = A.x - 40, c1y = A.y - R - 50;
      const c2x = A.x + 40, c2y = A.y - R - 50;
      const d = `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`;
      svgEl('path', {
        d, class: 'stroke', fill: 'none',
        'marker-end': isEps ? 'url(#arrowhead-eps)' : 'url(#arrowhead)'
      }, g);
      const lblText = svgEl('text', {
        x: cx, y: cy - 6, 'text-anchor': 'middle'
      }, g);
      lblText.textContent = symbols.join(', ');
      return g;
    }

    const dx = B.x - A.x, dy = B.y - A.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const sx = A.x + ux * R;
    const sy = A.y + uy * R;
    const ex = B.x - ux * (R + 4);
    const ey = B.y - uy * (R + 4);

    let d, lx, ly;
    const isBackward    = B.x < A.x - 10;
    const isLongForward = !isBackward && (B.x - A.x) > 180;

    if (isBackward) {
      // Arc below — height scales with span so stacked backward edges don't overlap
      const xSpan = A.x - B.x;
      const arcH  = Math.max(45, xSpan * 0.25);
      const cmx   = (A.x + B.x) / 2;
      const cmy   = Math.max(A.y, B.y) + arcH;
      d = `M ${sx} ${sy} Q ${cmx} ${cmy} ${ex} ${ey}`;
      // Label at Bezier midpoint (t=0.5): (P0 + 2·P1 + P2) / 4
      lx = (sx + 2 * cmx + ex) / 4;
      ly = (sy + 2 * cmy + ey) / 4 + 12;
    } else if (isLongForward) {
      // Long forward edge: arc above so it doesn't pass through intermediate state circles
      const xSpan = B.x - A.x;
      const arcH  = Math.max(70, xSpan * 0.18);
      const cmx   = (A.x + B.x) / 2;
      const cmy   = Math.min(A.y, B.y) - arcH;
      d = `M ${sx} ${sy} Q ${cmx} ${cmy} ${ex} ${ey}`;
      lx = (sx + 2 * cmx + ex) / 4;
      ly = (sy + 2 * cmy + ey) / 4 - 8;
    } else if (isBi) {
      // Bidirectional forward edge: slight arc above using perpendicular offset
      const px  = -uy, py = ux;
      const off = -24;  // negative = above in SVG (y increases downward)
      const cmx = (sx + ex) / 2 + px * off;
      const cmy = (sy + ey) / 2 + py * off;
      d = `M ${sx} ${sy} Q ${cmx} ${cmy} ${ex} ${ey}`;
      lx = (sx + 2 * cmx + ex) / 4;
      ly = (sy + 2 * cmy + ey) / 4 - 6;
    } else {
      d = `M ${sx} ${sy} L ${ex} ${ey}`;
      lx = (sx + ex) / 2;
      ly = (sy + ey) / 2 - 8;
    }

    svgEl('path', {
      d, class: 'stroke', fill: 'none',
      'marker-end': isEps ? 'url(#arrowhead-eps)' : 'url(#arrowhead)'
    }, g);

    // Label background (filled later)
    const bg = svgEl('rect', {
      class: 'edge-label-bg',
      fill: '#0b1020', rx: 4, ry: 4
    }, g);
    const text = svgEl('text', {
      x: lx, y: ly, 'text-anchor': 'middle',
      'dominant-baseline': 'central'
    }, g);
    text.textContent = symbols.join(', ');
    return g;
  }

  function fixupEdgeLabels(edgeLayer) {
    const texts = edgeLayer.querySelectorAll('text');
    for (const text of texts) {
      const bg = text.previousElementSibling;
      if (!bg || bg.tagName.toLowerCase() !== 'rect') continue;
      try {
        const bbox = text.getBBox();
        if (bbox.width === 0) continue;
        bg.setAttribute('x', bbox.x - 4);
        bg.setAttribute('y', bbox.y - 1);
        bg.setAttribute('width', bbox.width + 8);
        bg.setAttribute('height', bbox.height + 2);
      } catch (e) { /* SVG not yet measurable */ }
    }
  }

  /* ============================================================
   * State / edge mutation helpers (used by animator)
   * ============================================================ */
  function setStateVisible(svg, id, visible) {
    const el = svg.querySelector(`g.state[data-state="${id}"]`);
    if (!el) return;
    el.style.display = visible ? '' : 'none';
  }
  function setEdgeVisible(svg, from, to, visible) {
    const el = svg.querySelector(`g.edge[data-from="${from}"][data-to="${to}"]`);
    if (!el) return;
    el.style.display = visible ? '' : 'none';
  }
  function showAllStates(svg) {
    svg.querySelectorAll('g.state').forEach(e => e.style.display = '');
  }
  function showAllEdges(svg) {
    svg.querySelectorAll('g.edge').forEach(e => e.style.display = '');
  }
  function hideAllStates(svg) {
    svg.querySelectorAll('g.state').forEach(e => e.style.display = 'none');
  }
  function hideAllEdges(svg) {
    svg.querySelectorAll('g.edge').forEach(e => e.style.display = 'none');
  }
  function setStateClass(svg, id, cls, on) {
    const el = svg.querySelector(`g.state[data-state="${id}"]`);
    if (!el) return;
    el.classList.toggle(cls, !!on);
  }
  function setEdgeClass(svg, from, to, cls, on) {
    const el = svg.querySelector(`g.edge[data-from="${from}"][data-to="${to}"]`);
    if (!el) return;
    el.classList.toggle(cls, !!on);
  }
  function clearAllClasses(svg, cls) {
    svg.querySelectorAll('.' + cls).forEach(e => e.classList.remove(cls));
  }
  function pulseState(svg, id) {
    const el = svg.querySelector(`g.state[data-state="${id}"]`);
    if (!el) return;
    el.classList.remove('flash');
    void el.getBoundingClientRect(); // force reflow
    el.classList.add('flash');
  }
  function setStateFill(svg, id, color) {
    const el = svg.querySelector(`g.state[data-state="${id}"] circle.bg`);
    if (el) el.style.fill = color || '';
  }

  /* ============================================================
   * Parse Tree renderer
   * ============================================================ */
  function renderParseTree(svg, ast) {
    clear(svg);
    const layout = NS.layout.layoutTree(ast);
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute('width', layout.width);
    svg.setAttribute('height', layout.height);

    ensureDefs(svg);
    const edgeLayer = svgEl('g', { class: 'tree-edges' }, svg);
    const nodeLayer = svgEl('g', { class: 'tree-nodes' }, svg);

    // Edges (parent → child)
    for (const [, p] of layout.positions) {
      if (p.parentId === -1) continue;
      const parent = layout.positions.get(p.parentId);
      const d = `M ${parent.x} ${parent.y + 18} C ${parent.x} ${parent.y + 40}, ${p.x} ${p.y - 40}, ${p.x} ${p.y - 18}`;
      svgEl('path', { d, class: 'tree-edge' }, edgeLayer);
    }

    // Nodes
    for (const [id, p] of layout.positions) {
      const isLeaf = p.node.type === 'symbol' || p.node.type === 'epsilon';
      const cls = ['tree-node', isLeaf ? 'leaf' : 'op'];
      const g = svgEl('g', { class: cls.join(' '), transform: `translate(${p.x}, ${p.y})`, 'data-node-id': id }, nodeLayer);
      svgEl('circle', { r: 18 }, g);
      const txt = svgEl('text', {}, g);
      txt.textContent = labelOf(p.node);
    }
  }

  function labelOf(node) {
    switch (node.type) {
      case 'symbol':   return node.value;
      case 'epsilon':  return 'ε';
      case 'concat':   return '·';
      case 'union':    return '|';
      case 'star':     return '*';
      case 'plus':     return '+';
      case 'optional': return '?';
    }
    return '?';
  }

  NS.visualizer = {
    renderAutomaton,
    renderParseTree,
    fixupEdgeLabels,
    setStateVisible, setEdgeVisible,
    showAllStates, showAllEdges,
    hideAllStates, hideAllEdges,
    setStateClass, setEdgeClass,
    clearAllClasses,
    pulseState, setStateFill
  };
})(window);
