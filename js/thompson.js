/* Thompson's Construction: AST → ε-NFA
 *
 * Each NFA fragment has exactly one start state and one accept state.
 * Transitions use 'ε' for epsilon moves.
 *
 * For animation, we record the order in which fragments are built, with each
 * fragment described by its purpose (e.g., "concat", "star") and the slice of
 * regex it represents.
 */
(function (global) {
  'use strict';
  const NS = (global.RegexFA = global.RegexFA || {});
  const EPS = 'ε';

  function build(ast) {
    let counter = 0;
    const newState = () => counter++;
    const transitions = [];
    const alphabet = new Set();
    const buildSteps = []; // each: {kind, regex, fragment, statesAdded, transitionsAdded, depth}
    let depth = 0;

    function addTrans(from, symbol, to) {
      const t = { from, symbol, to };
      transitions.push(t);
      return t;
    }

    function buildFrag(node) {
      depth++;
      const beforeStates = counter;
      const beforeTrans = transitions.length;
      let frag;

      switch (node.type) {
        case 'symbol': {
          const s = newState(), a = newState();
          addTrans(s, node.value, a);
          alphabet.add(node.value);
          frag = { start: s, accept: a, states: [s, a] };
          break;
        }
        case 'epsilon': {
          const s = newState(), a = newState();
          addTrans(s, EPS, a);
          frag = { start: s, accept: a, states: [s, a] };
          break;
        }
        case 'concat': {
          const f1 = buildFrag(node.left);
          const f2 = buildFrag(node.right);
          addTrans(f1.accept, EPS, f2.start);
          frag = { start: f1.start, accept: f2.accept, states: [...f1.states, ...f2.states] };
          break;
        }
        case 'union': {
          const f1 = buildFrag(node.left);
          const f2 = buildFrag(node.right);
          const s = newState(), a = newState();
          addTrans(s, EPS, f1.start);
          addTrans(s, EPS, f2.start);
          addTrans(f1.accept, EPS, a);
          addTrans(f2.accept, EPS, a);
          frag = { start: s, accept: a, states: [s, ...f1.states, ...f2.states, a] };
          break;
        }
        case 'star': {
          const f = buildFrag(node.child);
          const s = newState(), a = newState();
          addTrans(s, EPS, f.start);
          addTrans(s, EPS, a);
          addTrans(f.accept, EPS, f.start);
          addTrans(f.accept, EPS, a);
          frag = { start: s, accept: a, states: [s, ...f.states, a] };
          break;
        }
        case 'plus': {
          const f = buildFrag(node.child);
          const s = newState(), a = newState();
          addTrans(s, EPS, f.start);
          addTrans(f.accept, EPS, f.start);
          addTrans(f.accept, EPS, a);
          frag = { start: s, accept: a, states: [s, ...f.states, a] };
          break;
        }
        case 'optional': {
          const f = buildFrag(node.child);
          const s = newState(), a = newState();
          addTrans(s, EPS, f.start);
          addTrans(s, EPS, a);
          addTrans(f.accept, EPS, a);
          frag = { start: s, accept: a, states: [s, ...f.states, a] };
          break;
        }
        default:
          throw new Error('Unknown AST node type: ' + node.type);
      }

      const statesAdded = [];
      for (let i = beforeStates; i < counter; i++) statesAdded.push(i);
      const transitionsAdded = transitions.slice(beforeTrans);

      buildSteps.push({
        kind: node.type,
        regex: NS.parser.astToString(node),
        node,
        fragment: { start: frag.start, accept: frag.accept },
        statesAdded,
        transitionsAdded,
        depth: depth - 1
      });

      depth--;
      return frag;
    }

    const root = buildFrag(ast);
    return {
      states: Array.from({ length: counter }, (_, i) => i),
      start: root.start,
      accepts: new Set([root.accept]),
      transitions,
      alphabet: Array.from(alphabet).sort(),
      buildSteps
    };
  }

  NS.thompson = { build, EPS };
})(window);
