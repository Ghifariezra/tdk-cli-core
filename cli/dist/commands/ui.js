import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { Command } from "commander";
import { Box, render, Text, useApp, useInput, useStdin, useStdout } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DetailPanel, FileTree, ResourceSelectInput, ResourceTable, ServiceIssues, TabBar, TUIHeader, } from "../components/index.js";
import { TABS } from "../components/TabBar.js";
import { createTUITheme, sectionTitle, TUIThemeContext, useTUITheme, } from "../components/ui-theme.js";
import { errorFactories, requireProjectRoot } from "../utils/errors.js";
import { findProjectRoot, getPackageVersion } from "../utils/paths.js";
import { describeSearch } from "../utils/search-status.js";
import { clearMetadataCache, discoverResources, discoverStacks, getResourceMetadata, getStackMetadata, } from "../utils/services.js";
import { singleFlight } from "../utils/single-flight.js";
import { createStatusMessageController } from "../utils/status-message.js";
import { getListRowFromMouseY, getTerminalRuleWidth } from "../utils/terminal-layout.js";
import { isTiltAvailable } from "../utils/tilt.js";
import { loadTiltEvents, stripTerminalControls, TiltEventsLoadError, } from "../utils/tilt-events.js";
import { getTiltPollingPort } from "../utils/tilt-startup.js";
import { formatUiKeyHint, formatUiKeyNames, UI_KEYMAP } from "../utils/ui-keymap.js";
import { applyServiceStates, fetchServiceStates, } from "../utils/ui-service-state.js";
// biome-ignore lint/correctness/noUnusedFunctionParameters: reserved callback prop kept in the component API
const HelpPanel = ({ onClose }) => {
    const theme = useTUITheme();
    return (_jsxs(Box, { ...(theme.ascii ? {} : { borderStyle: "single", borderColor: theme.accent }), paddingX: 2, paddingY: 1, flexDirection: "column", width: 60, children: [_jsx(Text, { bold: true, color: theme.accent, children: "Keyboard Shortcuts" }), _jsx(Box, { marginY: 1, flexDirection: "column", children: ["Navigation", "Actions"].map((group) => (_jsxs(Box, { marginTop: group === "Actions" ? 1 : 0, flexDirection: "column", children: [_jsx(Text, { bold: true, underline: true, color: theme.foreground, children: group }), UI_KEYMAP.filter((shortcut) => shortcut.group === group).map((shortcut) => (_jsx(Text, { color: theme.foreground, children: ` ${formatUiKeyNames(shortcut.id, theme.ascii)} ${shortcut.label}` }, shortcut.id)))] }, group))) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: theme.muted, dimColor: theme.dimMuted, children: "Press any key to close..." }) })] }));
};
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ASCII_SPINNER_FRAMES = ["-", "/", "|", "\\"];
export const LoadingScreen = ({ message = "Discovering resources...", animated = true, }) => {
    const theme = useTUITheme();
    const spinnerFrames = theme.ascii ? ASCII_SPINNER_FRAMES : SPINNER_FRAMES;
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        if (!animated)
            return;
        const timer = setInterval(() => setFrame((f) => (f + 1) % spinnerFrames.length), 80);
        return () => clearInterval(timer);
    }, [animated, spinnerFrames.length]);
    return (_jsxs(Box, { flexDirection: "column", padding: 2, children: [_jsxs(Text, { bold: true, color: theme.accent, children: [theme.bannerStart, " TDK NEON EDITION ", theme.bannerEnd] }), _jsx(Box, { marginY: 1 }), _jsxs(Text, { color: theme.foreground, children: [animated && _jsxs(Text, { color: theme.accent, children: [spinnerFrames[frame], " "] }), message] })] }));
};
// biome-ignore lint/correctness/noUnusedFunctionParameters: reserved callback prop kept in the component API
const ErrorScreen = ({ error, onRetry }) => {
    const theme = useTUITheme();
    return (_jsxs(Box, { flexDirection: "column", padding: 2, alignItems: "center", children: [_jsx(Text, { bold: true, color: theme.error, children: "Could Not Load Services" }), _jsx(Box, { marginY: 1 }), _jsxs(Text, { color: theme.error, children: [theme.ascii ? "[x]" : "\u2717", " ", error] }), _jsx(Box, { marginY: 1 }), _jsx(Text, { color: theme.muted, children: "Troubleshooting:" }), _jsx(Text, { color: theme.muted, children: " 1. Check that every service.json is valid JSON" }), _jsx(Text, { color: theme.muted, children: " 2. Run tdk from your project (the folder with the Tiltfile)" }), _jsx(Text, { color: theme.muted, children: " 3. Try: tdk status --verbose" }), _jsx(Box, { marginY: 1 }), _jsx(Text, { color: theme.accent, children: "Press [r] to retry or [q] to quit" })] }));
};
const EmptyState = ({ message }) => {
    const theme = useTUITheme();
    return (_jsxs(Box, { flexDirection: "column", padding: 2, alignItems: "center", children: [_jsx(Text, { bold: true, color: theme.warning, children: "No Services Found" }), _jsx(Box, { marginY: 1 }), _jsxs(Text, { color: theme.muted, children: [theme.ascii ? "[*]" : "\u25c9", " No service.json files found"] }), _jsx(Box, { marginY: 1 }), _jsx(Text, { color: theme.foreground, children: "To get started:" }), _jsx(Text, { color: theme.foreground, children: " 1. Run: tdk project" }), _jsx(Text, { color: theme.foreground, children: " 2. Run: tdk resource api --type backend" }), _jsx(Box, { marginY: 1 }), _jsx(Text, { color: theme.accent, children: "Press [r] to refresh or [q] to quit" }), message && (_jsx(Box, { paddingX: 1, height: 1, children: _jsxs(Text, { color: theme.accent, children: [theme.bannerStart, " ", message, " ", theme.bannerEnd] }) }))] }));
};
function formatResourceStatus(resource) {
    const statuses = [];
    if (resource.runtimeStatus)
        statuses.push(`Runtime ${resource.runtimeStatus}`);
    if (resource.updateStatus)
        statuses.push(`Update ${resource.updateStatus}`);
    if (resource.hasPendingChanges)
        statuses.push("Changes pending");
    return statuses.join("; ") || "No status reported";
}
function formatEventTime(value) {
    if (!value)
        return "Current";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value.slice(0, 20)
        : date
            .toISOString()
            .replace("T", " ")
            .replace(/\.\d{3}Z$/, "Z");
}
function formatEventDetails(value, width) {
    const normalized = stripTerminalControls(value).replace(/\s+/g, " ").trim();
    const suffix = "...";
    const maxLength = Math.max(suffix.length + 8, Math.floor(width) - 2);
    return normalized.length > maxLength
        ? normalized.slice(0, maxLength - suffix.length).trimEnd() + suffix
        : normalized;
}
export const TUIApp = ({ animated = true }) => {
    const theme = useTUITheme();
    const { exit } = useApp();
    const { stdout } = useStdout();
    const { stdin, setRawMode } = useStdin();
    const [activeTab, setActiveTab] = useState("overview");
    const [selectedStack, setSelectedStack] = useState(null);
    const [selectedService, setSelectedService] = useState(null);
    const [message, setMessage] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [showHelp, setShowHelp] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [terminalWidth, setTerminalWidth] = useState(stdout.columns || 120);
    const [terminalRows, setTerminalRows] = useState(stdout.rows || 24);
    const [selectedFile, setSelectedFile] = useState(null);
    const [mouseEnabled, setMouseEnabled] = useState(true);
    const [listTop, setListTop] = useState(null);
    const [listStart, setListStart] = useState(0);
    // Reserve the header, tab bar, hints and footer; keep the cursor visible.
    const pageSize = Math.max(1, terminalRows - 14);
    const handleListLayout = useCallback((top, firstVisible = 0) => {
        setListTop(top);
        setListStart(firstVisible);
    }, []);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showTooltips, setShowTooltips] = useState(true);
    const [showEnabledOnly, setShowEnabledOnly] = useState(true);
    const [eventSnapshot, setEventSnapshot] = useState(null);
    const [eventLoadState, setEventLoadState] = useState("idle");
    const [eventLoadError, setEventLoadError] = useState(null);
    const eventRequestRef = useRef(0);
    const statusMessage = useMemo(() => createStatusMessageController(setMessage), []);
    useEffect(() => () => statusMessage.dispose(), [statusMessage]);
    const projectRoot = findProjectRoot() || "unknown";
    const [{ stacks, services }, setDiscovered] = useState({ stacks: [], services: [] });
    // What the running Tilt says about each service: the same answer `tdk status` gives. Empty while no Tilt answers.
    const [serviceStates, setServiceStates] = useState({});
    useEffect(() => {
        let cancelled = false;
        const tiltPort = getTiltPollingPort(process.env.TILT_PORT);
        // A Tilt call can outlast the 5 s interval; never start a poll while the last one is still running.
        const run = singleFlight((next) => {
            if (cancelled)
                return;
            setServiceStates((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        });
        const poll = () => run(() => fetchServiceStates(services, tiltPort));
        void poll();
        const timer = setInterval(() => void poll(), 5000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [services]);
    // Re-read service.json files from disk. An empty project is not an error:
    // it renders EmptyState. Only a failed discovery shows ErrorScreen.
    const refresh = useCallback(() => {
        clearMetadataCache();
        try {
            setDiscovered({ stacks: discoverStacks(), services: discoverResources() });
            setError(null);
            return true;
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            return false;
        }
        finally {
            setLoading(false);
        }
    }, []);
    const refreshEvents = useCallback(async () => {
        const requestId = ++eventRequestRef.current;
        setEventLoadState("loading");
        setEventLoadError(null);
        try {
            const snapshot = await loadTiltEvents();
            if (requestId !== eventRequestRef.current)
                return;
            setEventSnapshot(snapshot);
            setEventLoadState("ready");
        }
        catch (error) {
            if (requestId !== eventRequestRef.current)
                return;
            setEventSnapshot(null);
            if (error instanceof TiltEventsLoadError && error.kind === "unavailable") {
                setEventLoadState("unavailable");
                return;
            }
            setEventLoadError(error instanceof Error ? error.message : String(error));
            setEventLoadState("error");
        }
    }, []);
    useEffect(() => {
        refresh();
    }, [refresh]);
    useEffect(() => {
        if (activeTab !== "events")
            return;
        void refreshEvents();
        return () => {
            eventRequestRef.current += 1;
        };
    }, [activeTab, refreshEvents]);
    const selectedStackData = useMemo(() => {
        if (!selectedStack)
            return null;
        const stack = stacks.find((s) => s.name === selectedStack);
        if (!stack)
            return null;
        return {
            stack,
            metadata: applyServiceStates(getStackMetadata(stack), serviceStates),
        };
    }, [selectedStack, stacks, serviceStates]);
    const selectedServiceData = useMemo(() => {
        if (!selectedService)
            return null;
        const service = services.find((s) => s.name === selectedService);
        if (!service)
            return null;
        return {
            service,
            metadata: getResourceMetadata(service),
        };
    }, [selectedService, services]);
    const filteredStacks = useMemo(() => {
        if (!searchQuery)
            return stacks;
        return stacks.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.resources.some((svc) => svc.name.toLowerCase().includes(searchQuery.toLowerCase())));
    }, [stacks, searchQuery]);
    const filteredServices = useMemo(() => {
        let filtered = services;
        if (showEnabledOnly) {
            filtered = filtered.filter((s) => s.config?.enabled !== false);
        }
        if (searchQuery) {
            filtered = filtered.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.stack || "").toLowerCase().includes(searchQuery.toLowerCase()));
        }
        return filtered;
    }, [services, searchQuery, showEnabledOnly]);
    const getItems = useCallback(() => {
        if (activeTab === "overview") {
            return filteredStacks.map((stack) => ({
                label: `${stack.name} (${stack.resources.length} resources)`,
                value: stack.name,
            }));
        }
        if (activeTab === "resources") {
            if (selectedStackData) {
                return selectedStackData.stack.resources.map((s) => {
                    const stackLabel = s.stack && s.stack !== "unknown" ? ` [${s.stack}]` : "";
                    const enabledLabel = s.config?.enabled === false ? " [DISABLED]" : "";
                    return {
                        label: `${s.name}${stackLabel}${enabledLabel}`,
                        value: s.name,
                    };
                });
            }
            return filteredStacks.map((stack) => ({
                label: `${stack.name} (${stack.resources.length} resources)`,
                value: stack.name,
            }));
        }
        if (activeTab === "files") {
            if (selectedServiceData) {
                return selectedServiceData.metadata.autogeneratedFiles.map((f) => ({
                    label: `${f.name} (${f.type})`,
                    value: f.path,
                }));
            }
            return filteredServices.map((s) => {
                const stackPrefix = s.stack && s.stack !== "unknown" ? `${s.stack}/` : "";
                const enabledLabel = s.config?.enabled === false ? " [DISABLED]" : "";
                return {
                    label: `${stackPrefix}${s.name}${enabledLabel}`,
                    value: s.name,
                };
            });
        }
        if (activeTab === "config") {
            return filteredServices.map((s) => {
                const stackPrefix = s.stack && s.stack !== "unknown" ? `${s.stack}/` : "";
                const stackLabel = s.stack ? ` [${s.stack}]` : "";
                const enabledLabel = s.config?.enabled === false ? " [DISABLED]" : "";
                return {
                    label: `${stackPrefix}${s.name}${stackLabel}${enabledLabel}`,
                    value: s.name,
                };
            });
        }
        return [];
    }, [activeTab, filteredStacks, filteredServices, selectedStackData, selectedServiceData]);
    const items = useMemo(getItems, [getItems]);
    const selectableListVisible = !loading &&
        !error &&
        !showHelp &&
        (activeTab === "overview" ||
            (activeTab === "resources" && !selectedStackData) ||
            (activeTab === "files" && !selectedServiceData) ||
            (activeTab === "config" && !selectedServiceData));
    // Only the stack and service lists are filtered by the query; drilled-in views are not.
    const searchList = activeTab === "overview" || (activeTab === "resources" && !selectedStackData)
        ? { total: stacks.length }
        : (activeTab === "files" && !selectedServiceData) || activeTab === "config"
            ? { total: services.length }
            : null;
    const searchStatus = searchList
        ? describeSearch(searchQuery, items.length, searchList.total)
        : null;
    useEffect(() => {
        if (highlightedIndex >= items.length && items.length > 0) {
            setHighlightedIndex(items.length - 1);
        }
        else if (items.length === 0) {
            setHighlightedIndex(0);
        }
    }, [highlightedIndex, items.length]);
    const handleSelect = useCallback((item) => {
        if (activeTab === "overview") {
            setSelectedStack(item.value);
            setSelectedService(null);
            statusMessage.show(`Selected stack: ${item.value}`, 2000);
        }
        else if (activeTab === "resources") {
            if (selectedStack && !selectedService) {
                setSelectedService(item.value);
                statusMessage.show(`Selected service: ${item.value}`, 2000);
            }
            else {
                setSelectedStack(item.value);
                setSelectedService(null);
            }
        }
        else if (activeTab === "files") {
            if (selectedService) {
                setSelectedFile(item.value);
                statusMessage.show(`Selected file: ${item.label}`, 2000);
            }
            else {
                setSelectedService(item.value);
                statusMessage.show(`Selected service: ${item.value}`, 2000);
            }
        }
        else if (activeTab === "config") {
            setSelectedService(item.value);
            statusMessage.show(`Viewing config for: ${item.value}`, 2000);
        }
    }, [activeTab, selectedStack, selectedService, statusMessage]);
    useEffect(() => {
        setRawMode(true);
        stdout.write("\x1b[?1000h");
        stdout.write("\x1b[?1006h");
        return () => {
            setRawMode(false);
            stdout.write("\x1b[?1000l");
            stdout.write("\x1b[?1006l");
        };
    }, [setRawMode, stdout]);
    useEffect(() => {
        if (!mouseEnabled)
            return;
        const handleMouseData = (data) => {
            const str = data.toString();
            // Parse SGR 1006 mouse protocol: ESC[<btn;x;yM or ESC[<btn;x;ym
            // biome-ignore lint/suspicious/noControlCharactersInRegex: \\x1b ESC is intentional (ANSI SGR/CSI sequence parsing)
            const sgrMatch = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
            const btnText = sgrMatch?.[1];
            const yText = sgrMatch?.[3];
            const action = sgrMatch?.[4];
            if (btnText !== undefined && yText !== undefined && action !== undefined) {
                const btn = parseInt(btnText, 10);
                const y = parseInt(yText, 10);
                const release = action === "m";
                // Check if it's a left click (btn & 0b11 == 0 means left button)
                const isLeftClick = (btn & 0b11) === 0;
                if (isLeftClick && !release) {
                    const listRow = selectableListVisible && listTop !== null ? getListRowFromMouseY(y, listTop) : -1;
                    const itemIndex = listStart + listRow;
                    if (listRow >= 0 && listRow < pageSize && itemIndex < items.length) {
                        setHighlightedIndex(itemIndex);
                        const item = items[itemIndex];
                        if (item) {
                            handleSelect(item);
                        }
                    }
                }
                return;
            }
        };
        stdin.on("data", handleMouseData);
        return () => {
            stdin.off("data", handleMouseData);
            stdin.removeAllListeners("data");
        };
    }, [
        stdin,
        items,
        listTop,
        listStart,
        pageSize,
        selectableListVisible,
        mouseEnabled,
        handleSelect,
    ]);
    const handleResize = useCallback(() => {
        setTerminalWidth(stdout.columns || 120);
        setTerminalRows(stdout.rows || 24);
    }, [stdout]);
    useEffect(() => {
        stdout.on("resize", handleResize);
        return () => {
            stdout.off("resize", handleResize);
        };
    }, [stdout, handleResize]);
    // Keep this dispatcher in sync with UI_KEYMAP; the shared map drives the help panel and footer.
    useInput((input, key) => {
        if (error) {
            if (input === "r" || input === "R") {
                refresh();
                return;
            }
            if (input === "q" || key.escape) {
                exit();
                return;
            }
            return;
        }
        if (showHelp) {
            setShowHelp(false);
            return;
        }
        if (isSearching) {
            if (key.return) {
                setIsSearching(false);
                return;
            }
            if (key.escape) {
                setIsSearching(false);
                setSearchQuery("");
                return;
            }
            if (key.backspace || key.delete) {
                setSearchQuery((prev) => prev.slice(0, -1));
                return;
            }
            if (input && !key.ctrl && !key.meta) {
                setSearchQuery((prev) => prev + input);
                return;
            }
            return;
        }
        if (input === "q" && !key.ctrl && !key.meta) {
            exit();
            return;
        }
        if (key.escape) {
            if (selectedFile) {
                setSelectedFile(null);
                return;
            }
            if (selectedService) {
                setSelectedService(null);
                return;
            }
            if (selectedStack) {
                setSelectedStack(null);
                return;
            }
            statusMessage.show("Press q to quit", 2000);
            return;
        }
        if (input === "?") {
            setShowHelp(true);
            return;
        }
        if (input === "r") {
            if (activeTab === "events") {
                void refreshEvents();
            }
            else if (refresh()) {
                statusMessage.show("Data refreshed", 1500);
            }
            return;
        }
        if (input === "/") {
            setIsSearching(true);
            setSearchQuery("");
            setMessage("Search: ");
            return;
        }
        if (input === "m") {
            setMouseEnabled((prev) => {
                const newState = !prev;
                statusMessage.show(newState ? "Mouse support enabled" : "Mouse support disabled");
                return newState;
            });
            return;
        }
        if (input === "t") {
            setShowTooltips((prev) => {
                const newState = !prev;
                statusMessage.show(newState ? "Tooltips enabled" : "Tooltips disabled");
                return newState;
            });
            return;
        }
        if (input === "e") {
            setShowEnabledOnly((prev) => {
                const newState = !prev;
                statusMessage.show(newState ? "Showing enabled services only" : "Showing all services (including disabled)", 1500);
                return newState;
            });
            return;
        }
        if (key.tab) {
            const tabs = TABS.map((tab) => tab.id);
            const currentIdx = tabs.indexOf(activeTab);
            const nextIdx = key.shift
                ? (currentIdx - 1 + tabs.length) % tabs.length
                : (currentIdx + 1) % tabs.length;
            setActiveTab(tabs[nextIdx]);
            return;
        }
        const shortcutTab = TABS.find((tab) => tab.shortcut === input);
        if (shortcutTab) {
            setActiveTab(shortcutTab.id);
            return;
        }
        const plainKey = !key.ctrl && !key.meta;
        if (items.length > 0 && (key.upArrow || (plainKey && input === "k"))) {
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
        }
        if (items.length > 0 && (key.downArrow || (plainKey && input === "j"))) {
            setHighlightedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
        }
        if (key.home || (plainKey && input === "g"))
            setHighlightedIndex(0);
        if (key.end || (plainKey && input === "G"))
            setHighlightedIndex(Math.max(0, items.length - 1));
        if (key.pageUp)
            setHighlightedIndex((prev) => Math.max(0, prev - pageSize));
        if (key.pageDown)
            setHighlightedIndex((prev) => Math.min(Math.max(0, items.length - 1), prev + pageSize));
        if (key.return || input === " ") {
            const currentItem = items[highlightedIndex];
            if (currentItem) {
                handleSelect(currentItem);
            }
            return;
        }
    });
    const fileTreeNodes = useMemo(() => {
        if (selectedServiceData) {
            return [
                {
                    name: selectedServiceData.service.name,
                    path: selectedServiceData.service.path,
                    type: "directory",
                    children: selectedServiceData.metadata.autogeneratedFiles.map((f) => ({
                        name: f.name,
                        path: f.path,
                        type: "file",
                        fileType: f.type,
                        size: f.size,
                        lastModified: f.lastModified,
                    })),
                },
            ];
        }
        return services.map((s) => ({
            name: s.name,
            path: s.path,
            type: "directory",
            children: [],
        }));
    }, [selectedServiceData, services]);
    const showSidebar = terminalWidth > 100;
    const mainPanelWidth = showSidebar ? terminalWidth - 45 : terminalWidth - 4;
    if (loading) {
        return _jsx(LoadingScreen, { message: "Discovering resources...", animated: animated });
    }
    if (error) {
        return _jsx(ErrorScreen, { error: error, onRetry: refresh });
    }
    const header = (_jsxs(_Fragment, { children: [_jsx(TUIHeader, { projectRoot: projectRoot, resourceCount: services.length, terminalWidth: terminalWidth, version: getPackageVersion() }), _jsx(Box, { paddingX: 1, children: _jsx(Text, { color: theme.muted, children: (theme.ascii ? "-" : "\u2500").repeat(getTerminalRuleWidth(terminalWidth)) }) })] }));
    return (_jsxs(Box, { flexDirection: "column", height: stdout.rows || 24, children: [header, isSearching && (_jsxs(Box, { paddingX: 1, height: 1, children: [_jsxs(Text, { color: theme.warning, children: ["Search: ", searchQuery, "_"] }), searchStatus && (_jsx(Text, { color: theme.muted, dimColor: theme.dimMuted, children: `   ${searchStatus.summary}` }))] })), searchStatus?.emptyMessage && (_jsx(Box, { paddingX: 1, height: 1, children: _jsx(Text, { color: theme.muted, children: searchStatus.emptyMessage }) })), !isSearching && message && (_jsx(Box, { paddingX: 1, height: 1, children: _jsxs(Text, { color: theme.accent, children: [theme.bannerStart, " ", message, " ", theme.bannerEnd] }) })), !isSearching && !message && showTooltips && !showHelp && (_jsx(Box, { paddingX: 1, height: 1, children: _jsx(Text, { color: theme.muted, dimColor: theme.dimMuted, children: createHelpHint(activeTab, selectedStack, selectedService, showEnabledOnly, theme.ascii) }) })), showHelp && (_jsx(Box, { paddingX: 1, flexGrow: 1, children: _jsx(HelpPanel, { onClose: () => setShowHelp(false) }) })), !showHelp && (_jsxs(_Fragment, { children: [_jsx(Box, { marginTop: 1, children: _jsx(TabBar, { activeTab: activeTab, onTabChange: setActiveTab, terminalWidth: terminalWidth }) }), _jsxs(Box, { flexDirection: "row", paddingX: 1, flexGrow: 1, children: [_jsxs(Box, { flexDirection: "column", flexGrow: 1, width: mainPanelWidth, children: [activeTab === "overview" &&
                                        (services.length === 0 ? (_jsx(EmptyState, { message: message })) : (_jsxs(_Fragment, { children: [_jsx(Box, { marginBottom: 1, children: _jsx(Text, { bold: true, color: theme.muted, children: "Stacks" }) }), _jsx(Box, { marginTop: 1, flexGrow: 1, children: _jsx(ResourceSelectInput, { items: items, onSelect: handleSelect, highlightedIndex: highlightedIndex, isActive: !isSearching, maxVisibleItems: pageSize, width: mainPanelWidth, onLayout: handleListLayout }) })] }))), activeTab === "resources" && (_jsxs(_Fragment, { children: [_jsx(Box, { marginBottom: 1, children: _jsx(Text, { bold: true, color: theme.muted, children: sectionTitle(theme, "Resources") }) }), selectedStackData ? (_jsxs(_Fragment, { children: [_jsxs(Text, { color: theme.muted, children: ["Stack: ", selectedStackData.stack.name] }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsx(ResourceTable, { resources: selectedStackData.metadata.resources, maxWidth: terminalWidth - (showSidebar ? 50 : 10) }), _jsx(ServiceIssues, { resources: selectedStackData.metadata.resources })] })] })) : (_jsxs(_Fragment, { children: [_jsx(Text, { color: theme.muted, children: "Select a stack to view resources" }), _jsx(Box, { marginTop: 1, children: _jsx(ResourceSelectInput, { items: items, onSelect: handleSelect, highlightedIndex: highlightedIndex, isActive: !isSearching, maxVisibleItems: pageSize, width: mainPanelWidth, onLayout: handleListLayout }) })] }))] })), activeTab === "files" && (_jsxs(_Fragment, { children: [_jsx(Box, { marginBottom: 1, children: _jsx(Text, { bold: true, color: theme.muted, children: sectionTitle(theme, "Autogenerated Files") }) }), selectedServiceData ? (_jsxs(_Fragment, { children: [_jsxs(Text, { color: theme.muted, children: ["Service: ", selectedServiceData.service.name] }), _jsx(Box, { marginTop: 1, children: _jsx(FileTree, { nodes: fileTreeNodes, selectedPath: selectedFile || undefined }) })] })) : (_jsxs(_Fragment, { children: [_jsx(Text, { color: theme.muted, children: "Select a service to view files" }), _jsx(Box, { marginTop: 1, children: _jsx(ResourceSelectInput, { items: items, onSelect: handleSelect, highlightedIndex: highlightedIndex, isActive: !isSearching, maxVisibleItems: pageSize, width: mainPanelWidth, onLayout: handleListLayout }) })] }))] })), activeTab === "events" && (_jsxs(Box, { flexDirection: "column", flexGrow: 1, children: [_jsx(Box, { marginBottom: 1, children: _jsx(Text, { bold: true, color: theme.muted, children: sectionTitle(theme, "Event Timeline") }) }), (eventLoadState === "idle" || eventLoadState === "loading") && (_jsx(Text, { color: theme.muted, children: "Loading Tilt events..." })), eventLoadState === "unavailable" && (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { color: theme.warning, children: "Tilt is not running or its UI is unreachable." }), _jsx(Text, { color: theme.muted, children: "Start the stack with tdk up, then press [r] to retry." })] })), eventLoadState === "error" && (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { color: theme.error, children: "Could not load Tilt events." }), _jsx(Text, { color: theme.muted, children: formatEventDetails(eventLoadError ?? "Unknown Tilt error", mainPanelWidth) }), _jsx(Text, { color: theme.muted, children: "Press [r] to retry." })] })), eventLoadState === "ready" && (_jsxs(_Fragment, { children: [eventSnapshot && eventSnapshot.resources.length > 0 && (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, color: theme.muted, children: "Current resources" }), eventSnapshot.resources.slice(0, 12).map((resource) => (_jsxs(Text, { color: theme.accent, children: [resource.name, ": ", formatResourceStatus(resource)] }, resource.name))), eventSnapshot.resources.length > 12 && (_jsx(Text, { color: theme.muted, children: "Showing first 12 resources" }))] })), _jsx(Text, { bold: true, color: theme.muted, children: "Recent events" }), eventSnapshot && eventSnapshot.events.length > 20 && (_jsx(Text, { color: theme.muted, children: "Showing first 20 events" })), eventSnapshot?.events.length ? (_jsx(Box, { flexDirection: "column", marginTop: 1, children: eventSnapshot.events.slice(0, 20).map((event) => (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsxs(Text, { color: event.kind === "failed"
                                                                        ? theme.error
                                                                        : event.kind === "warning"
                                                                            ? theme.warning
                                                                            : event.kind === "running"
                                                                                ? theme.info
                                                                                : theme.success, children: [formatEventTime(event.occurredAt), " ", event.resourceName, " ", event.title] }), event.details && (_jsx(Text, { color: theme.muted, children: formatEventDetails(event.details, mainPanelWidth) }))] }, event.id))) })) : (_jsx(Text, { color: theme.muted, children: "No recent build events are available from Tilt yet." }))] }))] })), activeTab === "config" && (_jsxs(_Fragment, { children: [_jsx(Box, { marginBottom: 1, children: _jsx(Text, { bold: true, color: theme.muted, children: sectionTitle(theme, "Configuration") }) }), selectedServiceData ? (_jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsx(Text, { color: theme.accent, children: selectedServiceData.service.configPath }), _jsx(Box, { marginTop: 1, ...(theme.ascii
                                                            ? {}
                                                            : { borderStyle: "single", borderColor: theme.border }), paddingX: 1, children: _jsx(Text, { color: theme.muted, wrap: "wrap", children: JSON.stringify(selectedServiceData.service.config, null, 2).slice(0, 1000) }) })] })) : (_jsxs(_Fragment, { children: [_jsx(Text, { color: theme.muted, children: "Select a service to view configuration" }), _jsx(Box, { marginTop: 1, children: _jsx(ResourceSelectInput, { items: items, onSelect: handleSelect, highlightedIndex: highlightedIndex, isActive: !isSearching, maxVisibleItems: pageSize, width: mainPanelWidth, onLayout: handleListLayout }) })] }))] }))] }), showSidebar && (_jsx(Box, { marginLeft: 2, children: _jsx(DetailPanel, { stack: selectedStackData?.stack || null, service: selectedServiceData?.service || null, stackMetadata: selectedStackData?.metadata || null, visible: !!selectedStack || !!selectedService }) }))] }), _jsxs(Box, { ...(theme.ascii ? {} : { borderStyle: "single", borderColor: theme.border }), paddingX: 1, height: 3, flexDirection: "column", marginTop: 1, children: [_jsxs(Box, { justifyContent: "space-between", children: [_jsxs(Text, { color: theme.accent, bold: true, children: [theme.bannerStart, " ", activeTab] }), _jsxs(Text, { color: theme.success, children: [theme.ascii ? "[+]" : "\u25cf", " ", services.filter((s) => s.stack).length, " in stack"] }), _jsxs(Text, { color: theme.warning, children: [theme.ascii ? "-" : "\u25cb", " ", services.filter((s) => !s.stack).length, " no stack"] })] }), _jsxs(Box, { justifyContent: "space-between", children: [_jsxs(Text, { color: theme.muted, children: ["Stacks: ", stacks.length] }), _jsxs(Text, { color: theme.muted, children: ["Services: ", services.length] }), _jsxs(Text, { color: theme.muted, children: [theme.ascii ? "Mouse" : "🖱️", " ", mouseEnabled ? "ON" : "OFF", theme.separator, theme.ascii ? "Info" : "ℹ️", " ", showTooltips ? "ON" : "OFF", theme.separator, _jsx(Text, { color: showEnabledOnly ? theme.success : theme.warning, children: showEnabledOnly
                                                    ? theme.ascii
                                                        ? "[+] enabled"
                                                        : "\u2713 enabled"
                                                    : theme.ascii
                                                        ? "[+] all"
                                                        : "\u2713 all" }), theme.separator, formatUiKeyHint("help", "Help", theme.ascii), theme.separator, formatUiKeyHint("quit", "Quit", theme.ascii)] })] })] })] }))] }));
};
/** Compose footer guidance for the current tab and terminal character set. */
function createHelpHint(activeTab, selectedStack, selectedService, showEnabledOnly, ascii) {
    const separator = ascii ? " | " : " │ ";
    const enabledHint = formatUiKeyHint("toggle-enabled", showEnabledOnly ? "show all" : "enabled only", ascii);
    const common = [enabledHint, formatUiKeyHint("help", "help", ascii)];
    const cycleTabs = formatUiKeyHint("cycle-tabs", "Tabs", ascii);
    if (activeTab === "overview") {
        const introduction = selectedStack
            ? `Stack "${selectedStack}" selected. ${formatUiKeyHint("select", "view", ascii)}`
            : formatUiKeyHint("list-navigation", "Navigate", ascii);
        const controls = selectedStack
            ? [formatUiKeyHint("back", "back", ascii), ...common]
            : [formatUiKeyHint("select", "Select", ascii), ...common];
        return [introduction, ...controls].join(separator);
    }
    if (activeTab === "resources") {
        return [
            cycleTabs,
            formatUiKeyHint("refresh", "Refresh", ascii),
            formatUiKeyHint("search", "Search", ascii),
            ...common,
        ].join(separator);
    }
    if (activeTab === "files" && selectedService) {
        return [`Service "${selectedService}"`, formatUiKeyHint("back", "Back", ascii), ...common].join(separator);
    }
    if (activeTab === "files") {
        return ["Select service to view files", ...common].join(separator);
    }
    if (activeTab === "events") {
        return [
            formatUiKeyHint("refresh", "Refresh events", ascii),
            formatUiKeyHint("cycle-tabs", "Tabs", ascii),
            formatUiKeyHint("help", "help", ascii),
            formatUiKeyHint("quit", "Quit", ascii),
        ].join(separator);
    }
    if (activeTab === "config") {
        return ["View configurations", ...common].join(separator);
    }
    return [
        formatUiKeyHint("cycle-tabs", "Tabs", ascii),
        formatUiKeyHint("direct-tabs", "Tabs", ascii),
        ...common,
        formatUiKeyHint("quit", "Quit", ascii),
    ].join(separator);
}
const TUIRoot = ({ animated, highContrast, }) => (_jsx(TUIThemeContext.Provider, { value: createTUITheme(Boolean(highContrast)), children: _jsx(TUIApp, { animated: animated }) }));
export const uiCommand = new Command("ui")
    .description("Interactive TUI for managing stacks and services (Neon Edition)")
    .alias("interactive")
    .option("-v, --verbose", "Enable verbose output", false)
    .option("--no-animations", "Disable animations")
    .option("--high-contrast", "Enable high contrast mode")
    .action(async (options) => {
    const tiltAvailable = await isTiltAvailable();
    if (!tiltAvailable) {
        errorFactories.tiltNotInstalled().exit();
    }
    requireProjectRoot();
    // The app has no Static content, so its live layout starts at row 1 in the alternate screen.
    render(_jsx(TUIRoot, { animated: options.animations, highContrast: options.highContrast }), {
        alternateScreen: true,
    });
});
