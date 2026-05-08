# Regex → Finite Automata Visualizer

An interactive, browser-based educational tool that converts regular expressions into finite automata step-by-step, with animated visualizations at every stage of the transformation pipeline.

---

## Live Demo

Open `index.html` directly in any modern browser — no server, no build step, no dependencies.

---

## Features

### Core Pipeline (Compulsory Requirements)
| Stage | Algorithm | Description |
|-------|-----------|-------------|
| **Parse Tree** | Recursive-descent parser | Parses the regex into an AST showing operator precedence |
| **ε-NFA** | Thompson's Construction | Converts the AST into a nondeterministic finite automaton with ε-transitions |
| **DFA** | Subset Construction | Converts the ε-NFA into a deterministic finite automaton via ε-closure + power-set |
| **Minimal DFA** | Partition Refinement (Hopcroft-style) | Minimizes the DFA by merging indistinguishable states |
| **String Simulation** | DFA trace | Animates step-by-step acceptance or rejection of any input string |

### Bonus Features
- **Right-Linear Grammar** — derived from the minimal DFA and displayed in the Min DFA and Simulate tabs, showing every production rule Sᵢ → aS j | ε with start state (→) and accept states (*) clearly marked
- **Regex Equivalence Checker** — takes two regex, builds their minimal DFAs, and checks equivalence via product-automaton BFS (symmetric difference); if inequivalent, finds the shortest counterexample string; if equivalent, shows a color-coded state isomorphism mapping and renders both minimal DFAs side by side
- **Dead-state visualization** — each source state with missing transitions gets its own ∅ trap state in the DFA (making the automaton fully complete), and all trap states are merged into a single ∅ during minimization
- **8 built-in examples** — selectable from a dropdown to immediately explore interesting automata

---

## Supported Regex Syntax

| Operator | Meaning |
|----------|---------|
| `a`, `b`, `0`… | Literal symbol |
| `RS` | Concatenation |
| `R\|S` | Alternation (union) |
| `R*` | Kleene star (zero or more) |
| `R+` | One or more |
| `R?` | Zero or one (optional) |
| `(R)` | Grouping |

Whitespace is ignored. Any printable character that is not an operator is a valid symbol.

---

## Screenshot Overview

```
┌─────────────────────────────────────────────────────┐
│  λ  Regex → Finite Automata                         │
│     Thompson · Subset Construction · DFA Minimization│
├─────────────────────────────────────────────────────┤
│  Regular Expression: [ (a|b)*abb        ] [Convert] │
├──────┬──────┬──────┬───────────┬─────────────────────┤
│  1   │  2   │  3   │     4     │        5            │
│Parse │ NFA  │ DFA  │ Minimal   │    Simulate         │
│Tree  │      │      │   DFA     │                     │
├──────┴──────┴──────┴───────────┴─────────────────────┤
│  [SVG visualization]           [Step description     │
│                                 + Transition table   │
│                                 + Right-Linear       │
│                                   Grammar]           │
│  ◀  ▶  ▶▶  ↺    Step: 3/7     Speed ────────        │
└─────────────────────────────────────────────────────┘
│  Regex Equivalence Checker                          │
│  [ Regex 1 ]  ≡?  [ Regex 2 ]  [Check]             │
│  ✓ Equivalent — both describe the same language     │
│  [Min DFA 1 SVG]       [Min DFA 2 SVG]              │
└─────────────────────────────────────────────────────┘
```

---

## How to Use

1. **Enter a regex** in the input box (or pick one from the dropdown) and click **Convert**.
2. Use the **tab bar** to switch between pipeline stages:
   - **Tab 1 — Parse Tree**: visual tree of the regex's operator structure
   - **Tab 2 — NFA**: ε-NFA built by Thompson's construction, fragment by fragment
   - **Tab 3 — DFA**: DFA states constructed by subset construction, one ε-closure at a time
   - **Tab 4 — Minimal DFA**: partition refinement steps + right-linear grammar table
   - **Tab 5 — Simulate**: run any input string; tape cells turn green (consumed) or red (rejected)
3. Use **◀ ▶ ▶▶** to step through the animation or **▶** to autoplay. Adjust speed with the slider.
4. Scroll down to the **Equivalence Checker** to compare two regex — it shows the result badge, the shortest counterexample (if any), and both minimal DFAs rendered side by side with matching states color-coded.

---

## Project Structure

