# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Standalone Traefik compose for generated Flisk projects
# =============================================================================
# Full platform checkouts load Introvertic/platform proxy compose files.
# Standalone `flisk project` output does not ship those files, so Tilt used to
# skip Traefik entirely and api.{project}.localhost never served.

load("../constants.star", "PlatformDockerConstants")
load("../config/healthcheck.star", "compose_healthcheck_timing")
load("../networking/traefik_static_routes.star", "normalize_abs_path")


def generate_standalone_traefik_compose(sablier_enabled = False, http_host_port = "8080", https_host_port = "8443", bind_address = "127.0.0.1"):
    """Minimal Traefik that routes Docker labels on api.{project}.localhost.

    The Sablier plugin, the sablier container and the wake gateway are only
    emitted when sablier_enabled is True (a license grants "sablier"). Without
    it they would run for nothing: a container holding a read-write Docker
    socket, an image build, and a plugin download from GitHub on every start.
    """
    network = PlatformDockerConstants.NETWORK_TRAEFIK_PUBLIC
    name = PlatformDockerConstants.PROJECT_NAME
    log_level = "DEBUG" if sablier_enabled else "INFO"
    plugins_volume = "      - plugins-storage:/plugins-storage\n" if sablier_enabled else ""
    return """###############################################################################
# SYSTEM-GENERATED - DO NOT EDIT
# Standalone Traefik for Flisk projects without platform/introvertic proxy files.
###############################################################################

services:
  traefik:
    image: traefik:v3.7.14
    container_name: {name}_traefik
    restart: unless-stopped
{traefik_depends_on}    command:
      - "--ping=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.watch=true"
      - "--providers.docker.network={network}"
      # Static routes for sablier.deferStart resources (openspec/changes/
      # prioritized-cold-start): a never-created resource has no container
      # and thus no Docker labels for the provider above to discover, so its
      # route is defined here instead, pointed at wake-gateway. Harmless when
      # no deferStart resource exists (empty directory, no routes emitted).
      - "--providers.file.directory=/etc/traefik/dynamic"
      - "--providers.file.watch=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--log.level={log_level}"
{sablier_flags}    ports:
      - "{bind_address}:{http_host_port}:80"
      - "{bind_address}:{https_host_port}:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./{dynamic_dir_name}:/etc/traefik/dynamic:ro
{plugins_volume}    networks:
      - traefik-public
    healthcheck:
      test: ["CMD", "traefik", "healthcheck", "--ping"]
{healthcheck_timing}
{sablier_services}networks:
  traefik-public:
    name: {network}
    external: true
volumes:
  plugins-storage:
""".format(
        name=name,
        network=network,
        http_host_port=http_host_port,
        https_host_port=https_host_port,
        bind_address=bind_address,
        healthcheck_timing=compose_healthcheck_timing(10),
        traefik_depends_on=_SABLIER_DEPENDS_ON if sablier_enabled else "",
        sablier_flags=_SABLIER_FLAGS if sablier_enabled else "",
        sablier_services=_SABLIER_SERVICES.format(
            name=name,
            gateway_container=PlatformDockerConstants.TRAEFIK_WAKE_GATEWAY_CONTAINER,
            gateway_port=PlatformDockerConstants.TRAEFIK_WAKE_GATEWAY_PORT,
            vendored_gateway_dir="tdk-cli-ext/engine/assets/docker/wake-gateway",
            tilt_dev_dir=os.environ.get("HOME", "") + "/.tilt-dev",
            project_root_mount=_project_root_mount(),
            docker_socket_gid=_docker_socket_gid(),
        ) if sablier_enabled else "",
        dynamic_dir_name=PlatformDockerConstants.TRAEFIK_DYNAMIC_DIR_REL.split("/")[-1],
        vendored_gateway_dir="tdk-cli-ext/engine/assets/docker/wake-gateway",
        gateway_container=PlatformDockerConstants.TRAEFIK_WAKE_GATEWAY_CONTAINER,
        gateway_port=PlatformDockerConstants.TRAEFIK_WAKE_GATEWAY_PORT,
        tilt_dev_dir=os.environ.get("HOME", "") + "/.tilt-dev",
        project_root_mount=_project_root_mount(),
        log_level=log_level,
        plugins_volume=plugins_volume,
    )


