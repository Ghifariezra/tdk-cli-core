#!/usr/bin/env starlark
# -*- coding: utf-8 -*-
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔍 DISCOVERY REGISTRY - Service Discovery for Flisk CLI
# =============================================================================
# This module discovers services from service.json manifest files.
# It runs discovery at module load time to avoid frozen hash issues.
#
# IMPORTANT: Discovery runs when the module loads (if TDK_PROJECT_ROOT is set).
# This ensures APP_RESOURCES and related variables are populated before export.
# =============================================================================

load(
    "./config.star",
    "GLOBAL_CONFIG",
    "INFRA_RESOURCES",
    "CORE_INFRA",
    "INFRA_STACK_MAP",
    "OPTIONAL_INFRA",
    "Config",
    "DDD_LIBS",
)
load("./discovery_orchestrator.star", "initialize_discovery")
load("../engine/topologies/tilt/manifest/loader.star", "ManifestLoader")
load("./libraries.star", "autodiscover_libraries", "get_platform_libs", "get_product_libs")
load(
    "./constants.star",
    "PRODUCT_SNAPSHOT_DIR",
    "PRODUCT_SNAPSHOT_FILES",
    "PRODUCT_TOPOLOGY_DIR",
    "PRODUCT_STACKS_INDEX_FILE",
    "PRODUCT_STACK_RESOURCES_FILE",
    "DISCOVERY_SCAN_ROOTS",
)
load("./manifest/constants.star", "MANIFEST_FILENAME", "MANIFEST_FILENAME_YAML")


# =============================================================================
# 🔧 RUN DISCOVERY AT MODULE LOAD TIME
# =============================================================================
# This runs discovery immediately when the module loads (before freeze).
# The results are stored in module-level variables that get exported.
# Use a list as a mutable container to track if header was printed
_DISCOVERY_STATE = [False]

# =============================================================================

def _run_discovery():
    """Run two-pass discovery and return results."""
    # Only print header on first discovery
    if not _DISCOVERY_STATE[0]:
        print("")
        print("Phase 1: Discovering services...")
        _DISCOVERY_STATE[0] = True
    
    # Create a working cache for both passes
    working_cache = {
        "initialized": False,
        "app_resources": [],
        "resource_dependencies": {},
        "resource_aliases": {},
        "resource_path_map": {},
        "stack_configs": {},
    }
    
    # First pass - load JSON and generate YAML
    initialize_discovery(working_cache, second_pass=False)
    
    # Second pass - reload from JSON
    working_cache["initialized"] = False
    initialize_discovery(working_cache, second_pass=True)
    
    print("")
    return working_cache

# Run discovery immediately if TDK_PROJECT_ROOT is set
# This ensures data is available before module is frozen
_DISCOVERY_RESULTS = {}
if os.environ.get('TDK_PROJECT_ROOT', ''):
    _DISCOVERY_RESULTS = _run_discovery()
else:
    # Empty results if no project root set
    _DISCOVERY_RESULTS = {
        "app_resources": [],
        "resource_dependencies": {},
        "resource_aliases": {},
        "resource_path_map": {},
        "stack_configs": {},
    }

# Export discovery results as module-level variables
# These are populated at load time and remain read-only
APP_RESOURCES = _DISCOVERY_RESULTS["app_resources"]
RESOURCE_DEPENDENCIES = _DISCOVERY_RESULTS["resource_dependencies"]
RESOURCE_ALIASES = _DISCOVERY_RESULTS["resource_aliases"]
RESOURCE_PATH_MAP = _DISCOVERY_RESULTS["resource_path_map"]

# Functions for accessing data (re-run discovery if needed)
def get_app_resources():
    """Get discovered app resources."""
    if len(APP_RESOURCES) > 0:
        return APP_RESOURCES
    if _DISCOVERY_STATE[0]:
        return APP_RESOURCES
    results = _run_discovery()
    return results["app_resources"]

def get_resource_dependencies():
    """Get resource dependency graph."""
    if len(RESOURCE_DEPENDENCIES) > 0:
        return RESOURCE_DEPENDENCIES
    if _DISCOVERY_STATE[0]:
        return RESOURCE_DEPENDENCIES
    results = _run_discovery()
    return results["resource_dependencies"]