```
automata-project/
├── index.html          # Single-page application shell
├── styles.css          # Dark-theme CSS (no framework)
├── js/
│   ├── parser.js       # Recursive-descent regex parser → AST
│   ├── thompson.js     # Thompson's construction: AST → ε-NFA
│   ├── subset.js       # Subset construction: ε-NFA → DFA + dead-state completion
│   ├── minimize.js     # Hopcroft-style partition refinement: DFA → minimal DFA
│   ├── layout.js       # BFS-layered left-to-right graph layout
│   ├── visualizer.js   # SVG renderer (states, edges, Bézier arcs, labels)
│   ├── animator.js     # Frame-based step player + transition table + grammar builder
│   ├── simulator.js    # DFA string simulation with trace
│   ├── equivalence.js  # Regex equivalence checker (product automaton BFS)
│   └── app.js          # UI orchestration, tab switching, event wiring
└── test/
    └── smoke.js        # Node.js smoke tests (30 acceptance/rejection test cases)
```

All modules are plain ES5-compatible IIFEs sharing a single `window.RegexFA` namespace — no bundler required.

---

## Algorithm Details

### 1. Parsing
Recursive-descent parser following the grammar:
```
expr   = term ('|' term)*
term   = factor*
factor = atom ('*' | '+' | '?')*
atom   = symbol | '(' expr ')'
```
Outputs an AST with node types: `symbol`, `epsilon`, `concat`, `union`, `star`, `plus`, `optional`.

### 2. Thompson's Construction
Each AST node type maps to a standard NFA fragment with exactly one start and one accept state:
- **symbol** `a`: two states, one transition on `a`
- **concat** `RS`: connect accept of R to start of S via ε
- **union** `R|S`: new start with ε to both fragments, new accept with ε from both
- **star** `R*`: new start/accept, ε bypass, ε back-edge from R's accept to R's start
- **plus** `R+`: like star but without the ε bypass
- **optional** `R?`: like star but without the back-edge

### 3. Subset Construction
Starting from ε-closure(q₀), processes each unvisited DFA state by computing ε-closure(move(T, a)) for every alphabet symbol. A DFA state is accepting iff it contains any NFA accept state. After construction, `completeWithDeadState` adds one dedicated trap state per source state with missing transitions; all trap states merge into a single ∅ during minimization.

### 4. Hopcroft-style Minimization
1. **Initial partition**: { accepting states } ∪ { non-accepting states }
2. **Refinement**: for each group, compute each state's signature (the group-index of each outgoing transition target); split any group whose members have different signatures
3. **Repeat** until stable — each remaining group becomes one state of the minimal DFA
4. Dead (trap) states are correctly propagated: a merged state is dead iff every original member was dead

### 5. Right-Linear Grammar
Derived directly from the minimal DFA:
- For each transition q_i --a→ q_j: production **Sᵢ → aSⱼ**
- For each accept state q_i: production **Sᵢ → ε**
- Start variable = state corresponding to the DFA's start state

### 6. Equivalence Checking
Product-automaton BFS over the symmetric difference of the two minimal DFAs. A pair (s₁, s₂) is a counterexample witness if s₁ is accepting in DFA₁ but not in DFA₂, or vice versa. The BFS path from the initial pair to the witness reconstructs the shortest counterexample string. If the BFS completes without finding a witness, the automata are equivalent, and a second BFS verifies structural isomorphism (state correspondence map).

---

## Testing

```bash
node test/smoke.js
```

Runs 30 acceptance/rejection test cases across four regex patterns, plus minimization invariant checks and parser error cases. All 30 pass.

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Language | Vanilla JavaScript (ES5 IIFEs, no transpiler) |
| Rendering | Inline SVG (no canvas, no external graph library) |
| Styling | Plain CSS with CSS custom properties |
| Layout | Custom BFS-layered left-to-right algorithm |
| Edges | Quadratic Bézier curves (backward arcs below, long forward arcs above) |
| Runtime | Entirely client-side — works offline as a single HTML file |

---

## Built For

This project was developed as an educational tool for Automata Theory, demonstrating:
- How formal language theory translates into executable algorithms
- Why Thompson's construction guarantees O(n) NFA states
- How subset construction can produce exponentially many DFA states (worst case 2ⁿ)
- Why minimization via partition refinement always yields the unique minimal DFA for a regular language
- The correspondence between regular grammars (Type 3 in Chomsky hierarchy) and finite automata
