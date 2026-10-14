// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { Command } from "commander";
import { Box, render, Text, useApp, useInput, useStdin, useStdout } from "ink";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DetailPanel,
  FileTree,
  ResourceSelectInput,
  ResourceTable,
  ServiceIssues,
  TabBar,
  TUIHeader,
} from "../components/index.js";
import { TABS } from "../components/TabBar.js";
import {
  createTUITheme,
  sectionTitle,
  TUIThemeContext,
  useTUITheme,
} from "../components/ui-theme.js";
import type {
  DiscoveredResource,
  DiscoveredStack,
  ErrorScreenProps,
  FileNode,
  HelpPanelProps,
  LoadingScreenProps,
  SelectItem,
  TabId,
} from "../types/index.js";
import { errorFactories, requireProjectRoot } from "../utils/errors.js";
import { findProjectRoot, getPackageVersion } from "../utils/paths.js";
import { describeSearch } from "../utils/search-status.js";
import {
  clearMetadataCache,
  discoverResources,
  discoverStacks,
  getResourceMetadata,
  getStackMetadata,
} from "../utils/services.js";
import { singleFlight } from "../utils/single-flight.js";
import { createStatusMessageController } from "../utils/status-message.js";
import { getListRowFromMouseY, getTerminalRuleWidth } from "../utils/terminal-layout.js";
import { isTiltAvailable } from "../utils/tilt.js";
import type {
  TiltEventSnapshot,
  TiltEventsFailureKind,
  TiltResourceSummary,
} from "../utils/tilt-events.js";
import {
  loadTiltEvents,
  stripTerminalControls,
  TiltEventsLoadError,
} from "../utils/tilt-events.js";
import { getTiltPollingPort } from "../utils/tilt-startup.js";
import { formatUiKeyHint, formatUiKeyNames, UI_KEYMAP } from "../utils/ui-keymap.js";
import {
  applyServiceStates,
  fetchServiceStates,
  type ServiceStates,
} from "../utils/ui-service-state.js";

// biome-ignore lint/correctness/noUnusedFunctionParameters: reserved callback prop kept in the component API
const HelpPanel: React.FC<HelpPanelProps> = ({ onClose }) => {
  const theme = useTUITheme();
  return (
    <Box
      {...(theme.ascii ? {} : { borderStyle: "single" as const, borderColor: theme.accent })}
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      width={60}
    >
      <Text bold color={theme.accent}>
        Keyboard Shortcuts
      </Text>
      <Box marginY={1} flexDirection="column">
        {(["Navigation", "Actions"] as const).map((group) => (
          <Box key={group} marginTop={group === "Actions" ? 1 : 0} flexDirection="column">
            <Text bold underline color={theme.foreground}>
              {group}
            </Text>
            {UI_KEYMAP.filter((shortcut) => shortcut.group === group).map((shortcut) => (
              <Text key={shortcut.id} color={theme.foreground}>
                {` ${formatUiKeyNames(shortcut.id, theme.ascii)} ${shortcut.label}`}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted} dimColor={theme.dimMuted}>
          Press any key to close...
        </Text>
      </Box>
    </Box>
  );
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ASCII_SPINNER_FRAMES = ["-", "/", "|", "\\"];

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = "Discovering resources...",
  animated = true,
}) => {
  const theme = useTUITheme();
  const spinnerFrames = theme.ascii ? ASCII_SPINNER_FRAMES : SPINNER_FRAMES;
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!animated) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % spinnerFrames.length), 80);
    return () => clearInterval(timer);
  }, [animated, spinnerFrames.length]);

  return (
    <Box flexDirection="column" padding={2}>
      <Text bold color={theme.accent}>
        {theme.bannerStart} TDK NEON EDITION {theme.bannerEnd}
      </Text>
      <Box marginY={1} />
      <Text color={theme.foreground}>
        {animated && <Text color={theme.accent}>{spinnerFrames[frame]} </Text>}
        {message}
      </Text>
    </Box>
  );
};

