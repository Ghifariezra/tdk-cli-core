## ADDED Requirements

### Requirement: One scaffolder, many templates

A single npm package SHALL provide a `create` command that copies one template into a project and registers it. Templates are chosen with `--template <id>`. The package SHALL NOT bundle twelve separate packages. The package name is decided in the design (Decision 3) and recorded in the registry as `scaffolder.package`; this spec refers to it as the scaffolder.

#### Scenario: Template by flag

- **WHEN** a user runs `npm create <scaffolder>@latest -- --template vue`
- **THEN** the template's `Dockerfile` and `README.md` are written into a new resource directory
- **AND** the command prints the `flisk resource` command it ran

#### Scenario: Unknown template

- **WHEN** a user passes `--template nope`
- **THEN** the command exits non-zero before writing any file
- **AND** the error lists the available template ids

### Requirement: Interactive picker

When run in a terminal without `--template`, the scaffolder SHALL show a picker with each template's id, label and stack. The default selection SHALL be the first template in registry order. When no terminal is attached and `--template` is absent, it SHALL exit non-zero and print the `--list` output instead of guessing.

#### Scenario: Picker in a terminal

- **WHEN** a user runs the scaffolder in a terminal with no arguments
- **THEN** a list of the twelve templates is shown
- **AND** choosing `astro` behaves like `--template astro`

#### Scenario: No terminal, no flag

- **WHEN** the scaffolder runs in CI without `--template`
- **THEN** it exits non-zero and prints the available ids
- **AND** writes no files

### Requirement: List and inspect

`--list` SHALL print one row per template: `id`, `label`, `port`, `healthPath`, `upstream`, tab separated, in registry order, and exit 0. `--show <id>` SHALL print that template's `template.json` and its repository URL. Both SHALL work without network access to the template repositories by reading the registry shipped in the package.

#### Scenario: List output

- **WHEN** a user runs `--list`
- **THEN** the output has twelve rows
- **AND** each row has five tab-separated fields

#### Scenario: Show one template

- **WHEN** a user runs `--show hono`
- **THEN** the output includes `"id": "hono"` and `https://github.com/flisk-sh/flisk-template-hono`

### Requirement: Template source and pinning

The scaffolder SHALL fetch the template files for a release from the package itself or from the pinned tag of the template repository, never from a branch. Each scaffolder release SHALL embed the registry (ids and pinned tags) it was published with. `--ref <tag>` MAY override the tag. An override SHALL print a warning that the version is not the tested one.

#### Scenario: Default is the pinned tag

- **WHEN** the scaffolder is run with no `--ref`
- **THEN** the files come from the tag embedded in that scaffolder release

#### Scenario: Override warns

- **WHEN** `--ref v9.9.9` is passed
- **THEN** the command prints a warning naming the pinned tag and the override
- **AND** continues if the tag exists

### Requirement: Registers through the Flisk CLI

After writing files, the scaffolder SHALL run the `flisk resource <name> --type bring-your-own --dockerfile ./Dockerfile --stack <stack> --yes` command through the installed `flisk` binary. It SHALL NOT write `service.json`, Compose, Tilt or Traefik files itself. When `flisk` is not installed, it SHALL write the template files only, print the exact command to run later, and exit 0 with a notice, not an error.

#### Scenario: Flisk is installed

- **WHEN** `flisk` is on `PATH` and the scaffolder runs for `vue`
- **THEN** `flisk resource` is invoked with `--type bring-your-own` and the template's `Dockerfile`
- **AND** the generated `service.json` is produced by Flisk, not the scaffolder

#### Scenario: Flisk is missing

- **WHEN** `flisk` is not on `PATH`
- **THEN** the template files are still written
- **AND** the output prints the install command and the `flisk resource` command to run next
- **AND** the exit code is 0

#### Scenario: Registration fails

- **WHEN** `flisk resource` exits non-zero
- **THEN** the scaffolder exits non-zero with the same message
- **AND** the files it wrote are left in place so the user can retry by hand

