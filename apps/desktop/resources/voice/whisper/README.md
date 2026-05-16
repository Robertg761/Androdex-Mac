Place packaged whisper.cpp runtime binaries here so desktop updates install the local voice
engine without any user-managed PATH setup.

Run `bun run prepare:voice-runtime -- --platform <platform> --arch <arch>` to populate these
resources. Desktop artifact builds also run that preparation step automatically before they assert
the runtime exists.

Expected layout:

- `darwin-arm64/whisper-cli`
- `darwin-x64/whisper-cli`
- `linux-arm64/whisper-cli` (native source builds are static)
- `linux-x64/whisper-cli` plus `libwhisper.so.1`, `libggml*.so.0`, and copied runtime `.so` sidecars
- `win32-arm64/whisper-cli.exe` (native source builds are static)
- `win32-x64/whisper-cli.exe` plus `whisper.dll`, `ggml.dll`, `ggml-base.dll`, and `ggml-cpu.dll`

The app passes the matching executable to the bundled server through
`ANDRODEX_WHISPER_CPP_BINARY`. Any runtime libraries placed next to the executable are added to the
child process library path when the server launches `whisper-cli`.

Models are downloaded separately by the user-selected voice model picker because those files range
from tens of MiB to multiple GiB.
