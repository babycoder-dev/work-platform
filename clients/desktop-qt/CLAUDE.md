# desktop-qt — local guidance

**Different toolchain from the rest of the repo.** This is a Qt 6.8 LTS / C++17 /
Qt Widgets / CMake client — it is **not** part of the pnpm / Nx workspace. Root
`pnpm verify` / `lint` / `test` do **not** build or check it; build with CMake
against `CMakeLists.txt`. The JS conventions in root `CLAUDE.md` don't apply to
the C++ here (use the surrounding C++ style instead).

## Hard constraints (from `README.md`)

- **Never connects to the database.** All platform access goes through
  `gateway-api` only.
- **No WebView as the main UI** — native Qt Widgets; performance is prioritized
  over reusing the web UI.
- Windows 10+/Windows 11 **x64** is the primary target (64-bit only); Ubuntu x64
  is reserved for a later phase. Windows 7 uses the web UI compat mode, not this
  native client.

`src/` layout: `app/`, `auth/`, `network/`, `presence/` under `main.cpp`.
