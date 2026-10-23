# Lobster has no network builtins, so a Lobster program cannot be the HTTP server. This image runs one at build time
# to write the response files, then serves them with BusyBox httpd.
# The release binary links libOpenGL and libGLX even for a headless script, so the generate stage installs them.
FROM debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8 AS generate
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip libopengl0 libglx0 libstdc++6 \
 && rm -rf /var/lib/apt/lists/*
ARG LOBSTER_VERSION=v2026.8
ARG LOBSTER_SHA256=2f03fb96fdaf6935469c99e43ffb182cab0d797faec7b26eccc9a732df32ad31
RUN curl -fsSL -o /tmp/lobster.zip "https://github.com/aardappel/lobster/releases/download/${LOBSTER_VERSION}/lobster_linux_release.zip" \
 && echo "${LOBSTER_SHA256}  /tmp/lobster.zip" | sha256sum -c - \
 && unzip -q /tmp/lobster.zip -d /opt/lobster \
 && rm /tmp/lobster.zip
WORKDIR /site
COPY orders.lobster ./
# The build output is quiet in CI, so a failure prints the linker view and Lobster's own output before exiting.
RUN mkdir www && { /opt/lobster/bin/lobster orders.lobster && test -s www/health; } \
 || { echo "lobster failed (exit $?)" >&2; ldd /opt/lobster/bin/lobster >&2; /opt/lobster/bin/lobster orders.lobster >&2; exit 1; }

FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
COPY --from=generate /site/www /www
RUN addgroup -g 1000 -S app && adduser -u 1000 -S -G app app
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-3000} || exit 1
CMD ["sh", "-c", "exec httpd -f -p 0.0.0.0:${PORT:-3000} -h /www"]
