# meta_LED

This device controls any kind of led-frid, push-like, midi-capable devices

## Install

...

## Usage

...

![gui](img/gui.png)

## Automatic TesserPipe setup

In TesserLet, set the UDP data port and **PIPE MIDI output** (initially `APC Key 25`), then save the device/Live Set. Keep the UDP host at `localhost` for the local standalone Pipe. The MIDI name must match a MIDI output listed by standalone Max.

Click **open PIPE**. The existing shell command opens the saved `.maxpat` path in Max, reusing the running application. TesserLet reads the current saved fields, waits for TesserPipe, and applies its UDP port and MIDI output. The status reads `PIPE configured: UDP … → …` after TesserPipe acknowledges applying both settings. Invalid settings and missing MIDI devices produce a status message; a missing MIDI device leaves the receiver's existing settings unchanged.

Reload both updated patches once after installing this change. Keep `tesserpipe-launch.js` beside `meta_led.maxpat`, and `tesserpipe-config.js` beside `tesser_pipe.maxpat`; include these JavaScript dependencies when freezing/building a device. The launcher still requires the existing `shell` external.

Setup uses a separate local UDP request port **7410** and reply port **7411**, reserved independently of the MIDI data port. Requests retry every 500 ms for up to 30 seconds, with a request ID to ignore old replies. This setup endpoint configures one standalone TesserPipe; it does not create or address multiple independent Pipe instances. The acknowledgement confirms that settings were applied, not that a controller received a MIDI message; Max's console reports UDP bind errors.

Protocol tests (no Max or MIDI hardware required):

```sh
node tools/test-tesserpipe-config.cjs
```
