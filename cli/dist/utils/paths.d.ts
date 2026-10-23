/**
 * Find the nearest enclosing Flisk project root by walking up from `startDir` until a
 * `.tdk/project.json` marker is found. Stops at the filesystem root without treating the
 * root itself as a project.
 * @param startDir - Directory to start searching from (default: cwd)
 * @returns Absolute path of the project root, or null if no `.tdk/project.json` exists on any parent
 */
export declare function findProjectRoot(startDir?: string): string | null;
/**
 * Return the CLI's own package version from the bundled `package.json`, cached after the
 * first read (the JSON import is resolved at compile time by Bun, so this never touches
 * the filesystem at runtime).
 * @returns The version string of the CLI package
 */
export declare function getPackageVersion(): string;