### Requirement: Resource naming

The resource name SHALL come from `--name`, or the positional argument, or a default of `<id>-app`. A resource name SHALL be validated against the same rule `flisk resource` uses and SHALL fail before writing files when invalid. The scaffolder SHALL print a reminder that resource names must be unique across projects that share one Docker daemon.

#### Scenario: Default name

- **WHEN** the scaffolder runs for `vue` without a name
- **THEN** the resource is named `vue-app`

#### Scenario: Invalid name

- **WHEN** the name is `My App!`
- **THEN** the command exits non-zero before writing any file

### Requirement: No overwrite without consent

The scaffolder SHALL refuse to write into a directory that already contains a `Dockerfile` unless `--force` is passed, and SHALL never delete files. `--dry-run` SHALL print every path it would write and the command it would run, and write nothing.

#### Scenario: Existing Dockerfile

- **WHEN** the target directory already has a `Dockerfile`
- **THEN** the command exits non-zero and names the file

#### Scenario: Dry run

- **WHEN** `--dry-run` is passed
- **THEN** the output lists the files and the `flisk resource` command
- **AND** no file is created

### Requirement: Safe by default

The scaffolder SHALL NOT run template-provided scripts, execute a `Dockerfile`, build an image or start a container. It SHALL only copy files and invoke `flisk resource`. It SHALL NOT read environment variables other than documented ones (`NO_COLOR`, `CI`, `FLISK_TEMPLATE_REF`, `HTTPS_PROXY`). It SHALL NOT send telemetry.

#### Scenario: No execution

- **WHEN** a template contains a `postinstall` script in a file it copies
- **THEN** the scaffolder does not run it

#### Scenario: No telemetry

- **WHEN** the scaffolder runs
- **THEN** its only network requests are to fetch the pinned template archive from the template repository

### Requirement: Path safety

When extracting a template, the scaffolder SHALL reject any archive entry whose resolved path leaves the target directory (absolute paths, `..` segments, symbolic links to outside paths) and SHALL abort without writing partial output.

#### Scenario: Traversal entry

- **WHEN** a template archive contains `../../.ssh/config`
- **THEN** the scaffolder aborts and writes nothing outside the target

### Requirement: Output contract

Success output SHALL name the directory written, the resource name, the template tag, and the next command (`flisk up <stack>`). `--json` SHALL print one JSON object with `template`, `tag`, `directory`, `resource`, `registered` and `next`, and nothing else on stdout. Errors SHALL go to stderr with a non-zero exit code.

#### Scenario: JSON output

- **WHEN** `--json` is passed and the run succeeds
- **THEN** stdout is one parseable JSON object with the six fields

#### Scenario: Error to stderr

- **WHEN** the template is unknown
- **THEN** stdout is empty and stderr has the message

### Requirement: Node and platform support

The scaffolder SHALL run on the Node.js versions the Flisk CLI supports and on macOS, Linux and Windows (including WSL2). It SHALL have no runtime dependency that needs a native build.

#### Scenario: Windows path

- **WHEN** it runs on Windows with a target `C:\work\shop`
- **THEN** files are written with correct separators and the `flisk resource` command receives a valid path

### Requirement: Works through npx and bun

`npm create`, `npx` and `bunx` invocations SHALL behave the same. The package SHALL set `bin` so `npm create <scaffolder>` resolves the `create-` prefixed name.

#### Scenario: bunx

- **WHEN** a user runs `bunx <scaffolder> --list`
- **THEN** the same twelve rows are printed

### Requirement: Registry parity with the monorepo

The registry embedded in a scaffolder release SHALL equal `examples/byo/templates.json` at the commit the release was built from. The release workflow SHALL fail when they differ.

#### Scenario: Drift blocks release

- **WHEN** the embedded registry lists a tag the monorepo registry does not
- **THEN** the release workflow fails before publishing
