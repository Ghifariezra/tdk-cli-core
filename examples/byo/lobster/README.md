# lobster

**Stack:** a [Lobster](https://github.com/aardappel/lobster) program (`orders.lobster`, release v2026.8) that writes static files at
image build time, served by BusyBox `httpd` on Alpine

**Status: UNVERIFIED DRAFT.** This image has not been built or run. Docker was hung when it was written, so
`verify-byo-example.sh lobster` has not been run and nothing below has been observed. The Lobster syntax in `orders.lobster`
(`for([..]) x:`, `\{` escapes, `write_file` with a relative path, top-level `return 1`) comes from reading the docs, not from running it.
The Linux release binary may need further shared libraries beyond the ones listed in the notes.

**Notes:**
- Lobster is not the server. I found no network builtins in its builtin reference (only Steam peer-to-peer ones), so a Lobster program
  cannot answer HTTP. The Dockerfile's first stage runs `lobster orders.lobster` once while the image is built, which writes
  `www/orders.json` and `www/health`. The final stage is `alpine` serving `/www` with `httpd -f -p 0.0.0.0:${PORT:-3000}`.
- The v2026.8 Linux release binary is dynamically linked against libOpenGL.so.0 and libGLX.so.0 (plus libstdc++, libgcc_s, libm, libc)
  even though this script is headless. `debian:bookworm-slim` does not ship the two GL libraries, so the generate stage installs
  `libopengl0` and `libglx0`. A first CI run failed with exit 127 at the `lobster` step before this was added; the cause is inferred
  from the binary's ELF header, not yet confirmed by a passing run.
- The release zip is pinned by version and sha256 in the Dockerfile; base images are digest-pinned.
- Fallback if the release binary cannot run headless: build Lobster from source with `cmake -DLOBSTER_ENGINE=OFF`. Not tried.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh lobster
```

Not run yet. Not checked through a real `flisk up` either.

## Register it in a Flisk project

```bash
flisk resource lobster-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
