// Max js: outlet 0 = setup UDP, 1 = status, 2 = open patch, 3 = refresh sender settings.
autowatch = 1;
inlets = 1;
outlets = 4;

var pending = null;
var serial = 0;
var retry = new Task(tick, this);

function textValue(value) {
    if (value instanceof Array) value = value.join(" ");
    var text = String(value === null || value === undefined ? "" : value).replace(/^\s+|\s+$/g, "");
    if (text.length > 1 && text.charAt(0) === '"' && text.charAt(text.length - 1) === '"') {
        text = text.substring(1, text.length - 1);
    }
    return text;
}

function saved(name) {
    var object = this.patcher.getnamed(name);
    return object ? textValue(object.getvalueof()) : "";
}

function status(text) { outlet(1, ["set", text]); }

function cancel() {
    retry.cancel();
    pending = null;
}

function start() {
    cancel();
    var portText = saved("textedit[7]");
    var port = Number(portText);
    var device = saved("pipe-midi-output-name");
    if (!/^\d+$/.test(portText) || port < 1 || port > 65535 || port === 7410 || port === 7411) {
        status("PIPE: enter a UDP port from 1–65535; 7410 and 7411 are reserved for setup.");
        return;
    }
    if (!device || /[\r\n]/.test(device)) {
        status("PIPE: enter the MIDI output device name.");
        return;
    }
    pending = {
        token: "pipe-" + String(jsarguments[1] || 0) + "-" + Date.now() + "-" + (++serial),
        port: port,
        device: device,
        phase: "hello",
        deadline: Date.now() + 30000
    };
    status("PIPE: opening; waiting for TesserPipe…");
    outlet(3, "bang");
    outlet(2, "bang");
    tick();
}

function tick() {
    if (!pending) return;
    if (Date.now() >= pending.deadline) {
        var waiting = pending.phase;
        cancel();
        status(waiting === "hello" ? "PIPE: no reply. Check the patch path and open the updated TesserPipe." : "PIPE: configuration timed out. Check TesserPipe’s Max console.");
        return;
    }
    if (pending.phase === "hello") {
        outlet(0, ["/tesserpipe/hello", pending.token]);
    } else {
        outlet(0, ["/tesserpipe/configure", pending.token, pending.port, pending.device]);
    }
    if (pending) {
        retry.cancel();
        retry.schedule(500);
    }
}

function anything() {
    var args = arrayfromargs(arguments);
    if (!pending || args[0] !== pending.token) return;
    if (messagename === "/tesserpipe/ready" && pending.phase === "hello") {
        pending.phase = "configure";
        status("PIPE: applying UDP and MIDI settings…");
        tick();
    } else if (messagename === "/tesserpipe/configured" && pending.phase === "configure") {
        if (Number(args[1]) !== pending.port || args[2] !== pending.device) return;
        var result = "PIPE configured: UDP " + pending.port + " → " + pending.device;
        cancel();
        status(result);
    } else if (messagename === "/tesserpipe/error") {
        var message = args[1] === "midi_missing" ? "MIDI output not found in standalone Max: " + pending.device : "TesserPipe rejected the configuration: " + args.slice(1).join(" ");
        cancel();
        status("PIPE: " + message);
    }
}

function notifydeleted() {
    cancel();
    retry.freepeer();
}