def get_resource_aliases():
    """Get resource name to path aliases."""
    if len(RESOURCE_ALIASES) > 0:
        return RESOURCE_ALIASES
    if _DISCOVERY_STATE[0]:
        return RESOURCE_ALIASES
    results = _run_discovery()
    return results["resource_aliases"]

def get_resource_path_map():
    """Get resource path to name mapping."""
    if len(RESOURCE_PATH_MAP) > 0:
        return RESOURCE_PATH_MAP
    if _DISCOVERY_STATE[0]:
        return RESOURCE_PATH_MAP
    results = _run_discovery()
    return results["resource_path_map"]

# Ref functions (same as above, for compatibility)
def get_app_resources_ref():
    return get_app_resources()

def get_resource_dependencies_ref():
    return get_resource_dependencies()

def get_resource_aliases_ref():
    return get_resource_aliases()

def get_resource_path_map_ref():
    return get_resource_path_map()


# =============================================================================
# 🔄 INCREMENTAL CACHE OPERATIONS (Auto-discovery support)
# =============================================================================

def add_resource_to_cache(resource_dict):
    """Add a new resource to the discovery cache."""
    resource_name = resource_dict.get("appName", "")
    resource_path = resource_dict.get("_path", "")
    if resource_name and resource_path:
        APP_RESOURCES.append(resource_dict)
        RESOURCE_ALIASES[resource_name] = resource_path
        RESOURCE_PATH_MAP[resource_path] = resource_name

def remove_resource_from_cache(resource_path):
    """Remove a resource from the discovery cache by path."""
    # Find and remove from app_resources list
    for i, resource in enumerate(APP_RESOURCES):
        if resource.get("_path", "") == resource_path:
            APP_RESOURCES.pop(i)
            break
    
    # Remove from aliases
    resource_name = RESOURCE_PATH_MAP.get(resource_path, "")
    if resource_name in RESOURCE_ALIASES:
        RESOURCE_ALIASES.pop(resource_name, None)
    if resource_path in RESOURCE_PATH_MAP:
        RESOURCE_PATH_MAP.pop(resource_path, None)
    if resource_name in RESOURCE_DEPENDENCIES:
        RESOURCE_DEPENDENCIES.pop(resource_name, None)

def has_resource_in_cache(resource_path):
    """Check if a resource path exists in cache."""
    return resource_path in RESOURCE_PATH_MAP

def get_resource_by_path_from_cache(resource_path):
    """Get resource dict by path."""
    resource_name = RESOURCE_PATH_MAP.get(resource_path, "")
    if resource_name:
        for resource in APP_RESOURCES:
            if resource.get("appName", "") == resource_name:
                return resource
    return None

def persist_cache_to_file():
    """Persist cache to snapshot file."""
    pass  # No-op for now

def get_cache_stats():
    """Get cache statistics."""
    return {
        "app_resources_count": len(APP_RESOURCES),
        "dependencies_count": len(RESOURCE_DEPENDENCIES),
        "aliases_count": len(RESOURCE_ALIASES),
    }

def reinitialize():
    """Force re-discovery by clearing and re-running."""
    # Note: Module-level variables are mutable, no global keyword needed in Starlark
    results = _run_discovery()
    return results["app_resources"]

CacheOps = struct(
    add=add_resource_to_cache,
    remove=remove_resource_from_cache,
    has=has_resource_in_cache,
    get_by_path=get_resource_by_path_from_cache,
    persist=persist_cache_to_file,
    stats=get_cache_stats,
)

Registry = struct(
    add=add_resource_to_cache,
    remove=remove_resource_from_cache,
    has=has_resource_in_cache,
    get_by_path=get_resource_by_path_from_cache,
    persist=persist_cache_to_file,
    stats=get_cache_stats,
    reinitialize=reinitialize,
)


# =============================================================================
# 🔍 SERVICE LOOKUP FUNCTIONS
# =============================================================================

def get_resource_by_name(name):
    """Get a resource by its appName."""
    for resource in APP_RESOURCES:
        if resource.get("name") == name or resource.get("appName") == name:
            return resource
    return None

