// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isHostPortAvailable } from "../host-port-plan.js";
import { hasLocalListener } from "../port-listener-probe.js";

const { connectMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
}));

vi.mock("node:net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:net")>();
  return {
    ...actual,
    connect: vi.fn((options: unknown, ...args: unknown[]) => {
      const impl = connectMock.getMockImplementation();
      if (impl) {
        return impl(options, ...args);
      }
      return (actual.connect as (...a: unknown[]) => unknown)(options, ...args);
    }),
  };
});

class FakeSocket extends EventEmitter {
  timeoutMs?: number;
  timeoutHandler?: () => void;
  destroyed = false;

  setTimeout(ms: number, handler: () => void): this {
    this.timeoutMs = ms;
    this.timeoutHandler = handler;
    return this;
  }

  destroy(): this {
    this.destroyed = true;
    return this;
  }
}

const servers: Server[] = [];

function listen(host: string): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer((socket) => socket.end());
    servers.push(server);
    server.listen(0, host, () => resolve((server.address() as { port: number }).port));
  });
}

afterEach(async () => {
  connectMock.mockReset();
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

describe("hasLocalListener", () => {
  describe("real socket probing", () => {
    it("sees a process listening on every interface", async () => {
      const port = await listen("0.0.0.0");
      expect(await hasLocalListener(port)).toBe(true);
      expect(await isHostPortAvailable(port)).toBe(false);
    });

    it("sees a process listening on loopback", async () => {
      const port = await listen("127.0.0.1");
      expect(await hasLocalListener(port)).toBe(true);
      expect(await isHostPortAvailable(port)).toBe(false);
    });

    it("reports a port nobody listens on as free", async () => {
      const port = await listen("127.0.0.1");
      await Promise.all(
        servers.splice(0).map((server) => new Promise((done) => server.close(done))),
      );
      expect(await hasLocalListener(port)).toBe(false);
      expect(await isHostPortAvailable(port)).toBe(true);
    });

    it("detects multiple occupied ports simultaneously", async () => {
      const port1 = await listen("127.0.0.1");
      const port2 = await listen("127.0.0.1");
      expect(await hasLocalListener(port1)).toBe(true);
      expect(await hasLocalListener(port2)).toBe(true);
    });

    it("detects occupied port released after close", async () => {
      const server = createServer((socket) => socket.end());
      servers.push(server);
      const port = await new Promise<number>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
      });

      expect(await hasLocalListener(port)).toBe(true);

      await new Promise((done) => server.close(done));
      const index = servers.indexOf(server);
      if (index !== -1) servers.splice(index, 1);

      expect(await hasLocalListener(port)).toBe(false);
    });
  });

  describe("mock network state", () => {
    it("returns true and destroys socket when connection succeeds", async () => {
      let createdSocket: FakeSocket | undefined;
      connectMock.mockImplementation((options: { port: number; host: string }) => {
        expect(options).toEqual({ port: 5432, host: "127.0.0.1" });
        createdSocket = new FakeSocket();
        queueMicrotask(() => createdSocket?.emit("connect"));
        return createdSocket;
      });

      const result = await hasLocalListener(5432);
      expect(result).toBe(true);
      expect(createdSocket?.destroyed).toBe(true);
      expect(createdSocket?.timeoutMs).toBe(500);
    });

    it("returns false and destroys socket when connection is refused or errors", async () => {
      let createdSocket: FakeSocket | undefined;
      connectMock.mockImplementation((options: { port: number; host: string }) => {
        expect(options).toEqual({ port: 8080, host: "127.0.0.1" });
        createdSocket = new FakeSocket();
        queueMicrotask(() => createdSocket?.emit("error", new Error("ECONNREFUSED")));
        return createdSocket;
      });

      const result = await hasLocalListener(8080);
      expect(result).toBe(false);
      expect(createdSocket?.destroyed).toBe(true);
    });

    it("returns false and destroys socket when connection times out", async () => {
      let createdSocket: FakeSocket | undefined;
      connectMock.mockImplementation(() => {
        createdSocket = new FakeSocket();
        queueMicrotask(() => createdSocket?.timeoutHandler?.());
        return createdSocket;
      });

      const result = await hasLocalListener(9000);
      expect(result).toBe(false);
      expect(createdSocket?.destroyed).toBe(true);
    });

    it("respects custom timeout parameter", async () => {
      let createdSocket: FakeSocket | undefined;
      connectMock.mockImplementation(() => {
        createdSocket = new FakeSocket();
        queueMicrotask(() => createdSocket?.timeoutHandler?.());
        return createdSocket;
      });

      await hasLocalListener(3000, 1500);
      expect(createdSocket?.timeoutMs).toBe(1500);
    });

    it("handles multiple sequential probes with different outcomes", async () => {
      const outcomes = [true, false, true];
      let callCount = 0;

      connectMock.mockImplementation(() => {
        const socket = new FakeSocket();
        const success = outcomes[callCount++];
        queueMicrotask(() => {
          if (success) {
            socket.emit("connect");
          } else {
            socket.emit("error", new Error("ECONNRESET"));
          }
        });
        return socket;
      });

      expect(await hasLocalListener(8001)).toBe(true);
      expect(await hasLocalListener(8002)).toBe(false);
      expect(await hasLocalListener(8003)).toBe(true);
    });
  });
});
