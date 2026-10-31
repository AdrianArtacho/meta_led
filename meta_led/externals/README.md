# Project-local shell external

`shell.mxo` is Jeremy Bernstein and Bill Orcutt's Max external for running shell commands. It is used by the TesserPipe launcher.

The complete macOS bundle is included here and registered in `meta_led.maxproj`, so the project does not depend on a missing copy in the `downloadsheet` submodule or on another project's search path. Keep the whole `.mxo` bundle together, including its signature resources. It contains both Intel (`x86_64`) and Apple Silicon (`arm64`) binaries.

This copy came from the existing local Max 9 META_cheatsheet project. The executable SHA-256 is `d6b432d4cb38e2ba1e229f9376ba3a9509ba5f155166b98dc6b5b9441ed5c6ca`.

Upstream: https://github.com/jeremybernstein/shell
License: see [LICENSE-shell.txt](LICENSE-shell.txt).

Open `meta_led.maxproj` after installing this dependency. When distributing the Max for Live device, freeze and save it with this external included; the standalone `.maxpat` and the compiled `.amxd` are separate artifacts.