def get_all_backend_resources():
    """Get all backend resource names."""
    backends = []
    for app_resource in APP_RESOURCES:
        resources = app_resource.get("resources", [])
        for resource in resources:
            if not resource.get("frontend", False):
                resource_name = resource.get("name", "")
                if resource_name:
                    backends.append(resource_name)
    return backends

def get_all_frontend_resources():
    """Get all frontend resource names."""
    frontends = []
    for app_resource in APP_RESOURCES:
        resources = app_resource.get("resources", [])
        for resource in resources:
            if resource.get("frontend", False):
                resource_name = resource.get("name", "")
                if resource_name:
                    frontends.append(resource_name)
    return frontends


# =============================================================================
# 📊 SNAPSHOT & TOPOLOGY GENERATION
# =============================================================================

def _render_product_stack_file(resource):
    """Render a product stack resource file content."""
    resource_name = resource.get("name", "unknown")
    lines = [
        "# ----------------------------------------------------------------------------",
        "# AUTOGENERATED FILE - DO NOT EDIT",
        "# ----------------------------------------------------------------------------",
        "",
        "# Product Stack: " + resource_name,
        "",
        "## Stack Info",
    ]
    
    for key in ["name", "appType", "stack", "port"]:
        if key in resource:
            lines.append("- " + key + ": `" + str(resource[key]) + "`")
    
    return "\n".join(lines) + "\n"

def _render_product_stacks_index(resources):
    """Render the product stacks index file content."""
    lines = [
        "# Product Stacks Index",
        "",
        "## Services",
        "",
    ]
    
    for resource in resources:
        resource_name = resource.get("name", "unknown")
        lines.append("- `" + resource_name + "`")
    
    return "\n".join(lines) + "\n"

def _write_file_if_changed(path, content):
    """Write file only if content changed. Returns True if written."""
    normalized = path.replace('\\', '/').replace('./', '', 1)
    if '..' in normalized.split('/') or not (
        '/.autogenerated/' in normalized or
        normalized.startswith('.autogenerated/') or
        normalized.startswith('.tdk/.tdk-out/') or
        normalized in ['Tiltfile', '.tiltignore'] or
        (normalized.startswith('TILT_') and normalized.endswith('.star') and '/' not in normalized)
    ):
        fail("Flisk discovery refused to write outside its generated-file allowlist: " + path)

    # Read existing file (returns empty string on error via shell)
    existing = str(local("cat " + path + " 2>/dev/null || echo ''", quiet=True, echo_off=True))
    
    if existing != content:
        local("mkdir -p $(dirname " + path + ") && echo '" + content + "' > " + path, quiet=True, echo_off=True)
        return True
    return False

def _render_star_file(description, var_name, data):
    """Render a Starlark file with data."""
    return "# " + description + "\n" + var_name + " = " + str(data) + "\n"

def generate_product_stack_topology():
    """Generate product stack topology folders."""
    local("mkdir -p " + PRODUCT_TOPOLOGY_DIR, quiet=True)
    
    changes = 0
    for resource in APP_RESOURCES:
        stack = resource.get("name", "unknown")
        if not stack or '/' in stack or '\\' in stack or stack == '..':
            fail("Invalid stack name for generated topology path: " + str(stack))
        stack_file = PRODUCT_TOPOLOGY_DIR + "/" + stack + "/stack.star"
        if _write_file_if_changed(stack_file, _render_product_stack_file(resource)):
            changes += 1
    
    index_path = PRODUCT_TOPOLOGY_DIR + "/INDEX.star"
    if _write_file_if_changed(index_path, _render_product_stacks_index(APP_RESOURCES)):
        changes += 1
    
    if changes > 0:
        print("Regenerated {} product stack files".format(changes))

