/* Subset Construction: ε-NFA → DFA
 *
 * Algorithm:
 *   1. Compute ε-closure of the NFA's start → first DFA state
 *   2. For each unprocessed DFA state T:
 *        For each input symbol a:
 *          U = ε-closure( move(T, a) )
 *          If U is non-empty, register U as a DFA state and add T --a--> U.
 *   3. A DFA state is accepting iff it contains any NFA accept state.
 *
 * For animation we record each ε-closure / move computation and which DFA
 * state was discovered as a result.
 */
(function (global) {
  'use strict';
  const NS = (global.RegexFA = global.RegexFA || {});
  const EPS = 'ε';

  function epsilonClosure(states, transitions) {
    const closure = new Set(states);
    const stack = [...states];
    while (stack.length) {
      const s = stack.pop();
      for (const t of transitions) {
        if (t.from === s && t.symbol === EPS && !closure.has(t.to)) {
          closure.add(t.to);
          stack.push(t.to);
        }
      }
    }
    return closure;
  }

  function move(states, symbol, transitions) {
    const result = new Set();
    for (const t of transitions) {
      if (t.symbol === symbol && states.has(t.from)) {
        result.add(t.to);
      }
    }
    return result;
  }

  function setKey(set) {
    return Array.from(set).sort((a, b) => a - b).join(',');
  }

  function build(nfa) {
    const dfaStates = []; // { id, nfaStates:Set, isAccept, key, label }
    const dfaTransitions = [];
    const stateMap = new Map();
    const buildSteps = [];

    function add(nfaSet) {
      const key = setKey(nfaSet);
      if (stateMap.has(key)) return { id: stateMap.get(key), isNew: false };
      const id = dfaStates.length;
      const isAccept = Array.from(nfaSet).some(s => nfa.accepts.has(s));
      const label = '{' + Array.from(nfaSet).sort((a,b)=>a-b).join(',') + '}';
      dfaStates.push({ id, nfaStates: nfaSet, isAccept, key, label });
      stateMap.set(key, id);
      return { id, isNew: true };
    }

    const startSet = epsilonClosure([nfa.start], nfa.transitions);
    const startEntry = add(startSet);
    buildSteps.push({
      kind: 'init',
      stateId: startEntry.id,
      nfaStates: Array.from(startSet),
      reason: `Start with ε-closure(q${nfa.start}) = {${Array.from(startSet).sort((a,b)=>a-b).map(x=>'q'+x).join(', ')}}`
    });

    const queue = [startEntry.id];
    while (queue.length) {
      const tId = queue.shift();
      const t = dfaStates[tId];
      const stepEntry = {
        kind: 'process',
        stateId: tId,
        nfaStates: Array.from(t.nfaStates),
        moves: []
      };
      for (const symbol of nfa.alphabet) {
        const m = move(t.nfaStates, symbol, nfa.transitions);
        if (m.size === 0) continue;
        const closure = epsilonClosure(Array.from(m), nfa.transitions);
        const entry = add(closure);
        if (entry.isNew) queue.push(entry.id);
        dfaTransitions.push({ from: tId, symbol, to: entry.id });
        stepEntry.moves.push({
          symbol,
          moveSet: Array.from(m),
          closure: Array.from(closure),
          to: entry.id,
          isNew: entry.isNew
        });
      }
      if (stepEntry.moves.length) buildSteps.push(stepEntry);
    }

    return {
      states: dfaStates,
      start: 0,
      accepts: new Set(dfaStates.filter(s => s.isAccept).map(s => s.id)),
      transitions: dfaTransitions,
      alphabet: nfa.alphabet,
      buildSteps
    };
  }

  /* Post-processing: for each DFA state that is missing transitions on one or
   * more symbols, add a dedicated dead (trap) state for it.  Every dead state
   * self-loops on all symbols and is non-accepting.  Multiple dead states
   * produced here will be merged into a single ∅ state during minimisation
   * because they all have identical transition signatures.
   * Returns the same dfa object if it is already complete. */
  function completeWithDeadState(dfa) {
    // Group missing symbols by source state
    const missingByState = new Map();
    for (const s of dfa.states) {
      for (const sym of dfa.alphabet) {
        if (!dfa.transitions.some(t => t.from === s.id && t.symbol === sym)) {
          if (!missingByState.has(s.id)) missingByState.set(s.id, []);
          missingByState.get(s.id).push(sym);
        }
      }
    }
    if (missingByState.size === 0) return dfa; // already complete

    const newStates = [...dfa.states];
    const newTransitions = [...dfa.transitions];
    let nextId = dfa.states.length;
    let totalMissing = 0;

    for (const [sourceId, missingSyms] of missingByState.entries()) {
      const deadId = nextId++;
      newStates.push({
        id: deadId,
        nfaStates: new Set(),
        isAccept: false,
        isDead: true,
        key: `__dead__${sourceId}`,
        label: '∅'
      });
      for (const sym of missingSyms) {
        newTransitions.push({ from: sourceId, symbol: sym, to: deadId });
        totalMissing++;
      }
      // Self-loops on every symbol keep the dead state as a proper trap
      for (const sym of dfa.alphabet) {
        newTransitions.push({ from: deadId, symbol: sym, to: deadId });
      }
    }

    const deadStep = {
      kind: 'dead',
      missingCount: totalMissing,
      reason: `${totalMissing} undefined transition${totalMissing > 1 ? 's' : ''} filled with ` +
              `${missingByState.size} dead state${missingByState.size > 1 ? 's' : ''} ∅`
    };

    return {
      ...dfa,
      states: newStates,
      accepts: dfa.accepts,
      transitions: newTransitions,
      buildSteps: [...dfa.buildSteps, deadStep]
    };
  }

  NS.subset = { build, completeWithDeadState, epsilonClosure, move };
})(window);
