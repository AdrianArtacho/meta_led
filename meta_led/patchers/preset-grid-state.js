// Preset identities are independent of UI coordinates. Max's embedded wrapper
// owns the fixed ports; this script coordinates resizing and cached feedback.
autowatch = 1;
inlets = 6;
outlets = 6;
// Inputs: slot/state, synchronous note lookup reply, cols, rows, commands,
// observed NOTE messages. Outputs: overlay, note/state, live grid, lookup,
// live-grid event gate, reset transient press/trigger state.
var cols = 0, rows = 0, wantedCols = 0, wantedRows = 0;
var slots = {}, emittedNotes = {}, highlightNotes = {};
var ready = false, pendingLookup = null, rebuilding = false;
var scheduled = false, forceRebuild = false;
var resizeTask = new Task(applySize, this);

function integer(n) {
    return typeof n === "number" && isFinite(n) && Math.floor(n) === n;
}

function gridSize(which, n) {
    // live.grid clamps each axis at 64. Keep arithmetic and UI identical.
    if (!integer(n) || n < 1 || n > 64) return;
    if (which === 2) wantedCols = n;
    else wantedRows = n;
    if (wantedCols === cols && wantedRows === rows && !forceRebuild) return;
    // Close before any grid attributes can emit changed-cell lists. Changes to
    // both dimensions in one Max message chain are applied as one transaction.
    outlet(4, 0);
    scheduleSize(false);
}

function scheduleSize(force) {
    forceRebuild = forceRebuild || force;
    scheduled = true;
    resizeTask.cancel();
    resizeTask.schedule(0);
}

function note(n, state) {
    outlet(1, [n, state]);
}

function turnOffEmitted() {
    var old = emittedNotes;
    emittedNotes = {};
    // Use the actual old MIDI notes, not coordinates reinterpreted using the
    // new dimensions or a newly downloaded controller layout.
    for (var key in old) if (old.hasOwnProperty(key) && old[key] !== 0) note(Number(key), 0);
    emittedNotes = {};
    highlightNotes = {};
}

function applySize() {
    scheduled = false;
    if (wantedCols < 1 || wantedRows < 1) return;
    var changed = wantedCols !== cols || wantedRows !== rows;
    if (!changed && !forceRebuild) { outlet(4, 1); return; }
    forceRebuild = false;
    rebuilding = true;
    outlet(4, 0);
    turnOffEmitted();
    outlet(5, "bang");
    cols = wantedCols;
    rows = wantedRows;
    outlet(2, "clear");
    outlet(2, ["columns", cols]);
    outlet(2, ["rows", rows]);
    outlet(0, "clear");
    outlet(0, ["columns", cols]);
    outlet(0, ["rows", rows]);
    for (var i = 0; i < 128; i++) if (slots.hasOwnProperty(i)) render(i, slots[i]);
    rebuilding = false;
    outlet(4, 1);
}

function render(index, state) {
    if (cols < 1 || rows < 1 || index >= cols * rows) return;
    var x = index % cols + 1;
    var topRow = Math.floor(index / cols) + 1;
    outlet(0, ["setcell", x, rows + 1 - topRow, state]);
    if (!ready) return;
    pendingLookup = {state: state};
    // coll's lookup returns synchronously through inlet 1. Missing entries
    // produce no message; they must never reuse a previous pad's MIDI note.
    outlet(3, ["symbol", x + "-" + topRow]);
    pendingLookup = null;
}

function feedback(index, state) {
    if (!integer(index) || index < 0 || index > 127 || (state !== 0 && state !== 1)) return;
    // Keep all protocol slots, even outside the currently displayed grid.
    slots[index] = state;
    if (!scheduled && !rebuilding) render(index, state);
}

function lookup(n) {
    if (!pendingLookup || !integer(n) || n < 0 || n > 127) return;
    highlightNotes[n] = pendingLookup.state;
    note(n, pendingLookup.state);
}

function observe(n, velocity) {
    if (integer(n) && n >= 0 && n <= 127 && integer(velocity) && velocity >= 0 && velocity <= 127) {
        emittedNotes[n] = velocity;
    }
}

function replay() {
    if (inlet !== 4) return;
    ready = true;
    outlet(4, 0);
    scheduleSize(true);
}

function clear() {
    if (inlet !== 4) return;
    var old = highlightNotes;
    slots = {};
    highlightNotes = {};
    for (var key in old) if (old.hasOwnProperty(key)) note(Number(key), 0);
    outlet(0, "clear");
}

function msg_int(n) {
    if (inlet === 1) lookup(n);
    else if (inlet === 2 || inlet === 3) gridSize(inlet, n);
}

function msg_float(n) { msg_int(n); }

function list() {
    var a = arrayfromargs(arguments);
    if (a.length !== 2) return;
    if (inlet === 0) feedback(a[0], a[1]);
    else if (inlet === 5) observe(a[0], a[1]);
}

function anything() {
    var a = arrayfromargs(arguments);
    if (inlet === 5 && messagename === "NOTE" && a.length === 2) observe(a[0], a[1]);
}

function notifydeleted() {
    resizeTask.cancel();
    resizeTask.freepeer();
}
