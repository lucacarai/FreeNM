# Free NM-algebras dually

An interactive three-stage visualization of the dual construction of the free nilpotent minimum algebra over a finite bounded distributive lattice. The editable input is the lattice's dual finite poset X. The editor and coloring follow FreeGodel.

The GitHub Pages publishing setup follows FreeGodel. See [the publishing instructions](docs/DEPLOYMENT.md). The intended public URL is https://lucacarai.github.io/FreeNM/.

## Run locally

Open this folder in Windows File Explorer and double-click **FreeNM.html**. It opens the app directly in your default browser. No server, terminal, or installation is required. Save file and Open work in this version too. Browser storage for local files can vary by browser, so use Save file to keep a portable copy of a drawing.

After changing source files, rebuild the HTML with Node.js:

```powershell
node scripts/build.mjs
```

For development over HTTP, double-click `start.cmd` in File Explorer, or run these commands in this folder:

```powershell
node scripts/build.mjs
node server.mjs
```

Open http://127.0.0.1:4175/. Close the server terminal or press Ctrl+C to stop it. No dependency installation is needed. With npm available, `npm start` does the same thing. `node --test tests/*.test.mjs` runs the checks; `npm test` is equivalent.

The build writes a standalone static app into `dist/`, with relative, versioned asset URLs. `node server.mjs --base=/FreeNM/` serves it at http://127.0.0.1:4175/FreeNM/ for a subdirectory preview. Nothing has been published.

## Construction

1. **X:** the editable input poset, drawn with greater points above lesser ones.
2. **X^≤:** all pairs (x, y) with x ≤ y. The order is (x, y) ≤ (u, v) exactly when x ≤ u and v ≤ y. Covers change exactly one coordinate along an input cover. Diagonal pairs (x, x), forming X^=, have permanent pale yellow circles.
3. **CC(X^≤):** all nonempty chains in the pair poset. C ≤ D exactly when D is an upset of C, equivalently a nonempty suffix. A chain's unique upper cover removes its minimum. Chains contained entirely in X^= receive the same permanent yellow circles. Since the diagonal is an antichain, these are exactly its singleton chains.

Each pair has the first coordinate's color in its left half and the second coordinate's color in its right half, with no dividing stroke. Equal colors give a uniform point. A chain takes the split color of its minimum pair. Input coloring retains FreeGodel's base hues and pigment mixtures; colors can be changed in the base-hue legend.

The two controls **m** and **n** accept nonnegative whole numbers (including 0) or **All**. The chain diagram contains exactly the union of:

- All nonempty chains of size at most m.
- All nonempty chains of size at most n that contain a diagonal pair (x, x), equivalently a point of X^=.

**All** removes the corresponding size bound. Both controls default to All. The bounds are independent, and a chain satisfying both conditions appears only once. Since diagonal pairs are maximal, a chain meets the diagonal exactly when its largest pair is diagonal. Filtering preserves all nonempty suffixes, so the retained order and cover edges are inherited from the full chain diagram. Coincidence here means equal coordinates, rather than accidentally similar displayed colors.

The third panel's title is the mathematical pair `(CC_m(X^≤) ∪ (CC_n(X^≤) ∩ ♢X^=), □X^=)`, typeset with subscripts and superscripts. It simplifies according to the parameters: m=All removes the second union term and the m subscript; n≤m removes the second union term; m=0 removes the first term; n=All removes the second term's chain-size restriction. When m=n=0 the title is `(∅, ∅)`. For m=0 and n=1 it retains the general `CC_n(X^≤) ∩ ♢X^=` expression. Finite subscripts show the current numeric parameter values and update when the adjacent controls change.

Parameter values, including the last numeric value used before choosing All, are saved, undoable, and retained when switching examples or clearing the input. Existing FreeNM files default to All when they lack these fields. FreeGodel's maximum-chain-length setting is ignored when importing its files.

Both computed diagrams have a 300-point display limit. The m and n conditions are applied before counting against the chain limit. Oversized diagrams are suppressed completely rather than truncated. The input remains editable, and each computed stage can remain available when the other exceeds its limit. Files with more than 300 input points are rejected before order validation. With both parameters set to All, a two-point chain produces three pairs and five chains, with two yellow points in each computed diagram.

## Controls

- **Show Second panel / Third panel:** independently hide either computed diagram or both. The remaining diagrams use the available space. Visibility choices are remembered on this browser separately from the drawing and its undo history.
- **Move (V):** drag input points while preserving their vertical order. Drag empty space to pan any diagram; zoom and Fit work independently.
- **Point (N):** click empty input space to add a point.
- **Order (E):** click lower then upper, or drag between them. Cycles and implied relations are rejected. Only Hasse covers are drawn.
- Hover or focus a pair to inspect its coordinates in X and highlight output points whose minimum is that pair. These points inherit the hovered pair's split color. Hover a chain to inspect its members in the middle diagram and its suffix path on the right. Temporary black segments join each pair of consecutive chain members in the middle diagram, including comparisons that are not Hasse covers. These segments pass over points outside the chain, stop at the chain endpoints, and are omitted from PNG exports. In X, only the two coordinates of its minimum pair are circled, and no input edge is highlighted. Hover an input point to mark the matching coordinate halves in both computed diagrams with semicircles. Chain points use their minimum pair; both matching coordinates give a full circle. The semicircles clip a single SVG circle and keep a constant stroke width on screen as you zoom. The extra minimum marker appears only when inspecting a chain. Click or press Enter to pin inspection; Escape clears it.
- Select an input point or cover and press Delete. Point deletion preserves the induced order. Computed points are read-only.
- Ctrl+Z and Ctrl+Shift+Z undo and redo input edits. Changes save in browser storage under a key separate from FreeGodel.
- **Open** accepts FreeNM, FreeGodel, and Poset Studio JSON. **Save file** saves the editable input and base hues. Each diagram has its own label toggle and PNG export. Exports include the complete diagram and permanent yellow circles, without temporary inspection marks.

## Verification

The mathematical checks compare the pair order, covers, chains, suffix order, and diagonal marking with independent definitions for all posets with up to four points. They also compare parameter combinations against filtering the full chain set. Additional checks cover limits, imports, persistence, and input identities containing punctuation. An in-memory DOM checks three-panel rendering, split colors, linked inspection, editing, undo, labels, hue updates, and parameter controls. These checks do not replace browser layout, pointer hit testing, or actual PNG rendering checks.

Initial browser QA could not be completed because Computer Use could not reliably determine the current Windows browser URL.
