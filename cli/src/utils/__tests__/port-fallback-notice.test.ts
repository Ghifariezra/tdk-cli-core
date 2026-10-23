// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createDoctorReport } from "../doctor-report.js";
import { createHostPortPlan, type HostPortPlan } from "../host-port-plan.js";
import { formatPortFallbackNotice } from "../port-fallback-notice.js";

const free = async () => true;
// Ports 80 and 443 are tried first; mark them busy to exercise the fallback range.
const privilegedBusy = async (port: number) => port !== 80 && port !== 443;

function createSyntheticPlan(overrides: Partial<HostPortPlan> = {}): HostPortPlan {
  return {
    ingressHttp: 80,
    ingressHttps: 443,
    postgres: 5432,
    requested: { ingressHttp: 80, ingressHttps: 443, postgres: 5432 },
    explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
    reason: {
      ingressHttp: "default port",
      ingressHttps: "default port",
      postgres: "default port",
    },
    ...overrides,
  };
}

describe("formatPortFallbackNotice", () => {
  describe("unit tests with synthetic plans", () => {
    it("returns empty array when all chosen ports match requested ports", () => {
      const plan = createSyntheticPlan();
      expect(formatPortFallbackNotice(plan)).toEqual([]);
    });

    it("returns empty array when all ports are marked explicit, even if chosen differs", () => {
      const plan = createSyntheticPlan({
        ingressHttp: 8080,
        ingressHttps: 8443,
        postgres: 15432,
        explicit: { ingressHttp: true, ingressHttps: true, postgres: true },
        reason: {
          ingressHttp: "explicit",
          ingressHttps: "explicit",
          postgres: "explicit",
        },
      });
      expect(formatPortFallbackNotice(plan)).toEqual([]);
    });

    it("formats notice for HTTP fallback with TDK_HTTP_PORT and flisk up instruction", () => {
      const plan = createSyntheticPlan({
        ingressHttp: 8081,
        reason: {
          ingressHttp: "selected from fallback range 8080-8180",
          ingressHttps: "default port",
          postgres: "default port",
        },
      });
      expect(formatPortFallbackNotice(plan)).toEqual([
        "HTTP: wanted 80, using 8081 (selected from fallback range 8080-8180). To force 80: TDK_HTTP_PORT=80 flisk up",
      ]);
    });

    it("formats notice for HTTPS fallback with TDK_HTTPS_PORT and flisk up instruction", () => {
      const plan = createSyntheticPlan({
        ingressHttps: 8443,
        reason: {
          ingressHttp: "default port",
          ingressHttps: "selected from fallback range 8443-8543",
          postgres: "default port",
        },
      });
      expect(formatPortFallbackNotice(plan)).toEqual([
        "HTTPS: wanted 443, using 8443 (selected from fallback range 8443-8543). To force 443: TDK_HTTPS_PORT=443 flisk up",
      ]);
    });

    it("formats notice for Postgres fallback with TDK_POSTGRES_PORT and flisk up instruction", () => {
      const plan = createSyntheticPlan({
        postgres: 15432,
        reason: {
          ingressHttp: "default port",
          ingressHttps: "default port",
          postgres: "selected from fallback range 15432-15532",
        },
      });
      expect(formatPortFallbackNotice(plan)).toEqual([
        "Postgres: wanted 5432, using 15432 (selected from fallback range 15432-15532). To force 5432: TDK_POSTGRES_PORT=5432 flisk up",
      ]);
    });

    it("preserves fixed ordering: HTTP, HTTPS, Postgres when all ports fall back", () => {
      const plan = createSyntheticPlan({
        ingressHttp: 8080,
        ingressHttps: 8443,
        postgres: 15432,
        reason: {
          ingressHttp: "busy 80",
          ingressHttps: "busy 443",
          postgres: "busy 5432",
        },
      });
      const lines = formatPortFallbackNotice(plan);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatch(/^HTTP:/);
      expect(lines[1]).toMatch(/^HTTPS:/);
      expect(lines[2]).toMatch(/^Postgres:/);
    });

    it("omits explicit HTTP but includes non-explicit HTTPS and Postgres fallbacks", () => {
      const plan = createSyntheticPlan({
        ingressHttp: 8080,
        ingressHttps: 8443,
        postgres: 15432,
        explicit: { ingressHttp: true, ingressHttps: false, postgres: false },
        reason: {
          ingressHttp: "user explicit",
          ingressHttps: "busy 443",
          postgres: "busy 5432",
        },
      });
      const lines = formatPortFallbackNotice(plan);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^HTTPS:/);
      expect(lines[1]).toMatch(/^Postgres:/);
    });

    it("omits explicit Postgres but includes non-explicit HTTP and HTTPS fallbacks", () => {
      const plan = createSyntheticPlan({
        ingressHttp: 8080,
        ingressHttps: 8443,
        postgres: 15432,
        explicit: { ingressHttp: false, ingressHttps: false, postgres: true },
        reason: {
          ingressHttp: "busy 80",
          ingressHttps: "busy 443",
          postgres: "user explicit",
        },
      });
      const lines = formatPortFallbackNotice(plan);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^HTTP:/);
      expect(lines[1]).toMatch(/^HTTPS:/);
    });

    it("formats custom reason text and non-standard port numbers", () => {
      const plan = createSyntheticPlan({
        requested: { ingressHttp: 3000, ingressHttps: 3443, postgres: 7000 },
        ingressHttp: 3001,
        ingressHttps: 3443,
        postgres: 7000,
        reason: {
          ingressHttp: "port occupied by local development server",
          ingressHttps: "default port",
          postgres: "default port",
        },
      });
      expect(formatPortFallbackNotice(plan)).toEqual([
        "HTTP: wanted 3000, using 3001 (port occupied by local development server). To force 3000: TDK_HTTP_PORT=3000 flisk up",
      ]);
    });
  });

  describe("integration with createHostPortPlan", () => {
    it("names the requested port, the chosen port and the env var that forces it", async () => {
      const plan = await createHostPortPlan({
        env: {},
        isAvailable: async (port) => (await privilegedBusy(port)) && port !== 8080,
      });
      const http = formatPortFallbackNotice(plan).find((line) => line.startsWith("HTTP:"));
      expect(http).toBe(
        "HTTP: wanted 80, using 8081 (selected from fallback range 8080-8180). To force 80: TDK_HTTP_PORT=80 flisk up",
      );
    });

    it("reports the same chosen port that doctor --json reports", async () => {
      const plan = await createHostPortPlan({
        env: {},
        isAvailable: async (port) => (await privilegedBusy(port)) && port !== 8080,
      });
      const doctor = createDoctorReport([], true, [], plan);
      expect(doctor.data.ports?.http.chosen).toBe(8081);
      expect(formatPortFallbackNotice(plan).join("\n")).toContain("using 8081");
    });

    it("lists every port that moved", async () => {
      const plan = await createHostPortPlan({ env: {}, isAvailable: privilegedBusy });
      expect(formatPortFallbackNotice(plan).map((line) => line.split(":")[0])).toEqual([
        "HTTP",
        "HTTPS",
        "Postgres",
      ]);
    });

    it("stays silent for ports the user set explicitly", async () => {
      const plan = await createHostPortPlan({
        env: { TDK_HTTP_PORT: "9000", TDK_HTTPS_PORT: "9443", TDK_POSTGRES_PORT: "9432" },
        isAvailable: free,
      });
      expect(formatPortFallbackNotice(plan)).toEqual([]);
    });

    it("lists only Postgres when ports 80 and 443 are free", async () => {
      const plan = await createHostPortPlan({ env: {}, isAvailable: free });
      expect(formatPortFallbackNotice(plan).map((line) => line.split(":")[0])).toEqual([
        "Postgres",
      ]);
    });

    it("stays silent when the requested port was available and chosen", async () => {
      const plan = await createHostPortPlan({
        env: {},
        isAvailable: free,
        ranges: {
          ingressHttp: { start: 80, end: 80 },
          ingressHttps: { start: 443, end: 443 },
          postgres: { start: 5432, end: 5432 },
        },
      });
      expect(formatPortFallbackNotice(plan)).toEqual([]);
    });

    it("suppresses notice for postgres when TDK_POSTGRES_PORT is explicitly set", async () => {
      const plan = await createHostPortPlan({
        env: { TDK_POSTGRES_PORT: "5432" },
        isAvailable: privilegedBusy,
      });
      const lines = formatPortFallbackNotice(plan);
      expect(lines.map((l) => l.split(":")[0])).toEqual(["HTTP", "HTTPS"]);
    });
  });
});
