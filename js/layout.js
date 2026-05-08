/* Graph Layout
 *
 * - layoutAutomaton(): BFS-layered left-to-right layout.
 *     • States are placed in columns by BFS depth from the start.
 *     • Within each column, vertical positions are spread evenly.
 *
 * - layoutTree(): tidy-tree style layout for a parse tree.
 *     • Each node's x is the centre of its children; leaves get their
 *       own slot. Y is depth × spacing.
 */
(function (global) {
  'use strict';
  const NS = (global.RegexFA = global.RegexFA || {});

  const STATE_R = 24;

  function layoutAutomaton(automaton, options = {}) {
    const stateIds = automaton.states.map(s => typeof s === 'object' ? s.id : s);
    const start = automaton.start;

    // BFS depths
    const depth = new Map();
    depth.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      for (const t of automaton.transitions) {
        if (t.from === cur && !depth.has(t.to)) {
          depth.set(t.to, depth.get(cur) + 1);
          queue.push(t.to);
        }
      }
    }
    let maxDepth = 0;
    for (const d of depth.values()) if (d > maxDepth) maxDepth = d;
    // Unreachable states (rare, e.g. during partial step): place at far right
    for (const id of stateIds) if (!depth.has(id)) depth.set(id, maxDepth + 1);
    maxDepth = Math.max(...depth.values(), 0);

    // Dead states always go in the last column so they are visually separated
    const isDeadId = id => {
      if (!automaton.states) return false;
      const s = automaton.states.find(s => typeof s === 'object' && s.id === id);
      return s && s.isDead;
    };
    let maxNonDeadDepth = 0;
    for (const [id, d] of depth.entries()) {
      if (!isDeadId(id) && d > maxNonDeadDepth) maxNonDeadDepth = d;
    }
    for (const id of stateIds) {
      if (isDeadId(id)) depth.set(id, maxNonDeadDepth + 1);
    }
    maxDepth = Math.max(...depth.values(), 0);

    // Group by column
    const cols = new Map();
    for (const id of stateIds) {
      const d = depth.get(id);
      if (!cols.has(d)) cols.set(d, []);
      cols.get(d).push(id);
    }

    const colSpacing = options.colSpacing || 150;
    const rowSpacing = options.rowSpacing || 95;
    const padding = options.padding || 90;

    let maxCol = 0;
    for (const arr of cols.values()) if (arr.length > maxCol) maxCol = arr.length;
    const totalH = (maxCol - 1) * rowSpacing;

    const positions = new Map();
    const sortedDepths = Array.from(cols.keys()).sort((a, b) => a - b);
    sortedDepths.forEach(d => {
      const arr = cols.get(d);
      arr.sort((a, b) => a - b);
      const colH = (arr.length - 1) * rowSpacing;
      const startY = padding + totalH / 2 - colH / 2;
      arr.forEach((id, i) => {
        positions.set(id, {
          x: padding + d * colSpacing,
          y: startY + i * rowSpacing
        });
      });
    });

    const width  = padding * 2 + (sortedDepths.length - 1) * colSpacing + 30;
    const height = padding * 2 + totalH + 30;
    return { positions, width: Math.max(width, 400), height: Math.max(height, 320) };
  }

  // Tidy tree layout
  function layoutTree(root, options = {}) {
    const xSpacing = options.xSpacing || 56;
    const ySpacing = options.ySpacing || 70;
    const padding = options.padding || 50;

    // Walk to assign x using leaf-counting; y by depth
    let nextX = 0;
    function walk(node, depth) {
      const children = childrenOf(node);
      if (children.length === 0) {
        node._x = nextX++;
        node._y = depth;
        return node._x;
      }
      const xs = children.map(c => walk(c, depth + 1));
      node._x = (xs[0] + xs[xs.length - 1]) / 2;
      node._y = depth;
      return node._x;
    }
    walk(root, 0);

    // Convert to pixel coords
    const positions = new Map();
    let maxDepth = 0;
    function toPx(node, parentId, idGen) {
      const id = idGen.id++;
      node._id = id;
      positions.set(id, {
        x: padding + node._x * xSpacing,
        y: padding + node._y * ySpacing,
        node, parentId
      });
      if (node._y > maxDepth) maxDepth = node._y;
      const children = childrenOf(node);
      for (const c of children) toPx(c, id, idGen);
    }
    const idGen = { id: 0 };
    toPx(root, -1, idGen);

    const width  = padding * 2 + nextX * xSpacing + 20;
    const height = padding * 2 + maxDepth * ySpacing + 20;
    return { positions, width, height };
  }

  function childrenOf(node) {
    if (node.left)  return [node.left, node.right];
    if (node.child) return [node.child];
    return [];
  }

  NS.layout = { layoutAutomaton, layoutTree, STATE_R };
})(window);