def _docker_socket_gid():
    """Group ID the wake gateway joins to reach /var/run/docker.sock.

    Docker Desktop exposes the socket as root:root (gid 0). On Linux hosts it
    is usually root:docker, whose gid varies, so set TDK_DOCKER_SOCKET_GID to
    the socket's gid there (`stat -c %g /var/run/docker.sock`).
    """
    return os.environ.get("TDK_DOCKER_SOCKET_GID", "0")


def _project_root_mount():
    """Read-only mount of the project at its own absolute host path.

    The gateway runs `docker compose up --no-build` for a deferred resource
    itself (bypassing Tilt's build queue), using the compose files Tilt uses.
    Compose resolves relative paths in them (env_file etc.) client-side, so
    they must exist at the same absolute paths inside the gateway container.
    Empty when TDK_PROJECT_ROOT is unset (the generated Tiltfile sets it).
    """
    root = project_root_abspath()
    if not root:
        return ""
    return "\n      - " + root + ":" + root + ":ro"


def project_root_abspath():
    """Absolute, normalized project root (TDK_PROJECT_ROOT), or "" when unset."""
    return normalize_abs_path(os.environ.get("TDK_PROJECT_ROOT", ""))


_SABLIER_DEPENDS_ON = """    depends_on:
      - sablier
      - wake-gateway
"""

_SABLIER_FLAGS = """      # On-demand scaling: routes to stopped containers (opt-in via a
      # resource's `sablier:` manifest block), keeps idle services from
      # burning memory. Requires Traefik >=3.6 (see allownonrunning below).
      # Pinned to v1.3.0: Traefik v3.7.14 fails v1.3.1's integrity check ("plugin
      # integrity check failed"), which disables ALL plugins, so every
      # `<name>-sablier` middleware is "invalid middleware type" and the route
      # never comes up. v1.3.0 and v1.2.0 load. Bump only after checking with
      # tests/tilt-engine/test_sablier_plugin_loads.py (needs Docker + network).
      - "--experimental.plugins.sablier.modulename=github.com/sablierapp/sablier-traefik-plugin"
      - "--experimental.plugins.sablier.version=v1.3.0"
"""

_SABLIER_SERVICES = """  sablier:
    image: sablierapp/sablier:1.18.0
    container_name: {name}_sablier
    restart: unless-stopped
    command:
      - "start"
      - "--provider.name=docker"
    volumes:
      # Read-write: Sablier stops/starts containers via the Docker API.
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - traefik-public

  # Wake gateway (openspec/changes/prioritized-cold-start): fronts every
  # deferStart resource's static route above. Triggers a cold resource (and
  # its dependencies, which Tilt never cascades to on its own -- see design.md
  # D3/task 1.5) via `tilt trigger`, or Sablier's own start when a container
  # already exists, then holds the request until healthy. Needs the same
  # Tilt session token Sablier/Traefik don't: confirmed empirically that
  # `tilt trigger` from inside a container is otherwise rejected with
  # "(403): invalid session token" even when the Tilt HTTP port is reachable.
  wake-gateway:
    build: ./{vendored_gateway_dir}
    container_name: {gateway_container}
    restart: unless-stopped
    environment:
      - TILT_HOST=host.docker.internal
      - TILT_PORT=10350
      - SABLIER_URL=http://sablier:10000
      - PORT={gateway_port}
    # Non-root (see the Dockerfile): the Docker socket is root-owned, so the
    # gateway joins the socket's group instead of running as root.
    group_add:
      - "{docker_socket_gid}"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - {tilt_dev_dir}:/home/bun/.tilt-dev:ro{project_root_mount}
    networks:
      - traefik-public

"""
