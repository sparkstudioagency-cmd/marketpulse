import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { expect, test } from "@playwright/test";

const repositoryRoot = path.resolve(__dirname, "..");
const restoreScript = path.join(
    repositoryRoot,
    "scripts",
    "restore-tshwane-checkpoint.sh"
);

let testSequence = 0;

function bashPath(): string {
    if (process.platform !== "win32") {
        return "/bin/bash";
    }

    const localAppData = process.env.LOCALAPPDATA;

    if (!localAppData) {
        throw new Error("LOCALAPPDATA is unavailable.");
    }

    return path.join(
        localAppData,
        "Programs",
        "Git",
        "bin",
        "bash.exe"
    );
}

function createHarness(): {
    fakeBin: string;
    logPath: string;
    workDirectory: string;
} {
    testSequence++;

    const harnessRoot = path.join(
        repositoryRoot,
        "test-results",
        "restore-tests",
        `${process.pid}-${testSequence}`
    );
    const fakeBin = path.join(harnessRoot, "bin");
    const workDirectory = path.join(harnessRoot, "work");
    const logPath = path.join(harnessRoot, "gh.log");

    fs.mkdirSync(fakeBin, { recursive: true });
    fs.mkdirSync(workDirectory, { recursive: true });

    const fakeGhPath = path.join(fakeBin, "gh");

    fs.writeFileSync(
        fakeGhPath,
        `#!/usr/bin/env bash
set -euo pipefail

echo "$*" >> "$FAKE_GH_LOG"

if [[ "$1" == "api" ]]; then
    if [[ " $* " == *" --slurp "* || " $* " == *" --paginate "* ]]; then
        echo "unsupported pagination flag" >&2
        exit 19
    fi

    if [[ "$FAKE_SCENARIO" == "api-failure" ]]; then
        echo "mock API failure" >&2
        exit 20
    fi

    arguments="$*"

    if [[ "$arguments" == *"actions/workflows/tshwane-collection.yml/runs"* ]]; then
        printf '%s\\n' "$GITHUB_RUN_ID" 300 200
        exit 0
    fi

    if [[ "$FAKE_SCENARIO" == "none" ]]; then
        exit 0
    fi

    if [[ "$arguments" == *"actions/runs/300/artifacts"* ]]; then
        printf 'tshwane-recovery-300-1\\t3001\\n'
        exit 0
    fi

    if [[ "$arguments" == *"actions/runs/200/artifacts"* ]]; then
        printf 'tshwane-recovery-200-1\\t2001\\n'
        exit 0
    fi

    exit 0
fi

if [[ "$1" == "run" && "$2" == "download" ]]; then
    run_id="$3"
    shift 3
    destination=""

    while (( $# > 0 )); do
        if [[ "$1" == "--dir" ]]; then
            destination="$2"
            shift 2
        else
            shift
        fi
    done

    if [[ "$FAKE_SCENARIO" == "download-failure" ]]; then
        echo "mock download failure" >&2
        exit 21
    fi

    mkdir -p "$destination/scraper-output"
    mkdir -p "$destination/processed-output"

    if [[ "$FAKE_SCENARIO" == "fallback" && "$run_id" == "300" ]]; then
        printf '{}\\n' > "$destination/scraper-output/tshwane-run-status-2026-08-01.json"
        exit 0
    fi

    printf '{"checkpoint":%s}\\n' "$run_id" > "$destination/scraper-output/tshwane-checkpoint-2026-08-01.json"
    printf '{}\\n' > "$destination/scraper-output/tshwane-run-status-2026-08-01.json"
    printf '{}\\n' > "$destination/scraper-output/tshwane-publication-date.json"
    printf '{}\\n' > "$destination/processed-output/tshwane-clean-2026-08-01.json"
    exit 0
fi

echo "Unexpected gh invocation: $*" >&2
exit 22
`,
        "utf8"
    );
    fs.chmodSync(fakeGhPath, 0o755);

    return {
        fakeBin,
        logPath,
        workDirectory
    };
}

function runRestore(
    scenario: string,
    includeRequiredEnvironment = true
): ReturnType<typeof spawnSync> & {
    harness: ReturnType<typeof createHarness>;
} {
    const harness = createHarness();
    const environment: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${harness.fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_GH_LOG: harness.logPath,
        FAKE_SCENARIO: scenario,
        GH_TOKEN: "test-token"
    };

    if (includeRequiredEnvironment) {
        environment.GITHUB_REPOSITORY = "example/marketpulse";
        environment.GITHUB_RUN_ID = "999";
    } else {
        delete environment.GITHUB_REPOSITORY;
        delete environment.GITHUB_RUN_ID;
    }

    return Object.assign(
        spawnSync(
            bashPath(),
            [restoreScript],
            {
                cwd: harness.workDirectory,
                encoding: "utf8",
                env: environment
            }
        ),
        { harness }
    );
}

test("restores only checkpoint files from the newest artifact", () => {
    const result = runRestore("usable");
    const outputDirectory = path.join(
        result.harness.workDirectory,
        "scraper-output"
    );

    expect(result.status).toBe(0);
    expect(fs.readdirSync(outputDirectory)).toEqual([
        "tshwane-checkpoint-2026-08-01.json"
    ]);
    expect(fs.readFileSync(
        path.join(
            outputDirectory,
            "tshwane-checkpoint-2026-08-01.json"
        ),
        "utf8"
    )).toContain("300");

    const log = fs.readFileSync(
        result.harness.logPath,
        "utf8"
    );
    expect(log).not.toContain("actions/runs/999/artifacts");
    expect(log).not.toContain("actions/runs/200/artifacts");
});

test("continues to an older artifact when the newest has no checkpoint", () => {
    const result = runRestore("fallback");
    const restoredPath = path.join(
        result.harness.workDirectory,
        "scraper-output",
        "tshwane-checkpoint-2026-08-01.json"
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(restoredPath, "utf8"))
        .toContain("200");
    expect(result.stdout).toContain(
        "checking older artifacts"
    );
});

test("no artifact is a successful fresh-run condition", () => {
    const result = runRestore("none");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
        "No previous usable Tshwane checkpoint artifact"
    );
    expect(fs.existsSync(path.join(
        result.harness.workDirectory,
        "scraper-output"
    ))).toBe(false);
});

test("API and download failures fail the restore", () => {
    for (const scenario of [
        "api-failure",
        "download-failure"
    ]) {
        const result = runRestore(scenario);

        expect(result.status).not.toBe(0);
    }
});

test("required GitHub environment variables are enforced", () => {
    const result = runRestore("none", false);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
        "GITHUB_REPOSITORY is required"
    );
    expect(fs.existsSync(result.harness.logPath)).toBe(false);
});

test("script filters expired and non-recovery artifacts in its API query", () => {
    const source = fs.readFileSync(
        restoreScript,
        "utf8"
    );

    expect(source).toContain(".expired == false");
    expect(source).toContain(
        'startswith("tshwane-recovery-")'
    );
    expect(source).toContain(
        "tshwane-checkpoint-*.json"
    );
    expect(source).not.toContain("--slurp");
    expect(source).not.toContain("--paginate");
    expect(source).toContain("[.workflow_runs[]]");
    expect(source).toContain(".artifacts[]");
});
