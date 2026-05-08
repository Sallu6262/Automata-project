/* Smoke test for the algorithm modules. Run with: node test/smoke.js */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const sandbox = { window: {}, document: {}, console };
sandbox.window = sandbox; // self-ref so (function(global){...})(window) works
vm.createContext(sandbox);

const files = ['parser.js', 'thompson.js', 'subset.js', 'minimize.js', 'simulator.js'];
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  vm.runInContext(src, sandbox, { filename: f });
}
const NS = sandbox.RegexFA;

function check(name, cond, detail) {
  const status = cond ? 'OK ' : 'FAIL';
  console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
}

function pipeline(regex) {
  const ast = NS.parser.parse(regex);
  const nfa = NS.thompson.build(ast);
  const dfa = NS.subset.completeWithDeadState(NS.subset.build(nfa));
  const min = NS.minimize.minimize(dfa);
  return { ast, nfa, dfa, min };
}

function accepts(automaton, input) {
  const r = NS.simulator.simulate(automaton, input);
  return r.accepted;
}

// ============ Tests ============
console.log('--- pipeline test: (a|b)*abb ---');
let p = pipeline('(a|b)*abb');
console.log(`  NFA: ${p.nfa.states.length} states, ${p.nfa.transitions.length} transitions`);
console.log(`  DFA: ${p.dfa.states.length} states, ${p.dfa.transitions.length} transitions`);
console.log(`  min: ${p.min.states.length} states, ${p.min.transitions.length} transitions`);

const cases1 = [
  { s: 'abb', want: true },
  { s: 'aabb', want: true },
  { s: 'babb', want: true },
  { s: 'aabbabb', want: true },
  { s: 'ab', want: false },
  { s: '', want: false },
  { s: 'abba', want: false },
  { s: 'aaabbb', want: false } // we need ...abb at end
];
for (const c of cases1) {
  check(`(a|b)*abb on "${c.s}" expect ${c.want}`, accepts(p.min, c.s) === c.want);
}

console.log('\n--- pipeline test: a*b* ---');
p = pipeline('a*b*');
const cases2 = [
  { s: '', want: true },
  { s: 'a', want: true },
  { s: 'b', want: true },
  { s: 'aaabbb', want: true },
  { s: 'ba', want: false },
  { s: 'ab', want: true },
  { s: 'abab', want: false }
];
for (const c of cases2) {
  check(`a*b* on "${c.s}" expect ${c.want}`, accepts(p.min, c.s) === c.want);
}

console.log('\n--- pipeline test: a?b+c* ---');
p = pipeline('a?b+c*');
const cases3 = [
  { s: 'b', want: true },
  { s: 'ab', want: true },
  { s: 'bbb', want: true },
  { s: 'abc', want: true },
  { s: 'abccc', want: true },
  { s: 'a', want: false },
  { s: '', want: false },
  { s: 'aab', want: false },
  { s: 'c', want: false }
];
for (const c of cases3) {
  check(`a?b+c* on "${c.s}" expect ${c.want}`, accepts(p.min, c.s) === c.want);
}

console.log('\n--- pipeline test: (ab|ba)* ---');
p = pipeline('(ab|ba)*');
const cases4 = [
  { s: '', want: true },
  { s: 'ab', want: true },
  { s: 'ba', want: true },
  { s: 'abab', want: true },
  { s: 'abba', want: true },
  { s: 'a', want: false },
  { s: 'b', want: false },
  { s: 'aab', want: false },
  { s: 'abb', want: false }
];
for (const c of cases4) {
  check(`(ab|ba)* on "${c.s}" expect ${c.want}`, accepts(p.min, c.s) === c.want);
}

console.log('\n--- minimization invariant: |minDFA| <= |DFA| ---');
const regexes = ['(a|b)*abb', 'a*b*', 'a?b+c*', '(ab|ba)*', '(a|b)*', 'ab|cd'];
for (const r of regexes) {
  const q = pipeline(r);
  check(`${r}: min(${q.min.states.length}) ≤ dfa(${q.dfa.states.length})`,
        q.min.states.length <= q.dfa.states.length);
}

console.log('\n--- error cases ---');
function expectError(r) {
  try { NS.parser.parse(r); return false; }
  catch (e) { return true; }
}
check('unbalanced "(ab"', expectError('(ab'));
check('stray ")"',         expectError('a)'));
check('lonely "*"',        expectError('*'));

console.log('\nDone.');
