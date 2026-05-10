# Release Scripts

These scripts create an offline migration bundle for the enterprise intranet.

## Windows

```powershell
pnpm release:bundle:win
```

Outputs:

```text
release-bundle/
  work-platform-images.tar
  work-platform-source.zip
  SHA256SUMS.txt
```

## Linux/macOS

```bash
pnpm release:bundle:linux
```

Outputs:

```text
release-bundle/
  work-platform-images.tar
  work-platform-source.tar.gz
  SHA256SUMS.txt
```

The bundle is intended for Docker-based migration into the enterprise intranet.
