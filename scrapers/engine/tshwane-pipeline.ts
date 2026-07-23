import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface PipelineOptions {
    commit: boolean;
    skipScrape: boolean;
}

interface CleanRecord {
    marketDate?: unknown;
    isCorrection?: unknown;
}

interface VerificationExpectations {
    marketDate: string;
    expectedDailyPriceRows: number;
    expectedCorrectionRows: number;
}

function parseArguments(): PipelineOptions {
    return {
        commit: process.argv.includes("--commit"),
        skipScrape: process.argv.includes("--skip-scrape")
    };
}

function getTsxCliPath(): string {
    const tsxCliPath =
        path.join(
            process.cwd(),
            "node_modules",
            "tsx",
            "dist",
            "cli.mjs"
        );

    if (!fs.existsSync(tsxCliPath)) {
        throw new Error(
            `Local tsx CLI was not found: ${tsxCliPath}. ` +
            "Run npm install before using the pipeline."
        );
    }

    return tsxCliPath;
}

function runCommand(
    command: string,
    args: string[]
): Promise<void> {
    return new Promise(
        (
            resolve,
            reject
        ): void => {
            const child =
                spawn(
                    command,
                    args,
                    {
                        stdio: "inherit",
                        shell: false
                    }
                );

            child.on(
                "error",
                (error: Error): void => {
                    reject(
                        new Error(
                            `Could not start command "${command}": ` +
                            `${error.message}`
                        )
                    );
                }
            );

            child.on(
                "exit",
                (
                    code: number | null,
                    signal: NodeJS.Signals | null
                ): void => {
                    if (signal) {
                        reject(
                            new Error(
                                `Command stopped by signal ${signal}.`
                            )
                        );

                        return;
                    }

                    if (code !== 0) {
                        reject(
                            new Error(
                                `Command failed with exit code ${code}.`
                            )
                        );

                        return;
                    }

                    resolve();
                }
            );
        }
    );
}

function findNewestCleanJson(): string {
    const outputDirectory =
        path.join(
            process.cwd(),
            "processed-output"
        );

    if (
        !fs.existsSync(
            outputDirectory
        )
    ) {
        throw new Error(
            `Processed output directory not found: ` +
            `${outputDirectory}`
        );
    }

    const matchingFiles =
        fs.readdirSync(
            outputDirectory,
            {
                withFileTypes: true
            }
        )
            .filter(
                (
                    entry: fs.Dirent
                ): boolean =>
                    entry.isFile() &&
                    /^tshwane-clean-\d{4}-\d{2}-\d{2}\.json$/.test(
                        entry.name
                    )
            )
            .map(
                (
                    entry: fs.Dirent
                ): {
                    filePath: string;
                    modifiedTime: number;
                } => {
                    const filePath =
                        path.join(
                            outputDirectory,
                            entry.name
                        );

                    return {
                        filePath,
                        modifiedTime:
                            fs.statSync(
                                filePath
                            ).mtimeMs
                    };
                }
            )
            .sort(
                (
                    first,
                    second
                ): number =>
                    second.modifiedTime -
                    first.modifiedTime
            );

    const newestFile =
        matchingFiles[0];

    if (!newestFile) {
        throw new Error(
            "No Tshwane clean JSON file was found."
        );
    }

    return newestFile.filePath;
}

