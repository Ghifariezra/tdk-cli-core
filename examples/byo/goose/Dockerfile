# Goose has no networking in v2026.3, so a Goose program cannot be the HTTP server. This image runs one at build time
# to write the response files, then serves them with BusyBox httpd.
FROM debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8 AS generate
# Running a program in-process (`goose file.goose`) needs the C library headers on Linux.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl libc6-dev \
 && rm -rf /var/lib/apt/lists/*
ARG GOOSE_VERSION=v2026.3
ARG GOOSE_SHA256=06ac30284338269d3996d457412bf4f2b47c1f9a5601de65b6317187fe78d5c9
RUN curl -fsSL -o /tmp/goose.tar.gz "https://github.com/aardappel/goose/releases/download/${GOOSE_VERSION}/goose-${GOOSE_VERSION}-linux-x64.tar.gz" \
 && echo "${GOOSE_SHA256}  /tmp/goose.tar.gz" | sha256sum -c - \
 && tar -xzf /tmp/goose.tar.gz -C /opt \
 && rm /tmp/goose.tar.gz
ENV PATH="/opt/goose-${GOOSE_VERSION}-linux-x64:${PATH}"
WORKDIR /site
COPY orders.goose ./
RUN mkdir www && goose orders.goose && test -s www/health

FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
COPY --from=generate /site/www /www
RUN addgroup -g 1000 -S app && adduser -u 1000 -S -G app app
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-3000} || exit 1
CMD ["sh", "-c", "exec httpd -f -p 0.0.0.0:${PORT:-3000} -h /www"]