def generate_product_snapshot_topology():
    """Generate product snapshot topology files."""
    local("mkdir -p " + PRODUCT_SNAPSHOT_DIR, quiet=True)
    
    services_path = PRODUCT_SNAPSHOT_DIR + "/services.star"
    deps_path = PRODUCT_SNAPSHOT_DIR + "/dependencies.star"
    aliases_path = PRODUCT_SNAPSHOT_DIR + "/aliases.star"
    paths_path = PRODUCT_SNAPSHOT_DIR + "/paths.star"
    index_path = PRODUCT_SNAPSHOT_DIR + "/index.star"
    
    changes = 0
    if _write_file_if_changed(services_path, _render_star_file("Services", "APP_RESOURCES_AUTOGENERATED", APP_RESOURCES)):
        changes += 1
    if _write_file_if_changed(deps_path, _render_star_file("Dependencies", "RESOURCE_DEPENDENCIES_AUTOGENERATED", RESOURCE_DEPENDENCIES)):
        changes += 1
    if _write_file_if_changed(aliases_path, _render_star_file("Aliases", "RESOURCE_ALIASES_AUTOGENERATED", RESOURCE_ALIASES)):
        changes += 1
    if _write_file_if_changed(paths_path, _render_star_file("Path Map", "RESOURCE_PATH_MAP_AUTOGENERATED", RESOURCE_PATH_MAP)):
        changes += 1
    if _write_file_if_changed(index_path, _render_star_file("Index", "INDEX", {"services": len(APP_RESOURCES)})):
        changes += 1
    
    if changes > 0:
        print("Regenerated {} snapshot files".format(changes))


# =============================================================================
# 📄 YAML MANIFEST GENERATION
# =============================================================================

def _json_to_yaml(json_data, indent=0):
    """Convert JSON to YAML format."""
    spaces = "  " * indent
    yaml_lines = []
    
    if type(json_data) == "dict":
        priority_fields = ["appName", "appType", "stack", "port"]
        ordered_keys = []
        for key in priority_fields:
            if key in json_data:
                ordered_keys.append(key)
        remaining = [k for k in json_data if k not in priority_fields and not k.startswith("_")]
        for key in sorted(remaining):
            ordered_keys.append(key)
        
        for key in ordered_keys:
            value = json_data[key]
            if str(key).startswith("_"):
                continue
            if type(value) == "dict":
                yaml_lines.append(spaces + str(key) + ":")
                nested = _json_to_yaml(value, indent + 1)
                if nested:
                    yaml_lines.append(nested)
            elif type(value) == "list":
                yaml_lines.append(spaces + str(key) + ":")
                for item in value:
                    if type(item) == "dict":
                        yaml_lines.append(spaces + "  - " + _json_to_yaml(item, 0).strip())
                    else:
                        yaml_lines.append(spaces + "  - " + str(item))
            else:
                yaml_lines.append(spaces + str(key) + ": " + str(value))
    elif type(json_data) == "list":
        for item in json_data:
            if type(item) == "dict":
                yaml_lines.append(spaces + "- " + _json_to_yaml(item, 0).strip())
            else:
                yaml_lines.append(spaces + "- " + str(item))
    else:
        yaml_lines.append(spaces + str(json_data))
    
    return "\n".join(yaml_lines)

def _find_manifest_files(root, manifest_filename):
    """Find manifest files, handling glob patterns in root paths."""
    files = []
    
    # Check if root contains glob patterns
    project_root = os.environ.get('TDK_PROJECT_ROOT', '.')
    if '*' in root or '?' in root:
        # Use bash to expand glob and find files
        cmd = "cd " + project_root + " && bash -c 'for dir in " + root + "; do if [ -d \"$dir\" ]; then find \"$dir\" -maxdepth 3 -type f -name \"" + manifest_filename + "\" 2>/dev/null; fi; done'"
        result = str(local(cmd, quiet=True, echo_off=True)).strip()
    else:
        # Resolve relative paths against project root (non-glob)
        if root.startswith('/'):
            full_path = root
        else:
            full_path = project_root + "/" + root
        # A stack listed in project.json may not have a directory yet (a fresh
        # project lists "proxy"); find exits 1 on a missing path and local() fails.
        cmd = "if [ -d '" + full_path + "' ]; then find '" + full_path + "' -type f -name '" + manifest_filename + "' 2>/dev/null; fi"
        result = str(local(cmd, quiet=True, echo_off=True)).strip()
    
    if result:
        for f in result.split("\n"):
            f = f.strip()
            if f and f not in files:
                files.append(f)
    
    return files

