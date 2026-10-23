# Wake gateway (see openspec/changes/prioritized-cold-start): fronts every
# `sablier.deferStart` resource's Traefik static route, triggers cold
# containers via `tilt trigger` and/or Sablier, then holds the request until
# healthy. Needs the Docker CLI plus its Compose plugin (client only, talks
# to the mounted /var/run/docker.sock; compose starts an already-built image
# directly, ahead of Tilt's build queue) and the real `tilt` CLI (D3: shells out to the
# documented `tilt trigger` command rather than depending on Tilt's
# undocumented internal HTTP API).

FROM oven/bun:1.4.3-alpine@sha256:629e17411f1f129dbec3af78d5af9c9f2a937435c80349437206c6b0b7422373 AS base

# Pin to the same Tilt version this workspace runs (v0.37.7) so `tilt trigger`
# talks the same protocol as the real daemon it's connecting to. Installed
# directly (not via tilt-dev's install.sh, which shells out to `sudo` -- not
# present in this minimal image, and unnecessary since we're already root).
ARG TILT_VERSION=0.37.7
RUN apk add --no-cache docker-cli docker-cli-compose curl gcompat \
    && arch="$(uname -m)" \
    && case "$arch" in aarch64) tilt_arch=arm64 ;; x86_64) tilt_arch=x86_64 ;; *) echo "unsupported arch: $arch" >&2; exit 1 ;; esac \
    && curl -fsSL "https://github.com/tilt-dev/tilt/releases/download/v${TILT_VERSION}/tilt.${TILT_VERSION}.linux.${tilt_arch}.tar.gz" \
       | tar -xz -C /usr/local/bin tilt

WORKDIR /app
COPY decide.ts server.ts ./

# Run as the image's unprivileged `bun` user. Docker socket access comes from
# the supplementary group in traefik_standalone.star (group_add), not from root.
# HOME points at bun's home so `tilt trigger` finds the session token mounted
# at $HOME/.tilt-dev.
ENV HOME=/home/bun
USER bun

EXPOSE 9999
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD curl --fail --silent http://127.0.0.1:${PORT:-9999}/health || exit 1
CMD ["bun", "run", "server.ts"]
