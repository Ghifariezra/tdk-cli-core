// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import { STANDARD_PORTS } from "../constants.js";
import type { HostPortPlan } from "../host-port-plan.js";
import { buildServicePorts, buildStackPorts } from "../status-ports.js";

const resource = (
  name: string,
  appType: string,
  port?: number,
  configOverrides: Record<string, unknown> = {},
): DiscoveredResource =>
  ({
    name,
    path: "",
    configPath: "",
    port,
    config: { appName: name, appType, ...configOverrides },
  }) as never;

const plan = { ingressHttp: 8080, ingressHttps: 8443, postgres: 15432 } as HostPortPlan;

describe("buildServicePorts", () => {
  describe("routable services", () => {
    it("gives backend services an ingress url, container port, and null hostPort", () => {
      const ports = buildServicePorts(resource("orders-api", "backend", 4000), 8080);
      expect(ports.containerPort).toBe(4000);
      expect(ports.hostPort).toBeNull();
      expect(ports.directUrl).toBeNull();
      expect(ports.url).toMatch(/^http:\/\/.+:8080\/api\/orders$/);
    });

    it("gives frontend services an ingress url and null directUrl", () => {
      const ports = buildServicePorts(resource("storefront", "frontend", 3000), 8080);
      expect(ports.containerPort).toBe(3000);
      expect(ports.hostPort).toBeNull();
      expect(ports.directUrl).toBeNull();
      expect(ports.url).toMatch(/^http:\/\/.+:8080\/storefront$/);
    });

    it("routes mcp services under /api prefix like backends", () => {
      const ports = buildServicePorts(resource("docs-mcp", "mcp", 4005), 8080);
      expect(ports.containerPort).toBe(4005);
      expect(ports.directUrl).toBeNull();
      expect(ports.url).toMatch(/^http:\/\/.+:8080\/api\/docs-mcp$/);
    });

    it("routes agent services under /api prefix like backends", () => {
      const ports = buildServicePorts(resource("triage-agent", "agent", 4008), 8080);
      expect(ports.containerPort).toBe(4008);
      expect(ports.directUrl).toBeNull();
      expect(ports.url).toMatch(/^http:\/\/.+:8080\/api\/triage-agent$/);
    });

    it("respects custom apiPath for backend services", () => {
      const res = resource("orders", "backend", 4000, { apiPath: "/api/v2/orders" });
      const ports = buildServicePorts(res, 8080);
      expect(ports.url).toMatch(/\/api\/v2\/orders$/);
    });

    it("respects custom basePath for frontend services", () => {
      const res = resource("web", "frontend", 3000, { basePath: "/shop" });
      const ports = buildServicePorts(res, 8080);
      expect(ports.url).toMatch(/\/shop$/);
    });

    it("omits port from url when ingress port is standard 80", () => {
      const ports = buildServicePorts(resource("orders-api", "backend", 4000), 80);
      expect(ports.url).not.toContain(":80/");
      expect(ports.url).toMatch(/^http:\/\/[^:]+\/api\/orders$/);
    });
  });

  describe("container port resolution", () => {
    it("prefers resource.port over resource.config.port", () => {
      const res = resource("api", "backend", 4001, { port: 5000 });
      expect(buildServicePorts(res, 8080).containerPort).toBe(4001);
    });

    it("falls back to resource.config.port when resource.port is undefined", () => {
      const res = resource("api", "backend", undefined, { port: 5000 });
      expect(buildServicePorts(res, 8080).containerPort).toBe(5000);
    });

    it("reports null containerPort when both are undefined", () => {
      const res = resource("web", "frontend");
      expect(buildServicePorts(res, 8080).containerPort).toBeNull();
    });
  });

  describe("unrouted services", () => {
    it("gives unrouted worker with known port a direct loopback url and null url", () => {
      const ports = buildServicePorts(resource("jobs", "worker", 6000), 8080);
      expect(ports.url).toBeNull();
      expect(ports.directUrl).toBe("http://localhost:6000");
      expect(ports.containerPort).toBe(6000);
    });

    it("gives bring-your-own app with known port a direct loopback url and null url", () => {
      const ports = buildServicePorts(resource("sourcing-api", "bring-your-own", 4002), 8080);
      expect(ports.url).toBeNull();
      expect(ports.directUrl).toBe("http://localhost:4002");
      expect(ports.containerPort).toBe(4002);
    });

    it("gives migrator with known port a direct loopback url and null url", () => {
      const ports = buildServicePorts(resource("db-migrate", "migrator", 5433), 8080);
      expect(ports.url).toBeNull();
      expect(ports.directUrl).toBe("http://localhost:5433");
    });

    it("gives sdk and library with known port a direct loopback url and null url", () => {
      const sdkPorts = buildServicePorts(resource("client-sdk", "sdk", 3001), 8080);
      expect(sdkPorts.url).toBeNull();
      expect(sdkPorts.directUrl).toBe("http://localhost:3001");

      const libPorts = buildServicePorts(resource("common-lib", "library", 9000), 8080);
      expect(libPorts.url).toBeNull();
      expect(libPorts.directUrl).toBe("http://localhost:9000");
    });

    it("has null directUrl and null url for unrouted resource without a port", () => {
      const ports = buildServicePorts(resource("jobs", "worker"), 8080);
      expect(ports.url).toBeNull();
      expect(ports.directUrl).toBeNull();
      expect(ports.containerPort).toBeNull();
    });
  });
});

