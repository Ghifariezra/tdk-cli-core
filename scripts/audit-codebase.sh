#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
#
# Flisk Codebase Audit Script
# Scans for TODO, FIXME, BUG, HACK markers across all source files
#

set -e

# Colors for output
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GREEN='\033[0;32m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Directories to scan
CLI_DIR="cli/src"
DISCOVERY_DIR="discovery"
ENGINE_DIR="engine"

# File extensions to scan
TS_EXTENSIONS="*.ts *.tsx"
PY_EXTENSIONS="*.py"
STAR_EXTENSIONS="*.star"
GO_EXTENSIONS="*.go"

# Markers to search for
MARKERS="TODO|FIXME|XXX|BUG|HACK"

echo -e "${BLUE}🔍 Flisk Codebase Audit${NC}"
echo -e "${GRAY}Scanning for: ${MARKERS}${NC}"
echo ""

# Counters
cli_count=0
discovery_count=0
engine_count=0
total_count=0

# Temporary files for categorization
CLI_FINDINGS=$(mktemp)
DISCOVERY_FINDINGS=$(mktemp)
ENGINE_FINDINGS=$(mktemp)

# Function to scan a directory
scan_directory() {
    local dir="$1"
    local name="$2"
    local extensions="$3"
    local output_file="$4"
    local count=0

    echo -e "${BLUE}📁 Scanning ${name}...${NC}"

    if [ ! -d "$dir" ]; then
        echo -e "${YELLOW}   ⚠️  Directory not found: ${dir}${NC}"
        return 0
    fi

    for ext in $extensions; do
        while IFS= read -r file; do
            if [ -n "$file" ]; then
                local findings
                findings=$(grep -n -E "${MARKERS}" "$file" 2>/dev/null || true)
                if [ -n "$findings" ]; then
                    {
                        echo "$file"
                        echo "$findings"
                        echo ""
                    } >> "$output_file"
                    local file_count
                    file_count=$(echo "$findings" | wc -l)
                    count=$((count + file_count))
                fi
            fi
        done < <(find "$dir" -name "$ext" -type f 2>/dev/null)
    done

    echo -e "${GREEN}   ✅ Found ${count} marker(s)${NC}"
    return $count
}

# Scan CLI (TypeScript)
scan_directory "$CLI_DIR" "CLI (TypeScript)" "$TS_EXTENSIONS" "$CLI_FINDINGS"
cli_count=$?

# Scan Discovery (Python and Starlark)
scan_directory "$DISCOVERY_DIR" "Discovery (Python/Starlark)" "$PY_EXTENSIONS $STAR_EXTENSIONS" "$DISCOVERY_FINDINGS"
discovery_count=$?

# Scan Engine (Starlark)
scan_directory "$ENGINE_DIR" "Engine (Starlark)" "$STAR_EXTENSIONS $GO_EXTENSIONS" "$ENGINE_FINDINGS"
engine_count=$?

# Calculate total
total_count=$((cli_count + discovery_count + engine_count))

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📊 AUDIT REPORT${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Category: CLI (User-facing)
echo -e "${YELLOW}🔴 CLI (User-Facing) - ${cli_count} finding(s)${NC}"
echo -e "${GRAY}   These affect user commands and should be prioritized${NC}"
if [ -s "$CLI_FINDINGS" ]; then
    cat "$CLI_FINDINGS"
fi
echo ""

# Category: Core (Discovery/Engine)
echo -e "${YELLOW}🟡 Core (Discovery/Engine) - $((discovery_count + engine_count)) finding(s)${NC}"
echo -e "${GRAY}   Infrastructure code - affects service discovery and orchestration${NC}"

if [ -s "$DISCOVERY_FINDINGS" ]; then
    echo -e "${BLUE}   Discovery:${NC}"
    cat "$DISCOVERY_FINDINGS"
fi

if [ -s "$ENGINE_FINDINGS" ]; then
    echo -e "${BLUE}   Engine:${NC}"
    cat "$ENGINE_FINDINGS"
fi
echo ""

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📈 SUMMARY${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "Total markers found: ${total_count}"
echo ""
echo -e "By category:"
echo -e "  - CLI (User-facing):     ${cli_count}"
echo -e "  - Discovery:              ${discovery_count}"
echo -e "  - Engine:                ${engine_count}"
echo ""

if [ $total_count -eq 0 ]; then
    echo -e "${GREEN}✨ No technical debt markers found!${NC}"
else
    echo -e "${YELLOW}⚠️  Action required: Review and address findings above${NC}"
fi

# Save report to file
REPORT_FILE="codebase-audit-report-$(date +%Y%m%d-%H%M%S).md"
cat > "$REPORT_FILE" << EOF
# Flisk Codebase Audit Report

Generated: $(date)

## Summary

- **Total markers found:** ${total_count}
- **CLI (User-facing):** ${cli_count}
- **Discovery:** ${discovery_count}
- **Engine:** ${engine_count}

## Findings

### CLI (User-Facing) - Priority: HIGH

\`\`\`
EOF

if [ -s "$CLI_FINDINGS" ]; then
    cat "$CLI_FINDINGS" >> "$REPORT_FILE"
else
    echo "No findings" >> "$REPORT_FILE"
fi

cat >> "$REPORT_FILE" << EOF
\`\`\`

### Discovery - Priority: MEDIUM

\`\`\`
EOF

if [ -s "$DISCOVERY_FINDINGS" ]; then
    cat "$DISCOVERY_FINDINGS" >> "$REPORT_FILE"
else
    echo "No findings" >> "$REPORT_FILE"
fi

cat >> "$REPORT_FILE" << EOF
\`\`\`

### Engine - Priority: MEDIUM

\`\`\`
EOF

if [ -s "$ENGINE_FINDINGS" ]; then
    cat "$ENGINE_FINDINGS" >> "$REPORT_FILE"
else
    echo "No findings" >> "$REPORT_FILE"
fi

cat >> "$REPORT_FILE" << EOF
\`\`\`

## Next Steps

1. Review HIGH priority (CLI) findings first
2. Implement or remove TODOs as appropriate
3. Add tests for any new functionality
4. Re-run audit to verify cleanup
EOF

echo -e "${BLUE}💾 Full report saved to: ${REPORT_FILE}${NC}"

# Cleanup
rm -f "$CLI_FINDINGS" "$DISCOVERY_FINDINGS" "$ENGINE_FINDINGS"

exit 0
