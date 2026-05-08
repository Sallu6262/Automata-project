/* DFA Minimization via Partition Refinement
 *
 * Algorithm (Hopcroft-style, naive O(n²·|Σ|) version chosen for clarity):
 *   1. Initial partition: {accepting states, non-accepting states}.
 *   2. Repeatedly split each group: two states stay together iff for every
 *      input symbol their transitions lead into the same group of the
 *      current partition (or both have no transition on that symbol).
 *   3. Stop when no group is split — each group becomes a state of the
 *      minimal DFA.
 *
 * For animation we record the partition at each refinement step.
 */
(function (global) {
  'use strict';
  const NS = (global.RegexFA = global.RegexFA || {});

  function minimize(dfa) {
    // Reachability filter (defensive — subset construction only emits reachable states)
    const reachable = new Set([dfa.start]);
    const stack = [dfa.start];
    while (stack.length) {
      const s = stack.pop();
      for (const t of dfa.transitions) {
        if (t.from === s && !reachable.has(t.to)) {
          reachable.add(t.to);
          stack.push(t.to);
        }
      }
    }
    const liveStates = dfa.states.filter(s => reachable.has(s.id)).map(s => s.id);
    const liveTransitions = dfa.transitions.filter(t => reachable.has(t.from));
    const accepts = new Set(Array.from(dfa.accepts).filter(id => reachable.has(id)));

    // Initial partition
    const accepting = liveStates.filter(s => accepts.has(s));
    const nonAcc   = liveStates.filter(s => !accepts.has(s));
    let partition = [];
    if (nonAcc.length)   partition.push(new Set(nonAcc));
    if (accepting.length) partition.push(new Set(accepting));

    const groupOf = (id, p) => p.findIndex(g => g.has(id));
    const transTo = (id, sym) => {
      for (const t of liveTransitions) {
        if (t.from === id && t.symbol === sym) return t.to;
      }
      return -1; // no transition
    };

    const buildSteps = [];
    buildSteps.push({
      kind: 'initial',
      partition: partition.map(g => Array.from(g)),
      reason: 'Split states into Accepting vs. Non-accepting groups.'
    });

    let changed = true;
    let iter = 0;
    while (changed && iter < 100) {
      changed = false;
      iter++;
      const next = [];
      const splitInfo = [];
      for (const group of partition) {
        // Bucket by signature of (group-of-each-transition)
        const buckets = new Map();
        for (const id of group) {
          const sig = dfa.alphabet
            .map(sym => {
              const tgt = transTo(id, sym);
              return tgt === -1 ? '∅' : groupOf(tgt, partition);
            })
            .join('|');
          if (!buckets.has(sig)) buckets.set(sig, new Set());
          buckets.get(sig).add(id);
        }
        if (buckets.size > 1) {
          changed = true;
          splitInfo.push({
            before: Array.from(group),
            after: Array.from(buckets.values()).map(s => Array.from(s))
          });
        }
        for (const b of buckets.values()) next.push(b);
      }
      partition = next;
      if (changed) {
        buildSteps.push({
          kind: 'refine',
          partition: partition.map(g => Array.from(g)),
          splits: splitInfo,
          reason: 'A group contained states whose transitions led into different groups — split them apart.'
        });
      }
    }

    buildSteps.push({
      kind: 'final',
      partition: partition.map(g => Array.from(g)),
      reason: 'Partition is stable — each group becomes one state of the minimal DFA.'
    });

    // Build minimal DFA
    const newStates = partition.map((group, idx) => {
      const arr = Array.from(group).sort((a, b) => a - b);
      // Propagate dead-state flag: a new state is dead iff all its members were dead
      const isDead = arr.every(s => {
        const orig = dfa.states.find(st => st.id === s);
        return orig && orig.isDead;
      });
      const label = isDead ? '∅' :
        arr.length === 1 ? `q${arr[0]}` : `{${arr.map(s => 'q' + s).join(',')}}`;
      return {
        id: idx,
        members: arr,
        isAccept: arr.some(s => accepts.has(s)),
        isDead,
        label
      };
    });
    const newId = (oldId) => groupOf(oldId, partition);
    const startNew = newId(dfa.start);
    const newAccepts = new Set(newStates.filter(s => s.isAccept).map(s => s.id));

    const seen = new Set();
    const newTransitions = [];
    for (const t of liveTransitions) {
      const f = newId(t.from);
      const u = newId(t.to);
      const k = `${f}|${t.symbol}|${u}`;
      if (seen.has(k)) continue;
      seen.add(k);
      newTransitions.push({ from: f, symbol: t.symbol, to: u });
    }

    return {
      states: newStates,
      start: startNew,
      accepts: newAccepts,
      transitions: newTransitions,
      alphabet: dfa.alphabet,
      buildSteps
    };
  }

  NS.minimize = { minimize };
})(window);
