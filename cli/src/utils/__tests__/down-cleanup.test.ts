// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import {
  findProjectTiltUpPids,
  projectNetworkNames,
  pruneProjectNetworks,
  stopProjectTiltUp,
  tdkNetworkOwner,
  tdkNetworkPrefixes,
  waitForTiltUpExit,
} from "../down-cleanup.js";

const TILTFILE = "/work/shop/.tdk/.tdk-out/Tiltfile";

describe("projectNetworkNames", () => {
  it("prefixes the engine's network names with the underscored project name", () => {
    const names = projectNetworkNames("my-shop");
    expect(names).toContain("my_shop_traefik-public");
    expect(names).toContain("my_shop_traefik-private");
    expect(names).toContain("my_shop_backend");
    expect(names).toContain("my_shop_database");
    expect(names).toContain("my_shop_infisical-network");
    expect(names).toContain("my_shop_verdaccio-network");
    expect(names).toContain("my_shop_proxy");
    expect(names).toHaveLength(7);
  });

  it("handles multi-hyphen and non-hyphen project names", () => {
    const multi = projectNetworkNames("deeply-nested-app-name");
    expect(multi[0]).toBe("deeply_nested_app_name_traefik-public");

    const single = projectNetworkNames("flisk");
    expect(single[0]).toBe("flisk_traefik-public");
  });
});

describe("tdkNetworkPrefixes", () => {
  it("extracts unique project prefixes from traefik-public and traefik-private networks", () => {
    const networks = [
      "shop_traefik-public",
      "shop_traefik-private",
      "billing_system_traefik-public",
      "other_backend",
      "bridge",
      "host",
    ];
    const prefixes = tdkNetworkPrefixes(networks);
    expect(prefixes).toEqual(new Set(["shop", "billing_system"]));
  });

  it("returns an empty set when no traefik networks are present", () => {
    const networks = ["backend", "database", "redis_network", "none"];
    expect(tdkNetworkPrefixes(networks)).toEqual(new Set());
    expect(tdkNetworkPrefixes([])).toEqual(new Set());
  });

  it("ignores traefik network names that lack a leading underscore delimiter", () => {
    const networks = ["traefik-public", "traefik-private"];
    expect(tdkNetworkPrefixes(networks)).toEqual(new Set());
  });
});

describe("tdkNetworkOwner", () => {
  const prefixes = new Set(["shop", "billing"]);

  it("returns the project prefix for networks matching known project suffixes", () => {
    expect(tdkNetworkOwner("shop_backend", prefixes)).toBe("shop");
    expect(tdkNetworkOwner("shop_database", prefixes)).toBe("shop");
    expect(tdkNetworkOwner("shop_traefik-public", prefixes)).toBe("shop");
    expect(tdkNetworkOwner("shop_traefik-private", prefixes)).toBe("shop");
    expect(tdkNetworkOwner("billing_proxy", prefixes)).toBe("billing");
    expect(tdkNetworkOwner("billing_infisical-network", prefixes)).toBe("billing");
    expect(tdkNetworkOwner("billing_verdaccio-network", prefixes)).toBe("billing");
  });

  it("returns null when the suffix is unknown or prefix is not in the set", () => {
    expect(tdkNetworkOwner("unknown_backend", prefixes)).toBeNull();
    expect(tdkNetworkOwner("shop_custom-network", prefixes)).toBeNull();
    expect(tdkNetworkOwner("shop_redis", prefixes)).toBeNull();
    expect(tdkNetworkOwner("bridge", prefixes)).toBeNull();
    expect(tdkNetworkOwner("", prefixes)).toBeNull();
  });
});