def _generate_yaml_from_json_manifests():
    """Generate YAML manifests from JSON manifests."""
    generated_count = 0
    for root in DISCOVERY_SCAN_ROOTS:
        json_files = _find_manifest_files(root, MANIFEST_FILENAME)
        
        for json_file in json_files:
            resource_dir = json_file.rsplit('/', 1)[0]
            yaml_file = resource_dir + "/.autogenerated/" + MANIFEST_FILENAME_YAML
            load_result = ManifestLoader.load_from_file(json_file)
            if not load_result.error and load_result.manifest:
                yaml_content = _json_to_yaml(load_result.manifest)
                if _write_file_if_changed(yaml_file, yaml_content):
                    generated_count += 1
    
    if generated_count > 0:
        print("Generated {} YAML manifests".format(generated_count))

def load_yaml_manifests_as_resources():
    """Load YAML manifests as Tilt resources (via local_resource)."""
    _generate_yaml_from_json_manifests()
    
    yaml_files = []
    for root in DISCOVERY_SCAN_ROOTS:
        files = _find_manifest_files(root, MANIFEST_FILENAME_YAML)
        for f in files:
            if '/.autogenerated/' + MANIFEST_FILENAME_YAML in f and f not in yaml_files:
                yaml_files.append(f)
    
    if not yaml_files:
        return
    
    created_resources = {}
    for yaml_file in yaml_files:
        service_dir = yaml_file.rsplit('/.autogenerated/', 1)[0]
        json_file = service_dir + '/' + MANIFEST_FILENAME
        load_result = ManifestLoader.load_from_file(json_file)
        resource_name = ""
        
        if load_result.error:
            continue
        
        manifest = load_result.manifest
        if manifest:
            resource_name = manifest.get("appName", "")
        
        if not resource_name:
            continue
        
        resource_name = resource_name + "-yaml"
        
        if resource_name in created_resources:
            continue
        
        yaml_path_display = yaml_file
        if yaml_file.startswith("../../../../"):
            yaml_path_display = yaml_file[12:]
        
        local_resource(
            name=resource_name,
            cmd=['echo', 'YAML manifest: ' + yaml_path_display],
            deps=[yaml_file],
            labels=["yaml-manifest"],
        )
        
        created_resources[resource_name] = True

# Generate YAML manifests at module load time
load_yaml_manifests_as_resources()

# Load project defaults from spec.master if available
project_root = os.environ.get('TDK_PROJECT_ROOT', '')
if project_root:
    project_defaults = Config.load_project_defaults(project_root)
    if project_defaults:
        Config = struct(
            load_project_defaults=Config.load_project_defaults,
            DEFAULTS=project_defaults.DEFAULTS,
            FOCUS_PRE_ALPHA=project_defaults.FOCUS_PRE_ALPHA,
            FOCUS_ALPHA=project_defaults.FOCUS_ALPHA,
            FOCUS_BETA=project_defaults.FOCUS_BETA,
            GLOBAL=Config.GLOBAL,
            INFRA_RESOURCES=Config.INFRA_RESOURCES,
            CORE_INFRA=Config.CORE_INFRA,
            INFRA_STACK_MAP=Config.INFRA_STACK_MAP,
            OPTIONAL_INFRA=Config.OPTIONAL_INFRA,
            DDD_LIBS=Config.DDD_LIBS,

        )

# Export config data
OPTIONAL_INFRA_EXPORT = OPTIONAL_INFRA
CORE_INFRA_EXPORT = CORE_INFRA
INFRA_STACK_MAP_EXPORT = INFRA_STACK_MAP
DEFAULTS_EXPORT = Config.DEFAULTS
DDD_LIBS_EXPORT = DDD_LIBS
GLOBAL_CONFIG_EXPORT = GLOBAL_CONFIG
INFRA_RESOURCES_EXPORT = INFRA_RESOURCES


# Export focus lists (populated from project spec.master)
FOCUS_PRE_ALPHA_EXPORT = Config.FOCUS_PRE_ALPHA
FOCUS_ALPHA_EXPORT = Config.FOCUS_ALPHA
FOCUS_BETA_EXPORT = Config.FOCUS_BETA

def get_platform_libs_export():
    return get_platform_libs()

def get_product_libs_export():
    return get_product_libs()