function getVerificationExpectations(
    cleanJsonPath: string
): VerificationExpectations {
    const rawJson =
        fs.readFileSync(
            cleanJsonPath,
            "utf8"
        );

    let parsedJson: unknown;

    try {
        parsedJson =
            JSON.parse(rawJson);
    } catch (error) {
        throw new Error(
            `Could not parse clean JSON file: ${cleanJsonPath}`,
            {
                cause: error
            }
        );
    }

    if (!Array.isArray(parsedJson)) {
        throw new Error(
            "Clean Tshwane JSON must contain a top-level array."
        );
    }

    if (parsedJson.length === 0) {
        throw new Error(
            "Clean Tshwane JSON contains no records."
        );
    }

    const records =
        parsedJson as CleanRecord[];

    const firstMarketDate =
        records[0]?.marketDate;

    if (
        typeof firstMarketDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(
            firstMarketDate
        )
    ) {
        throw new Error(
            "The first clean record does not contain a valid marketDate."
        );
    }

    for (
        let index = 0;
        index < records.length;
        index += 1
    ) {
        const record =
            records[index];

        if (
            record?.marketDate !==
            firstMarketDate
        ) {
            throw new Error(
                `Clean JSON contains inconsistent market dates. ` +
                `Record ${index + 1} has marketDate ` +
                `"${String(record?.marketDate)}" instead of ` +
                `"${firstMarketDate}".`
            );
        }
    }

    const expectedCorrectionRows =
        records.filter(
            (
                record: CleanRecord
            ): boolean =>
                record.isCorrection === true
        ).length;

    return {
        marketDate:
            firstMarketDate,
        expectedDailyPriceRows:
            records.length,
        expectedCorrectionRows
    };
}

async function runPipeline(): Promise<void> {
    const options =
        parseArguments();

    const nodeCommand =
        process.execPath;

    const tsxCliPath =
        getTsxCliPath();

    console.log("");
    console.log(
        "================================"
    );
    console.log(
        "MARKETPULSE TSHWANE PIPELINE"
    );
    console.log(
        "================================"
    );

    console.log("");
    console.log(
        options.commit
            ? "Mode: DATABASE COMMIT"
            : "Mode: DRY RUN"
    );

    if (options.skipScrape) {
        console.log(
            "Scraper stage: SKIPPED"
        );
    } else {
        console.log("");
        console.log(
            "Stage 1: Running Tshwane scraper..."
        );

        await runCommand(
            nodeCommand,
            [
                tsxCliPath,
                "scrapers/markets/tshwane.ts"
            ]
        );

        console.log("");
        console.log(
            "Stage 1 completed successfully."
        );
    }

    const cleanJsonPath =
        findNewestCleanJson();

    console.log("");
    console.log(
        `Clean JSON selected: ${cleanJsonPath}`
    );

    const verificationExpectations =
        getVerificationExpectations(
            cleanJsonPath
        );

    console.log("");
    console.log(
        "Clean file expectations:"
    );
    console.log(
        `Market date:          ` +
        `${verificationExpectations.marketDate}`
    );
    console.log(
        `Daily price rows:     ` +
        `${verificationExpectations.expectedDailyPriceRows}`
    );
    console.log(
        `Correction rows:      ` +
        `${verificationExpectations.expectedCorrectionRows}`
    );

    console.log("");
    console.log(
        options.commit
            ? "Stage 2: Importing into Supabase..."
            : "Stage 2: Running Supabase dry-run..."
    );

    const importerArguments: string[] = [
        tsxCliPath,
        "scrapers/engine/supabase-importer.ts",
        cleanJsonPath
    ];

    if (options.commit) {
        importerArguments.push(
            "--commit"
        );
    }

    await runCommand(
        nodeCommand,
        importerArguments
    );

    if (options.commit) {
        console.log("");
        console.log(
            "Stage 3: Verifying database import..."
        );

        await runCommand(
            nodeCommand,
            [
                tsxCliPath,
                "scrapers/engine/verify-tshwane.ts",
                verificationExpectations.marketDate,
                String(
                    verificationExpectations
                        .expectedDailyPriceRows
                ),
                String(
                    verificationExpectations
                        .expectedCorrectionRows
                )
            ]
        );

        console.log("");
        console.log(
            "Stage 3 completed successfully."
        );
    }

    console.log("");
    console.log(
        "================================"
    );
    console.log(
        options.commit
            ? "PIPELINE AND DATABASE IMPORT VERIFIED"
            : "PIPELINE DRY-RUN COMPLETED"
    );
    console.log(
        "================================"
    );
}

void runPipeline().catch(
    (
        error: unknown
    ): void => {
        console.error("");
        console.error(
            "================================"
        );
        console.error(
            "PIPELINE FAILED"
        );
        console.error(
            "================================"
        );

        console.error(error);

        process.exitCode = 1;
    }
);