describe("pruneProjectNetworks", () => {
  it("removes only this project's networks and reports those Docker refuses to remove", () => {
    const calls: string[][] = [];
    const runner = vi.fn((_cmd: string, args: string[]) => {
      calls.push(args);
      if (args[1] === "ls")
        return "bridge\r\nshop_backend\r\nshop_database\r\nother_backend\r\nshop_proxy\r\n";
      if (args[2] === "shop_database") {
        throw Object.assign(new Error("x"), {
          stderr:
            "Error response from daemon: network shop_database has active endpoints\nsecond line",
        });
      }
      return "";
    });
    const result = pruneProjectNetworks("shop", runner);
    expect(result.removed).toEqual(["shop_backend", "shop_proxy"]);
    expect(result.kept).toEqual([
      {
        name: "shop_database",
        reason: "Error response from daemon: network shop_database has active endpoints",
      },
    ]);
    const removed = calls.filter((a) => a[1] === "rm").map((a) => a[2]);
    expect(removed).not.toContain("other_backend");
    expect(removed).not.toContain("bridge");
  });

  it("handles errors where stderr is a Buffer", () => {
    const runner = vi.fn((_cmd: string, args: string[]) => {
      if (args[1] === "ls") return "shop_backend\n";
      throw Object.assign(new Error("err"), {
        stderr: Buffer.from("network is in use\n"),
      });
    });
    const result = pruneProjectNetworks("shop", runner);
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([{ name: "shop_backend", reason: "network is in use" }]);
  });

  it("handles empty network list without running rm", () => {
    const calls: string[][] = [];
    const runner = vi.fn((_cmd: string, args: string[]) => {
      calls.push(args);
      return "";
    });
    const result = pruneProjectNetworks("shop", runner);
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["network", "ls", "--format", "{{.Name}}"]);
  });

  it("handles errors without stderr by extracting the stringified error", () => {
    const runner = vi.fn((_cmd: string, args: string[]) => {
      if (args[1] === "ls") return "shop_backend\n";
      throw "daemon connection failed";
    });
    const result = pruneProjectNetworks("shop", runner);
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([{ name: "shop_backend", reason: "daemon connection failed" }]);
  });
});

describe("findProjectTiltUpPids and stopProjectTiltUp", () => {
  const ps = [
    `  100 /opt/homebrew/bin/tilt up -f ${TILTFILE} -- --focus=shop`,
    `  101 /opt/homebrew/bin/tilt up -f /work/other/.tdk/.tdk-out/Tiltfile`,
    `  102 /opt/homebrew/bin/tilt down -f ${TILTFILE}`,
    `  103 /opt/homebrew/bin/tilt up -f ${TILTFILE}-copy`,
    `  104 vim ${TILTFILE}`,
    `  105 tilt up -f ${TILTFILE}`,
    `  106 /usr/local/bin/tilt up -f ${TILTFILE}`,
    `  107 tilt up -f ${TILTFILE}.backup`,
    "  invalid line without command",
  ].join("\n");

  it("matches only tilt up processes for this project's Tiltfile", () => {
    expect(findProjectTiltUpPids(TILTFILE, "darwin", () => ps)).toEqual([100, 105, 106]);
  });

  it("returns nothing on Windows or when ps fails", () => {
    expect(findProjectTiltUpPids(TILTFILE, "win32", () => ps)).toEqual([]);
    expect(
      findProjectTiltUpPids(TILTFILE, "linux", () => {
        throw new Error("no ps");
      }),
    ).toEqual([]);
  });

  it("stopProjectTiltUp sends TERM to each match and tolerates dead processes during kill", () => {
    const sent: string[][] = [];
    const runner = (cmd: string, args: string[]) => {
      if (cmd === "ps") return ps;
      if (args[1] === "100") throw new Error("ESRCH: no such process");
      sent.push(args);
      return "";
    };
    expect(stopProjectTiltUp(TILTFILE, "darwin", runner)).toEqual([100, 105, 106]);
    expect(sent).toEqual([
      ["-TERM", "105"],
      ["-TERM", "106"],
    ]);
  });

  it("stopProjectTiltUp does nothing when no matching pids exist", () => {
    const runner = vi.fn(() => "");
    expect(stopProjectTiltUp(TILTFILE, "darwin", runner)).toEqual([]);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith("ps", ["-axo", "pid=,command="]);
  });
});

describe("waitForTiltUpExit", () => {
  it("resolves true immediately when no pids exist initially", async () => {
    expect(await waitForTiltUpExit(TILTFILE, 5000, () => [])).toBe(true);
  });

  it("resolves true once the processes are gone and false on timeout", async () => {
    const seq = [[1], [1], []];
    expect(await waitForTiltUpExit(TILTFILE, 5000, () => seq.shift() ?? [])).toBe(true);
    expect(await waitForTiltUpExit(TILTFILE, 300, () => [1])).toBe(false);
  });
});
