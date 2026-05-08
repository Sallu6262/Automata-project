/* Regex Equivalence Checker
 *
 * checkEquivalence(r1, r2) → { equivalent, counterexample, firstAccepts, mapping, min1, min2 }
 *                          | { error }
 *
 * Algorithm: product automaton BFS (symmetric difference).
 *   State: (s1, s2) from min-DFA1 × min-DFA2.
 *   If any reachable pair has differing accept status → not equivalent;
 *   reconstruct the BFS path to get the shortest counterexample string.
 *   If BFS completes without finding a difference → equivalent.
 *
 * Isomorphism: when equivalent, a second BFS produces the state mapping.
 */
(function (global) {
  'use strict';
  const NS = (global.RegexFA = global.RegexFA || {});

  const DEAD = -1; // virtual dead state for symbols outside a DFA's alphabet

  function buildPipeline(regex) {
    const ast = NS.parser.parse(regex);
    const nfa = NS.thompson.build(ast);
    const dfa = NS.subset.completeWithDeadState(NS.subset.build(nfa));
    return NS.minimize.minimize(dfa);
  }

  function step(dfa, state, sym) {
    if (state === DEAD) return DEAD;
    for (const t of dfa.transitions) {
      if (t.from === state && t.symbol === sym) return t.to;
    }
    return DEAD; // symbol not in alphabet, or no transition (shouldn't happen post-complete)
  }

  function isAcc(dfa, state) {
    return state !== DEAD && dfa.accepts.has(state);
  }

  // BFS on product automaton; returns shortest counterexample string or null if equivalent.
  function findCounterexample(d1, d2) {
    const alpha = [...new Set([...d1.alphabet, ...d2.alphabet])];
    const init  = `${d1.start}:${d2.start}`;
    // parent map: key → { parentKey, symbol } or null for root
    const prev  = new Map([[init, null]]);
    const queue = [{ k: init, s1: d1.start, s2: d2.start }];

    while (queue.length) {
      const { k, s1, s2 } = queue.shift();

      // Acceptance differs → counterexample found
      if (isAcc(d1, s1) !== isAcc(d2, s2)) {
        const syms = [];
        let cur = k;
        while (prev.get(cur) !== null) {
          const { parentKey, symbol } = prev.get(cur);
          syms.unshift(symbol);
          cur = parentKey;
        }
        return syms.join('');
      }

      for (const sym of alpha) {
        const n1 = step(d1, s1, sym);
        const n2 = step(d2, s2, sym);
        const nk = `${n1}:${n2}`;
        if (!prev.has(nk)) {
          prev.set(nk, { parentKey: k, symbol: sym });
          queue.push({ k: nk, s1: n1, s2: n2 });
        }
      }
    }
    return null; // no counterexample → equivalent
  }

  // BFS isomorphism matching. Returns Map(id1 → id2) or null if not isomorphic.
  function findIsomorphism(d1, d2) {
    if (d1.states.length !== d2.states.length) return null;
    const alpha = [...new Set([...d1.alphabet, ...d2.alphabet])];
    const fwd   = new Map([[d1.start, d2.start]]);
    const bwd   = new Map([[d2.start, d1.start]]);
    const queue = [[d1.start, d2.start]];

    while (queue.length) {
      const [s1, s2] = queue.shift();
      if (isAcc(d1, s1) !== isAcc(d2, s2)) return null;
      const st1 = d1.states.find(s => s.id === s1);
      const st2 = d2.states.find(s => s.id === s2);
      if (!!(st1 && st1.isDead) !== !!(st2 && st2.isDead)) return null;

      for (const sym of alpha) {
        const n1 = step(d1, s1, sym);
        const n2 = step(d2, s2, sym);
        if ((n1 === DEAD) !== (n2 === DEAD)) return null;
        if (n1 === DEAD) continue;
        if (fwd.has(n1)) {
          if (fwd.get(n1) !== n2) return null; // conflict
        } else {
          if (bwd.has(n2)) return null; // n2 already mapped differently
          fwd.set(n1, n2);
          bwd.set(n2, n1);
          queue.push([n1, n2]);
        }
      }
    }
    return fwd;
  }

  function checkEquivalence(r1, r2) {
    try {
      const min1 = buildPipeline(r1);
      const min2 = buildPipeline(r2);
      const ce   = findCounterexample(min1, min2);
      if (ce !== null) {
        const res = NS.simulator.simulate(min1, ce);
        return { equivalent: false, counterexample: ce, firstAccepts: res.accepted, min1, min2 };
      }
      return { equivalent: true, mapping: findIsomorphism(min1, min2), min1, min2 };
    } catch (err) {
      return { error: err.message };
    }
  }

  NS.equivalence = { checkEquivalence };
})(window);
