// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { summarizeServiceProbes } from "../doctor-runtime.js";
import type { HealthProbe } from "../service-urls.js";

const base = {
  appType: "backend" as const,
  url: "http://api.shop.localhost/api/orders/health",
};

const answered = (
  name: string,
  status: number,
  overrides: Partial<HealthProbe> = {},
): HealthProbe => ({
  ...base,
  name,
  ok: status >= 200 && status < 300,
  status,
  ...overrides,
});

const refused = (name: string, error = "fetch failed"): HealthProbe => ({
  ...base,
  name,
  ok: false,
  error,
});

describe("summarizeServiceProbes", () => {
  it("skips when probe list is empty", () => {
    const result = summarizeServiceProbes([]);
    expect(result.isSkipped).toBe(true);
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("No services responded - skipped ping of 0 services");
    expect(result.fix).toContain("flisk up");
  });

  it("skips when every probe failed to connect (stack down or Traefik not bound)", () => {
    const result = summarizeServiceProbes([refused("orders-api"), refused("users-api")]);
    expect(result.isSkipped).toBe(true);
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("No services responded - skipped ping of 2 services");
    expect(result.fix).toContain("If `flisk up` is already running");
  });

  it("fails, not skips, when the only service gets a 404 from Traefik", () => {
    // The case doctor missed: ingress is up and answering, but has no route.
    const result = summarizeServiceProbes([answered("orders-api", 404)]);
    expect(result.isSkipped).toBeUndefined();
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("orders-api");
    expect(result.message).toContain("HTTP 404");
    expect(result.message).toContain("no route");
    expect(result.fix).toContain("re-run `flisk doctor`");
  });

  it("fails on 502/503/504 and explains the container isn't answering", () => {
    for (const status of [502, 503, 504]) {
      const result = summarizeServiceProbes([answered("orders-api", status)]);
      expect(result.didPass).toBe(false);
      expect(result.message).toContain(`HTTP ${status}`);
      expect(result.message).toContain("container isn't answering");
      expect(result.fix).toContain("Check container state and routing: docker ps");
    }
  });

  it("handles other HTTP error codes (e.g. 400, 401, 403, 500)", () => {
    for (const status of [400, 401, 403, 500]) {
      const result = summarizeServiceProbes([
        answered("orders-api", 200),
        answered("auth-api", status),
      ]);
      expect(result.didPass).toBe(false);
      expect(result.message).toContain(`auth-api (HTTP ${status})`);
      expect(result.fix).toContain("Check container state and routing");
    }
  });

  it("formats detail for probe without status when another probe answered", () => {
    const result = summarizeServiceProbes([
      answered("orders-api", 200),
      refused("billing-api", "no response within 500ms"),
    ]);
    expect(result.didPass).toBe(false);
    expect(result.isSkipped).toBeUndefined();
    expect(result.message).toContain("billing-api (no response within 500ms)");
    expect(result.message).toContain("1 service not healthy (1/2 healthy)");
  });

  it("falls back to 'no response' when error property is missing", () => {
    const noErrorProbe: HealthProbe = {
      ...base,
      name: "silent-service",
      ok: false,
      status: undefined,
      error: undefined,
    };
    const result = summarizeServiceProbes([answered("orders-api", 200), noErrorProbe]);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("silent-service (no response)");
  });

  it("fails and counts healthy services when only some are healthy", () => {
    const result = summarizeServiceProbes([
      answered("orders-api", 200),
      answered("users-api", 404),
      refused("billing-api"),
    ]);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("2 services not healthy (1/3 healthy)");
    expect(result.message).toContain("users-api");
    expect(result.message).toContain("billing-api");
  });

  it("chooses the 404 fix when at least one failed probe is a 404", () => {
    const result = summarizeServiceProbes([
      answered("orders-api", 502),
      answered("catalog-api", 404),
    ]);
    expect(result.didPass).toBe(false);
    expect(result.fix).toContain(
      "If `flisk up` just started, images may still be building: re-run `flisk doctor` in a minute",
    );
  });

  it("chooses the routing/container fix when failed probes contain no 404s", () => {
    const result = summarizeServiceProbes([
      answered("orders-api", 502),
      answered("inventory-api", 500),
    ]);
    expect(result.didPass).toBe(false);
    expect(result.fix).toContain("Check container state and routing: docker ps");
  });

  it("passes when a single service answers 2xx with singular phrasing", () => {
    const result = summarizeServiceProbes([answered("orders-api", 200)]);
    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBeUndefined();
    expect(result.message).toBe("All 1 service responding on /health");
  });

  it("passes when multiple services answer 2xx with plural phrasing", () => {
    const result = summarizeServiceProbes([
      answered("orders-api", 200),
      answered("users-api", 204),
      answered("menu-api", 201),
    ]);
    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBeUndefined();
    expect(result.message).toBe("All 3 services responding on /health");
  });

  it("formats multiline URLs correctly in failure details", () => {
    const p1 = answered("service-a", 404, {
      url: "http://api.shop.localhost/api/service-a/health",
    });
    const p2 = answered("service-b", 502, {
      url: "http://api.shop.localhost/api/service-b/health",
    });
    const result = summarizeServiceProbes([p1, p2]);
    expect(result.message).toContain(
      "service-a (HTTP 404: Traefik is answering but has no route for this URL (container not started yet, or not running))\n      http://api.shop.localhost/api/service-a/health",
    );
    expect(result.message).toContain(
      "service-b (HTTP 502: Traefik found the route but the container isn't answering (still starting, or unhealthy))\n      http://api.shop.localhost/api/service-b/health",
    );
  });

  it("handles different appTypes like frontend, mcp, and agent", () => {
    const frontendProbe: HealthProbe = {
      name: "web-ui",
      appType: "frontend",
      url: "http://app.shop.localhost/health",
      ok: true,
      status: 200,
    };
    const mcpProbe: HealthProbe = {
      name: "mcp-server",
      appType: "mcp",
      url: "http://api.shop.localhost/mcp/health",
      ok: true,
      status: 200,
    };
    const agentProbe: HealthProbe = {
      name: "search-agent",
      appType: "agent",
      url: "http://api.shop.localhost/agent/health",
      ok: false,
      status: 503,
    };

    const result = summarizeServiceProbes([frontendProbe, mcpProbe, agentProbe]);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("1 service not healthy (2/3 healthy)");
    expect(result.message).toContain("search-agent");
  });
});
