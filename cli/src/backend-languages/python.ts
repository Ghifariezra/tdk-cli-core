// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { BackendLanguageProvider } from "./types.js";

// ${PORT:-4000} is shell parameter expansion. Split so Biome does not read it
// as a JS template placeholder and the shell still receives the literal form.
export const PYTHON_DEV_COMMAND =
  "uvicorn main:app --app-dir src --host 0.0.0.0 --port $" +
  "{PORT:-4000} --reload --reload-dir src";

export const pythonBackendProvider: BackendLanguageProvider = {
  id: "python",
  label: "Python 3.12 + FastAPI",
  devCommand: PYTHON_DEV_COMMAND,
  watch: ["src/**/*"],
  installHint: 'pip install -e ".[dev]"   # optional: Docker builds the image for you',
  createFiles(name) {
    return [
      {
        filename: "pyproject.toml",
        content: `[project]
name = "${name}"
version = "0.0.1"
requires-python = ">=3.12"
dependencies = [
  "fastapi==0.115.6",
  "uvicorn[standard]==0.34.0",
]

[project.optional-dependencies]
dev = [
  "pytest==9.0.3",
  "httpx==0.28.1",
]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

# Only the dependencies are installed into the image; the source is synced for live reload.
[tool.setuptools]
py-modules = []

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
`,
        description: "Generating pyproject.toml",
        emoji: "📦",
      },
      {
        filename: "src/main.py",
        content: `import os

from fastapi import FastAPI

app = FastAPI(title="${name}")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "${name}"}


@app.get("/")
def root() -> dict[str, object]:
    return {"service": "${name}", "version": "1.0.0", "endpoints": ["/health"]}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "3000")))
`,
        description: "Generating backend source",
        emoji: "💻",
      },
      {
        filename: "tests/test_health.py",
        content: `from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "${name}"}


def test_root() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"service": "${name}", "version": "1.0.0", "endpoints": ["/health"]}
`,
        description: "Generating test file",
        emoji: "🧪",
      },
    ];
  },
};
