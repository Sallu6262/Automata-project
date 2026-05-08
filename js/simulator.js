/* DFA Simulator
 *
 * simulate(dfa, input) → { accepted, trace }
 *   trace[i] describes the state of the machine after reading i characters.
 *   trace[0] is the initial configuration.
 *   trace[i].edge (i ≥ 1) describes the transition that was taken.
 *   trace[i].state is null and .dead = true if the machine got stuck.
 */
(function (global) {
  'use strict';
  const NS = (global.RegexFA = global.RegexFA || {});

  function simulate(dfa, input) {
    // Collect ids of dead (trap) states so we can annotate trace entries
    const deadIds = new Set(
      (dfa.states || [])
        .filter(s => typeof s === 'object' && s.isDead)
        .map(s => s.id)
    );

    const trace = [];
    let cur = dfa.start;
    let everEnteredDead = false;
    trace.push({
      step: 0,
      state: cur,
      consumed: '',
      remaining: input,
      accepted: dfa.accepts.has(cur),
      isDead: deadIds.has(cur),
      justEnteredDead: false
    });

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      let next = null;
      for (const t of dfa.transitions) {
        if (t.from === cur && t.symbol === ch) { next = t.to; break; }
      }

      // Incomplete DFA fallback (shouldn't happen after completeWithDeadState)
      if (next === null) {
        trace.push({
          step: i + 1, state: null, char: ch,
          consumed: input.slice(0, i + 1), remaining: input.slice(i + 1),
          accepted: false, dead: true,
          edge: { from: cur, to: null, symbol: ch }
        });
        return { accepted: false, trace, deadAt: i + 1 };
      }

      const prev = cur;
      cur = next;
      const isNowDead = deadIds.has(cur);
      const justEnteredDead = isNowDead && !everEnteredDead;
      if (isNowDead) everEnteredDead = true;

      trace.push({
        step: i + 1, state: cur, char: ch,
        consumed: input.slice(0, i + 1), remaining: input.slice(i + 1),
        accepted: dfa.accepts.has(cur),
        isDead: isNowDead,
        justEnteredDead,
        edge: { from: prev, to: cur, symbol: ch }
      });
    }
    return { accepted: dfa.accepts.has(cur), trace };
  }

  NS.simulator = { simulate };
})(window);