// biome-ignore lint/correctness/noUnusedFunctionParameters: reserved callback prop kept in the component API
const ErrorScreen: React.FC<ErrorScreenProps> = ({ error, onRetry }) => {
  const theme = useTUITheme();
  return (
    <Box flexDirection="column" padding={2} alignItems="center">
      <Text bold color={theme.error}>
        Could Not Load Services
      </Text>
      <Box marginY={1} />
      <Text color={theme.error}>
        {theme.ascii ? "[x]" : "\u2717"} {error}
      </Text>
      <Box marginY={1} />
      <Text color={theme.muted}>Troubleshooting:</Text>
      <Text color={theme.muted}> 1. Check that every service.json is valid JSON</Text>
      <Text color={theme.muted}> 2. Run tdk from your project (the folder with the Tiltfile)</Text>
      <Text color={theme.muted}> 3. Try: tdk status --verbose</Text>
      <Box marginY={1} />
      <Text color={theme.accent}>Press [r] to retry or [q] to quit</Text>
    </Box>
  );
};

const EmptyState: React.FC<{ message?: string }> = ({ message }) => {
  const theme = useTUITheme();
  return (
    <Box flexDirection="column" padding={2} alignItems="center">
      <Text bold color={theme.warning}>
        No Services Found
      </Text>
      <Box marginY={1} />
      <Text color={theme.muted}>{theme.ascii ? "[*]" : "\u25c9"} No service.json files found</Text>
      <Box marginY={1} />
      <Text color={theme.foreground}>To get started:</Text>
      <Text color={theme.foreground}> 1. Run: tdk project</Text>
      <Text color={theme.foreground}> 2. Run: tdk resource api --type backend</Text>
      <Box marginY={1} />
      <Text color={theme.accent}>Press [r] to refresh or [q] to quit</Text>
      {/* The top-level Esc hint has to be visible here too — with no services this is the
        whole screen, and without this line the hint was set but never drawn. */}
      {message && (
        <Box paddingX={1} height={1}>
          <Text color={theme.accent}>
            {theme.bannerStart} {message} {theme.bannerEnd}
          </Text>
        </Box>
      )}
    </Box>
  );
};

function formatResourceStatus(resource: TiltResourceSummary): string {
  const statuses: string[] = [];
  if (resource.runtimeStatus) statuses.push(`Runtime ${resource.runtimeStatus}`);
  if (resource.updateStatus) statuses.push(`Update ${resource.updateStatus}`);
  if (resource.hasPendingChanges) statuses.push("Changes pending");
  return statuses.join("; ") || "No status reported";
}

function formatEventTime(value?: string): string {
  if (!value) return "Current";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 20)
    : date
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d{3}Z$/, "Z");
}

function formatEventDetails(value: string, width: number): string {
  const normalized = stripTerminalControls(value).replace(/\s+/g, " ").trim();
  const suffix = "...";
  const maxLength = Math.max(suffix.length + 8, Math.floor(width) - 2);
  return normalized.length > maxLength
    ? normalized.slice(0, maxLength - suffix.length).trimEnd() + suffix
    : normalized;
}