describe("buildStackPorts", () => {
  it("lists ingress, Tilt UI and Postgres with correct purpose strings", () => {
    const ports = buildStackPorts(plan, 10351);
    expect(ports).toEqual([
      { name: "ingress-http", hostPort: 8080, purpose: "Traefik HTTP ingress" },
      { name: "ingress-https", hostPort: 8443, purpose: "Traefik HTTPS ingress" },
      { name: "tilt-ui", hostPort: 10351, purpose: "Tilt UI" },
      { name: "postgres", hostPort: 15432, purpose: "Published Postgres" },
    ]);
  });

  it("uses custom host port values from host port plan", () => {
    const customPlan: HostPortPlan = {
      ingressHttp: 9000,
      ingressHttps: 9443,
      postgres: 5432,
    } as HostPortPlan;
    const ports = buildStackPorts(customPlan);
    expect(ports.find((p) => p.name === "ingress-http")?.hostPort).toBe(9000);
    expect(ports.find((p) => p.name === "ingress-https")?.hostPort).toBe(9443);
    expect(ports.find((p) => p.name === "postgres")?.hostPort).toBe(5432);
  });

  it("falls back to standard Tilt port when tiltPort is undefined", () => {
    const ports = buildStackPorts(plan, undefined);
    const tilt = ports.find((p) => p.name === "tilt-ui");
    expect(tilt?.hostPort).toBe(STANDARD_PORTS.tiltUi);
  });

  it("ignores invalid Tilt ports (0, negative, float, NaN, Infinity)", () => {
    const tilt = (value: number) => buildStackPorts(plan, value).find((p) => p.name === "tilt-ui");
    expect(tilt(0)?.hostPort).toBe(STANDARD_PORTS.tiltUi);
    expect(tilt(-1)?.hostPort).toBe(STANDARD_PORTS.tiltUi);
    expect(tilt(10350.7)?.hostPort).toBe(STANDARD_PORTS.tiltUi);
    expect(tilt(Number.NaN)?.hostPort).toBe(STANDARD_PORTS.tiltUi);
    expect(tilt(Number.POSITIVE_INFINITY)?.hostPort).toBe(STANDARD_PORTS.tiltUi);
  });

  it("falls back to Tilt UI alone when host port plan is null", () => {
    const ports = buildStackPorts(null, 10355);
    expect(ports).toEqual([{ name: "tilt-ui", hostPort: 10355, purpose: "Tilt UI" }]);
  });
});
