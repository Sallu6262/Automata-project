/* Regular Expression Parser
 *
 * Grammar (high → low precedence):
 *   atom     = symbol | '(' expr ')'
 *   factor   = atom ('*' | '+' | '?')*
 *   term     = factor*           (concatenation, possibly empty -> ε)
 *   expr     = term ('|' term)*
 *
 * Output is an AST with node types:
 *   { type:'symbol',  value }
 *   { type:'epsilon' }
 *   { type:'concat',  left, right }
 *   { type:'union',   left, right }
 *   { type:'star'|'plus'|'optional', child }
 */
(function (global) {
  'use strict';
  const NS = (global.RegexFA = global.RegexFA || {});

  const SPECIAL = new Set(['(', ')', '|', '*', '+', '?']);

  function clean(input) {
    // Strip whitespace; treat empty as epsilon
    return (input || '').replace(/\s+/g, '');
  }

  function parse(input) {
    const src = clean(input);
    if (src.length === 0) return { type: 'epsilon' };

    let pos = 0;
    const peek = () => src[pos];
    const consume = () => src[pos++];

    function parseExpr() {
      let left = parseTerm();
      while (peek() === '|') {
        consume();
        const right = parseTerm();
        left = { type: 'union', left, right };
      }
      return left;
    }

    function parseTerm() {
      // Empty term → epsilon (handles "(|a)" and "()" and trailing "|")
      if (pos >= src.length || peek() === ')' || peek() === '|') {
        return { type: 'epsilon' };
      }
      let left = parseFactor();
      while (pos < src.length && peek() !== ')' && peek() !== '|') {
        const right = parseFactor();
        left = { type: 'concat', left, right };
      }
      return left;
    }

    function parseFactor() {
      let atom = parseAtom();
      while (peek() === '*' || peek() === '+' || peek() === '?') {
        const op = consume();
        const t = op === '*' ? 'star' : op === '+' ? 'plus' : 'optional';
        atom = { type: t, child: atom };
      }
      return atom;
    }

    function parseAtom() {
      const c = peek();
      if (c === undefined) {
        throw new Error('Unexpected end of input');
      }
      if (c === '(') {
        consume();
        const e = parseExpr();
        if (peek() !== ')') throw new Error(`Expected ')' at position ${pos}`);
        consume();
        return e;
      }
      if (SPECIAL.has(c)) {
        throw new Error(`Unexpected '${c}' at position ${pos}`);
      }
      consume();
      return { type: 'symbol', value: c };
    }

    const ast = parseExpr();
    if (pos < src.length) {
      throw new Error(`Unexpected '${peek()}' at position ${pos}`);
    }
    return ast;
  }

  function astToString(node) {
    switch (node.type) {
      case 'symbol':   return node.value;
      case 'epsilon':  return 'ε';
      case 'concat':   return astToString(node.left) + astToString(node.right);
      case 'union':    return astToString(node.left) + '|' + astToString(node.right);
      case 'star':     return wrap(node.child) + '*';
      case 'plus':     return wrap(node.child) + '+';
      case 'optional': return wrap(node.child) + '?';
    }
  }
  function wrap(child) {
    const s = astToString(child);
    if (child.type === 'symbol' || child.type === 'epsilon') return s;
    return '(' + s + ')';
  }

  // Collect alphabet of symbols in regex (excluding ε)
  function alphabetOf(node, set = new Set()) {
    if (node.type === 'symbol') set.add(node.value);
    else if (node.left)  { alphabetOf(node.left, set); alphabetOf(node.right, set); }
    else if (node.child) { alphabetOf(node.child, set); }
    return set;
  }

  NS.parser = { parse, astToString, alphabetOf };
})(window);