export const TUIApp: React.FC<{ animated?: boolean }> = ({ animated = true }) => {
  const theme = useTUITheme();
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { stdin, setRawMode } = useStdin();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedStack, setSelectedStack] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const [terminalWidth, setTerminalWidth] = useState(stdout.columns || 120);
  const [terminalRows, setTerminalRows] = useState(stdout.rows || 24);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [mouseEnabled, setMouseEnabled] = useState(true);
  const [listTop, setListTop] = useState<number | null>(null);
  const [listStart, setListStart] = useState(0);
  // Reserve the header, tab bar, hints and footer; keep the cursor visible.
  const pageSize = Math.max(1, terminalRows - 14);
  const handleListLayout = useCallback((top: number, firstVisible = 0): void => {
    setListTop(top);
    setListStart(firstVisible);
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTooltips, setShowTooltips] = useState(true);
  const [showEnabledOnly, setShowEnabledOnly] = useState(true);
  const [eventSnapshot, setEventSnapshot] = useState<TiltEventSnapshot | null>(null);
  const [eventLoadState, setEventLoadState] = useState<
    "idle" | "loading" | "ready" | TiltEventsFailureKind
  >("idle");
  const [eventLoadError, setEventLoadError] = useState<string | null>(null);
  const eventRequestRef = useRef(0);

  const statusMessage = useMemo(() => createStatusMessageController(setMessage), []);
  useEffect(() => () => statusMessage.dispose(), [statusMessage]);

  const projectRoot = findProjectRoot() || "unknown";

  const [{ stacks, services }, setDiscovered] = useState<{
    stacks: DiscoveredStack[];
    services: DiscoveredResource[];
  }>({ stacks: [], services: [] });

  // What the running Tilt says about each service: the same answer `tdk status` gives. Empty while no Tilt answers.
  const [serviceStates, setServiceStates] = useState<ServiceStates>({});
  useEffect(() => {
    let cancelled = false;
    const tiltPort = getTiltPollingPort(process.env.TILT_PORT);
    // A Tilt call can outlast the 5 s interval; never start a poll while the last one is still running.
    const run = singleFlight<ServiceStates>((next) => {
      if (cancelled) return;
      setServiceStates((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    });
    const poll = (): Promise<void> => run(() => fetchServiceStates(services, tiltPort));
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [services]);

  // Re-read service.json files from disk. An empty project is not an error:
  // it renders EmptyState. Only a failed discovery shows ErrorScreen.
  const refresh = useCallback((): boolean => {
    clearMetadataCache();
    try {
      setDiscovered({ stacks: discoverStacks(), services: discoverResources() });
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshEvents = useCallback(async (): Promise<void> => {
    const requestId = ++eventRequestRef.current;
    setEventLoadState("loading");
    setEventLoadError(null);
    try {
      const snapshot = await loadTiltEvents();
      if (requestId !== eventRequestRef.current) return;
      setEventSnapshot(snapshot);
      setEventLoadState("ready");
    } catch (error) {
      if (requestId !== eventRequestRef.current) return;
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
    if (activeTab !== "events") return;
    void refreshEvents();
    return () => {
      eventRequestRef.current += 1;
    };
  }, [activeTab, refreshEvents]);

  const selectedStackData = useMemo(() => {
    if (!selectedStack) return null;
    const stack = stacks.find((s) => s.name === selectedStack);
    if (!stack) return null;
    return {
      stack,
      metadata: applyServiceStates(getStackMetadata(stack), serviceStates),
    };
  }, [selectedStack, stacks, serviceStates]);

  const selectedServiceData = useMemo(() => {
    if (!selectedService) return null;
    const service = services.find((s: DiscoveredResource) => s.name === selectedService);
    if (!service) return null;
    return {
      service,
      metadata: getResourceMetadata(service),
    };
  }, [selectedService, services]);

  const filteredStacks = useMemo(() => {
    if (!searchQuery) return stacks;
    return stacks.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.resources.some((svc: { name: string }) =>
          svc.name.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
    );
  }, [stacks, searchQuery]);

  const filteredServices = useMemo(() => {
    let filtered = services;
    if (showEnabledOnly) {
      filtered = filtered.filter((s: DiscoveredResource) => s.config?.enabled !== false);
    }
    if (searchQuery) {
      filtered = filtered.filter(
        (s: DiscoveredResource) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.stack || "").toLowerCase().includes(searchQuery.toLowerCase()),
      );
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
      return filteredServices.map((s: DiscoveredResource) => {
        const stackPrefix = s.stack && s.stack !== "unknown" ? `${s.stack}/` : "";
        const enabledLabel = s.config?.enabled === false ? " [DISABLED]" : "";
        return {
          label: `${stackPrefix}${s.name}${enabledLabel}`,
          value: s.name,
        };
      });
    }

    if (activeTab === "config") {
      return filteredServices.map((s: DiscoveredResource) => {
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
  const selectableListVisible =
    !loading &&
    !error &&
    !showHelp &&
    (activeTab === "overview" ||
      (activeTab === "resources" && !selectedStackData) ||
      (activeTab === "files" && !selectedServiceData) ||
      (activeTab === "config" && !selectedServiceData));

  // Only the stack and service lists are filtered by the query; drilled-in views are not.
  const searchList =
    activeTab === "overview" || (activeTab === "resources" && !selectedStackData)
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
    } else if (items.length === 0) {
      setHighlightedIndex(0);
    }
  }, [highlightedIndex, items.length]);

  const handleSelect = useCallback(
    (item: SelectItem) => {
      if (activeTab === "overview") {
        setSelectedStack(item.value);
        setSelectedService(null);
        statusMessage.show(`Selected stack: ${item.value}`, 2000);
      } else if (activeTab === "resources") {
        if (selectedStack && !selectedService) {
          setSelectedService(item.value);
          statusMessage.show(`Selected service: ${item.value}`, 2000);
        } else {
          setSelectedStack(item.value);
          setSelectedService(null);
        }
      } else if (activeTab === "files") {
        if (selectedService) {
          setSelectedFile(item.value);
          statusMessage.show(`Selected file: ${item.label}`, 2000);
        } else {
          setSelectedService(item.value);
          statusMessage.show(`Selected service: ${item.value}`, 2000);
        }
      } else if (activeTab === "config") {
        setSelectedService(item.value);
        statusMessage.show(`Viewing config for: ${item.value}`, 2000);
      }
    },
    [activeTab, selectedStack, selectedService, statusMessage],
  );

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
    if (!mouseEnabled) return;

    const handleMouseData = (data: Buffer) => {
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
          const listRow =
            selectableListVisible && listTop !== null ? getListRowFromMouseY(y, listTop) : -1;

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
      } else if (refresh()) {
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
        statusMessage.show(
          newState ? "Showing enabled services only" : "Showing all services (including disabled)",
          1500,
        );
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
    if (key.home || (plainKey && input === "g")) setHighlightedIndex(0);
    if (key.end || (plainKey && input === "G")) setHighlightedIndex(Math.max(0, items.length - 1));
    if (key.pageUp) setHighlightedIndex((prev) => Math.max(0, prev - pageSize));
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

  const fileTreeNodes: FileNode[] = useMemo(() => {
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
    return services.map((s: DiscoveredResource) => ({
      name: s.name,
      path: s.path,
      type: "directory",
      children: [],
    }));
  }, [selectedServiceData, services]);

  const showSidebar = terminalWidth > 100;
  const mainPanelWidth = showSidebar ? terminalWidth - 45 : terminalWidth - 4;

  if (loading) {
    return <LoadingScreen message="Discovering resources..." animated={animated} />;
  }

  if (error) {
    return <ErrorScreen error={error} onRetry={refresh} />;
  }

  const header = (
    <>
      <TUIHeader
        projectRoot={projectRoot}
        resourceCount={services.length}
        terminalWidth={terminalWidth}
        version={getPackageVersion()}
      />

      <Box paddingX={1}>
        <Text color={theme.muted}>
          {(theme.ascii ? "-" : "\u2500").repeat(getTerminalRuleWidth(terminalWidth))}
        </Text>
      </Box>
    </>
  );

  return (
    <Box flexDirection="column" height={stdout.rows || 24}>
      {header}

      {isSearching && (
        <Box paddingX={1} height={1}>
          <Text color={theme.warning}>Search: {searchQuery}_</Text>
          {searchStatus && (
            <Text
              color={theme.muted}
              dimColor={theme.dimMuted}
            >{`   ${searchStatus.summary}`}</Text>
          )}
        </Box>
      )}

      {searchStatus?.emptyMessage && (
        <Box paddingX={1} height={1}>
          <Text color={theme.muted}>{searchStatus.emptyMessage}</Text>
        </Box>
      )}

      {!isSearching && message && (
        <Box paddingX={1} height={1}>
          <Text color={theme.accent}>
            {theme.bannerStart} {message} {theme.bannerEnd}
          </Text>
        </Box>
      )}

      {!isSearching && !message && showTooltips && !showHelp && (
        <Box paddingX={1} height={1}>
          <Text color={theme.muted} dimColor={theme.dimMuted}>
            {createHelpHint(
              activeTab,
              selectedStack,
              selectedService,
              showEnabledOnly,
              theme.ascii,
            )}
          </Text>
        </Box>
      )}

      {showHelp && (
        <Box paddingX={1} flexGrow={1}>
          <HelpPanel onClose={() => setShowHelp(false)} />
        </Box>
      )}

      {!showHelp && (
        <>
          <Box marginTop={1}>
            <TabBar
              activeTab={activeTab}
              onTabChange={setActiveTab}
              terminalWidth={terminalWidth}
            />
          </Box>

          <Box flexDirection="row" paddingX={1} flexGrow={1}>
            <Box flexDirection="column" flexGrow={1} width={mainPanelWidth}>
              {activeTab === "overview" &&
                (services.length === 0 ? (
                  <EmptyState message={message} />
                ) : (
                  <>
                    <Box marginBottom={1}>
                      <Text bold color={theme.muted}>
                        Stacks
                      </Text>
                    </Box>
                    <Box marginTop={1} flexGrow={1}>
                      <ResourceSelectInput
                        items={items}
                        onSelect={handleSelect}
                        highlightedIndex={highlightedIndex}
                        isActive={!isSearching}
                        maxVisibleItems={pageSize}
                        width={mainPanelWidth}
                        onLayout={handleListLayout}
                      />
                    </Box>
                  </>
                ))}

              {activeTab === "resources" && (
                <>
                  <Box marginBottom={1}>
                    <Text bold color={theme.muted}>
                      {sectionTitle(theme, "Resources")}
                    </Text>
                  </Box>
                  {selectedStackData ? (
                    <>
                      <Text color={theme.muted}>Stack: {selectedStackData.stack.name}</Text>
                      <Box marginTop={1} flexDirection="column">
                        <ResourceTable
                          resources={selectedStackData.metadata.resources}
                          maxWidth={terminalWidth - (showSidebar ? 50 : 10)}
                        />
                        <ServiceIssues resources={selectedStackData.metadata.resources} />
                      </Box>
                    </>
                  ) : (
                    <>
                      <Text color={theme.muted}>Select a stack to view resources</Text>
                      <Box marginTop={1}>
                        <ResourceSelectInput
                          items={items}
                          onSelect={handleSelect}
                          highlightedIndex={highlightedIndex}
                          isActive={!isSearching}
                          maxVisibleItems={pageSize}
                          width={mainPanelWidth}
                          onLayout={handleListLayout}
                        />
                      </Box>
                    </>
                  )}
                </>
              )}

              {activeTab === "files" && (
                <>
                  <Box marginBottom={1}>
                    <Text bold color={theme.muted}>
                      {sectionTitle(theme, "Autogenerated Files")}
                    </Text>
                  </Box>
                  {selectedServiceData ? (
                    <>
                      <Text color={theme.muted}>Service: {selectedServiceData.service.name}</Text>
                      <Box marginTop={1}>
                        <FileTree nodes={fileTreeNodes} selectedPath={selectedFile || undefined} />
                      </Box>
                    </>
                  ) : (
                    <>
                      <Text color={theme.muted}>Select a service to view files</Text>
                      <Box marginTop={1}>
                        <ResourceSelectInput
                          items={items}
                          onSelect={handleSelect}
                          highlightedIndex={highlightedIndex}
                          isActive={!isSearching}
                          maxVisibleItems={pageSize}
                          width={mainPanelWidth}
                          onLayout={handleListLayout}
                        />
                      </Box>
                    </>
                  )}
                </>
              )}

              {activeTab === "events" && (
                <Box flexDirection="column" flexGrow={1}>
                  <Box marginBottom={1}>
                    <Text bold color={theme.muted}>
                      {sectionTitle(theme, "Event Timeline")}
                    </Text>
                  </Box>
                  {(eventLoadState === "idle" || eventLoadState === "loading") && (
                    <Text color={theme.muted}>Loading Tilt events...</Text>
                  )}
                  {eventLoadState === "unavailable" && (
                    <Box flexDirection="column">
                      <Text color={theme.warning}>
                        Tilt is not running or its UI is unreachable.
                      </Text>
                      <Text color={theme.muted}>
                        Start the stack with tdk up, then press [r] to retry.
                      </Text>
                    </Box>
                  )}
                  {eventLoadState === "error" && (
                    <Box flexDirection="column">
                      <Text color={theme.error}>Could not load Tilt events.</Text>
                      <Text color={theme.muted}>
                        {formatEventDetails(eventLoadError ?? "Unknown Tilt error", mainPanelWidth)}
                      </Text>
                      <Text color={theme.muted}>Press [r] to retry.</Text>
                    </Box>
                  )}
                  {eventLoadState === "ready" && (
                    <>
                      {eventSnapshot && eventSnapshot.resources.length > 0 && (
                        <Box flexDirection="column" marginBottom={1}>
                          <Text bold color={theme.muted}>
                            Current resources
                          </Text>
                          {eventSnapshot.resources.slice(0, 12).map((resource) => (
                            <Text key={resource.name} color={theme.accent}>
                              {resource.name}: {formatResourceStatus(resource)}
                            </Text>
                          ))}
                          {eventSnapshot.resources.length > 12 && (
                            <Text color={theme.muted}>Showing first 12 resources</Text>
                          )}
                        </Box>
                      )}
                      <Text bold color={theme.muted}>
                        Recent events
                      </Text>
                      {eventSnapshot && eventSnapshot.events.length > 20 && (
                        <Text color={theme.muted}>Showing first 20 events</Text>
                      )}
                      {eventSnapshot?.events.length ? (
                        <Box flexDirection="column" marginTop={1}>
                          {eventSnapshot.events.slice(0, 20).map((event) => (
                            <Box key={event.id} flexDirection="column" marginBottom={1}>
                              <Text
                                color={
                                  event.kind === "failed"
                                    ? theme.error
                                    : event.kind === "warning"
                                      ? theme.warning
                                      : event.kind === "running"
                                        ? theme.info
                                        : theme.success
                                }
                              >
                                {formatEventTime(event.occurredAt)} {event.resourceName}{" "}
                                {event.title}
                              </Text>
                              {event.details && (
                                <Text color={theme.muted}>
                                  {formatEventDetails(event.details, mainPanelWidth)}
                                </Text>
                              )}
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <Text color={theme.muted}>
                          No recent build events are available from Tilt yet.
                        </Text>
                      )}
                    </>
                  )}
                </Box>
              )}

              {activeTab === "config" && (
                <>
                  <Box marginBottom={1}>
                    <Text bold color={theme.muted}>
                      {sectionTitle(theme, "Configuration")}
                    </Text>
                  </Box>
                  {selectedServiceData ? (
                    <Box marginTop={1} flexDirection="column">
                      <Text color={theme.accent}>{selectedServiceData.service.configPath}</Text>
                      <Box
                        marginTop={1}
                        {...(theme.ascii
                          ? {}
                          : { borderStyle: "single" as const, borderColor: theme.border })}
                        paddingX={1}
                      >
                        <Text color={theme.muted} wrap="wrap">
                          {JSON.stringify(selectedServiceData.service.config, null, 2).slice(
                            0,
                            1000,
                          )}
                        </Text>
                      </Box>
                    </Box>
                  ) : (
                    <>
                      <Text color={theme.muted}>Select a service to view configuration</Text>
                      <Box marginTop={1}>
                        <ResourceSelectInput
                          items={items}
                          onSelect={handleSelect}
                          highlightedIndex={highlightedIndex}
                          isActive={!isSearching}
                          maxVisibleItems={pageSize}
                          width={mainPanelWidth}
                          onLayout={handleListLayout}
                        />
                      </Box>
                    </>
                  )}
                </>
              )}
            </Box>

            {showSidebar && (
              <Box marginLeft={2}>
                <DetailPanel
                  stack={selectedStackData?.stack || null}
                  service={selectedServiceData?.service || null}
                  stackMetadata={selectedStackData?.metadata || null}
                  visible={!!selectedStack || !!selectedService}
                />
              </Box>
            )}
          </Box>

          <Box
            {...(theme.ascii ? {} : { borderStyle: "single" as const, borderColor: theme.border })}
            paddingX={1}
            height={3}
            flexDirection="column"
            marginTop={1}
          >
            <Box justifyContent="space-between">
              <Text color={theme.accent} bold>
                {theme.bannerStart} {activeTab}
              </Text>
              <Text color={theme.success}>
                {theme.ascii ? "[+]" : "\u25cf"}{" "}
                {services.filter((s: DiscoveredResource) => s.stack).length} in stack
              </Text>
              <Text color={theme.warning}>
                {theme.ascii ? "-" : "\u25cb"}{" "}
                {services.filter((s: DiscoveredResource) => !s.stack).length} no stack
              </Text>
            </Box>
            <Box justifyContent="space-between">
              <Text color={theme.muted}>Stacks: {stacks.length}</Text>
              <Text color={theme.muted}>Services: {services.length}</Text>
              <Text color={theme.muted}>
                {theme.ascii ? "Mouse" : "🖱️"} {mouseEnabled ? "ON" : "OFF"}
                {theme.separator}
                {theme.ascii ? "Info" : "ℹ️"} {showTooltips ? "ON" : "OFF"}
                {theme.separator}
                <Text color={showEnabledOnly ? theme.success : theme.warning}>
                  {showEnabledOnly
                    ? theme.ascii
                      ? "[+] enabled"
                      : "\u2713 enabled"
                    : theme.ascii
                      ? "[+] all"
                      : "\u2713 all"}
                </Text>
                {theme.separator}
                {formatUiKeyHint("help", "Help", theme.ascii)}
                {theme.separator}
                {formatUiKeyHint("quit", "Quit", theme.ascii)}
              </Text>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
};

/** Compose footer guidance for the current tab and terminal character set. */
function createHelpHint(
  activeTab: TabId,
  selectedStack: string | null,
  selectedService: string | null,
  showEnabledOnly: boolean,
  ascii: boolean,
): string {
  const separator = ascii ? " | " : " │ ";
  const enabledHint = formatUiKeyHint(
    "toggle-enabled",
    showEnabledOnly ? "show all" : "enabled only",
    ascii,
  );
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
    return [`Service "${selectedService}"`, formatUiKeyHint("back", "Back", ascii), ...common].join(
      separator,
    );
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

const TUIRoot: React.FC<{ animated?: boolean; highContrast?: boolean }> = ({
  animated,
  highContrast,
}) => (
  <TUIThemeContext.Provider value={createTUITheme(Boolean(highContrast))}>
    <TUIApp animated={animated} />
  </TUIThemeContext.Provider>
);

export const uiCommand = new Command("ui")
  .description("Interactive TUI for managing stacks and services (Neon Edition)")
  .alias("interactive")
  .option("-v, --verbose", "Enable verbose output", false)
  .option("--no-animations", "Disable animations")
  .option("--high-contrast", "Enable high contrast mode")
  .action(async (options: { animations: boolean; highContrast: boolean }) => {
    const tiltAvailable = await isTiltAvailable();
    if (!tiltAvailable) {
      errorFactories.tiltNotInstalled().exit();
    }

    requireProjectRoot();
    // The app has no Static content, so its live layout starts at row 1 in the alternate screen.
    render(<TUIRoot animated={options.animations} highContrast={options.highContrast} />, {
      alternateScreen: true,
    });
  });
