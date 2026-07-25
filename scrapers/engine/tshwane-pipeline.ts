import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const NO_NEW_DATA_EXIT_CODE =
    10;

const RETRY_REQUIRED_EXIT_CODE =
    11;

type PublicationDecision =
    "NEW_DATA" |
    "NO_NEW_DATA" |
    "RETRY_REQUIRED";

type TshwaneRunStatus =
    "COMPLETE" |
    "PARTIAL";

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

interface CommandResult {
    exitCode: number;
}

interface TshwaneRunStatusFile {
    marketDate: string;
    status: TshwaneRunStatus;
    successfulRecords?: unknown;
    unavailableProductCount?: unknown;
    technicalFailureCount?: unknown;
    skippedPackageCount?: unknown;
    generatedAt?: unknown;
}

function parseArguments(): PipelineOptions {
    return {
        commit:
            process.argv.includes(
                "--commit"
            ),

        skipScrape:
            process.argv.includes(
                "--skip-scrape"
            )
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

    if (
        !fs.existsSync(
            tsxCliPath
        )
    ) {
        throw new Error(
            `Local tsx CLI was not found: ${tsxCliPath}. ` +
            "Run npm install before using the pipeline."
        );
    }

    return tsxCliPath;
}

function runCommandForExitCode(
    command: string,
    args: string[],
    environment?: NodeJS.ProcessEnv
): Promise<CommandResult> {
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
                        shell: false,
                        env:
                            environment ??
                            process.env
                    }
                );

            child.on(
                "error",
                (
                    error: Error
                ): void => {
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

                    if (code === null) {
                        reject(
                            new Error(
                                "Command exited without an exit code."
                            )
                        );

                        return;
                    }

                    resolve({
                        exitCode: code
                    });
                }
            );
        }
    );
}

async function runCommand(
    command: string,
    args: string[],
    environment?: NodeJS.ProcessEnv
): Promise<void> {
    const result =
        await runCommandForExitCode(
            command,
            args,
            environment
        );

    if (
        result.exitCode !== 0
    ) {
        throw new Error(
            `Command failed with exit code ${result.exitCode}.`
        );
    }
}

async function checkPublication(
    nodeCommand: string,
    tsxCliPath: string
): Promise<PublicationDecision> {
    console.log("");
    console.log(
        "Stage 0: Checking Tshwane publication status..."
    );

    const result =
        await runCommandForExitCode(
            nodeCommand,
            [
                tsxCliPath,
                "scrapers/engine/check-tshwane-publication.ts"
            ]
        );

    if (
        result.exitCode === 0
    ) {
        console.log("");
        console.log(
            "Stage 0 result: NEW DATA AVAILABLE"
        );

        return "NEW_DATA";
    }

    if (
        result.exitCode ===
        NO_NEW_DATA_EXIT_CODE
    ) {
        console.log("");
        console.log(
            "Stage 0 result: NO NEW DATA"
        );

        return "NO_NEW_DATA";
    }

    if (
        result.exitCode ===
        RETRY_REQUIRED_EXIT_CODE
    ) {
        console.log("");
        console.log(
            "Stage 0 result: RETRY REQUIRED"
        );

        return "RETRY_REQUIRED";
    }

    throw new Error(
        "Tshwane publication check failed " +
        `with exit code ${result.exitCode}.`
    );
}

function findNewestCleanJson(
    minimumModifiedTime?: number
): string {
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
            .filter(
                (
                    file
                ): boolean =>
                    minimumModifiedTime ===
                        undefined ||
                    file.modifiedTime >=
                        minimumModifiedTime
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
        if (
            minimumModifiedTime !==
            undefined
        ) {
            throw new Error(
                "No fresh Tshwane clean JSON file was " +
                "created during the current pipeline run."
            );
        }

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
            JSON.parse(
                rawJson
            );
    } catch (error) {
        throw new Error(
            `Could not parse clean JSON file: ${cleanJsonPath}`,
            {
                cause: error
            }
        );
    }

    if (
        !Array.isArray(
            parsedJson
        )
    ) {
        throw new Error(
            "Clean Tshwane JSON must contain a top-level array."
        );
    }

    if (
        parsedJson.length === 0
    ) {
        throw new Error(
            "Clean Tshwane JSON contains no records."
        );
    }

    const records =
        parsedJson as
        CleanRecord[];

    const firstMarketDate =
        records[0]?.marketDate;

    if (
        typeof firstMarketDate !==
            "string" ||
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
                record.isCorrection ===
                true
        ).length;

    return {
        marketDate:
            firstMarketDate,

        expectedDailyPriceRows:
            records.length,

        expectedCorrectionRows
    };
}

function readRunStatus(
    marketDate: string,
    minimumModifiedTime?: number
): TshwaneRunStatusFile {
    const statusPath =
        path.join(
            process.cwd(),
            "scraper-output",
            `tshwane-run-status-${marketDate}.json`
        );

    if (
        !fs.existsSync(
            statusPath
        )
    ) {
        if (
            minimumModifiedTime ===
            undefined
        ) {
            console.warn("");
            console.warn(
                "No Tshwane run-status file was found."
            );

            console.warn(
                "This appears to be a legacy --skip-scrape run."
            );

            console.warn(
                "The existing clean file will be treated as COMPLETE."
            );

            return {
                marketDate,
                status: "COMPLETE"
            };
        }

        throw new Error(
            `Expected run-status file was not created: ${statusPath}`
        );
    }

    const modifiedTime =
        fs.statSync(
            statusPath
        ).mtimeMs;

    if (
        minimumModifiedTime !==
            undefined &&
        modifiedTime <
            minimumModifiedTime
    ) {
        throw new Error(
            "The Tshwane run-status file is stale. " +
            "It was not created during the current scraper run."
        );
    }

    const rawStatus =
        fs.readFileSync(
            statusPath,
            "utf8"
        );

    let parsedStatus:
        unknown;

    try {
        parsedStatus =
            JSON.parse(
                rawStatus
            );
    } catch (error) {
        throw new Error(
            `Could not parse run-status file: ${statusPath}`,
            {
                cause: error
            }
        );
    }

    if (
        typeof parsedStatus !==
            "object" ||
        parsedStatus === null ||
        Array.isArray(
            parsedStatus
        )
    ) {
        throw new Error(
            "Tshwane run-status file must contain a JSON object."
        );
    }

    const status =
        parsedStatus as
        TshwaneRunStatusFile;

    if (
        status.marketDate !==
        marketDate
    ) {
        throw new Error(
            `Run-status market date "${String(status.marketDate)}" ` +
            `does not match clean-data market date "${marketDate}".`
        );
    }

    if (
        status.status !==
            "COMPLETE" &&
        status.status !==
            "PARTIAL"
    ) {
        throw new Error(
            `Unexpected Tshwane run status: "${String(status.status)}".`
        );
    }

    return status;
}

function logRunStatus(
    runStatus: TshwaneRunStatusFile
): void {
    console.log("");
    console.log(
        "Scrape completion status:"
    );

    console.log(
        `Status:               ${runStatus.status}`
    );

    console.log(
        `Successful records:   ${String(
            runStatus.successfulRecords ??
            "not reported"
        )}`
    );

    console.log(
        `Unavailable products: ${String(
            runStatus.unavailableProductCount ??
            "not reported"
        )}`
    );

    console.log(
        `Technical failures:   ${String(
            runStatus.technicalFailureCount ??
            "not reported"
        )}`
    );

    console.log(
        `Skipped packages:     ${String(
            runStatus.skippedPackageCount ??
            "not reported"
        )}`
    );
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

    let publicationDecision:
        PublicationDecision =
            "NEW_DATA";

    if (
        options.skipScrape
    ) {
        console.log("");
        console.log(
            "Stage 0: Publication check SKIPPED"
        );

        console.log(
            "Reason: --skip-scrape was supplied."
        );
    } else {
        publicationDecision =
            await checkPublication(
                nodeCommand,
                tsxCliPath
            );

        if (
            publicationDecision ===
            "NO_NEW_DATA"
        ) {
            console.log("");
            console.log(
                "================================"
            );

            console.log(
                "PIPELINE STOPPED — NO NEW TSHWANE DATA"
            );

            console.log(
                "The current market date is already fully archived."
            );

            console.log(
                "No scraper was launched."
            );

            console.log(
                "No new output files were created."
            );

            console.log(
                "No database import was attempted."
            );

            console.log(
                "================================"
            );

            return;
        }
    }

    /*
     * Fresh output protection starts immediately
     * before the scraper is launched.
     */
    const pipelineStartedAt =
        Date.now();

    if (
        options.skipScrape
    ) {
        console.log("");
        console.log(
            "Scraper stage: SKIPPED"
        );
    } else {
        console.log("");
        console.log(
            publicationDecision ===
                "RETRY_REQUIRED"
                ? "Stage 1: Retrying incomplete Tshwane market date..."
                : "Stage 1: Running Tshwane scraper..."
        );

        let scraperEnvironment:
            NodeJS.ProcessEnv =
                process.env;

        if (
            publicationDecision ===
            "RETRY_REQUIRED"
        ) {
            scraperEnvironment = {
                ...process.env,
                START_PRODUCT_INDEX:
                    "0"
            };

            console.log("");
            console.log(
                "Partial/incomplete market day detected."
            );

            console.log(
                "The existing checkpoint will be preserved."
            );

            console.log(
                "The product list will be revisited from product 1."
            );

            console.log(
                "Existing duplicate protection will prevent " +
                "already-saved package rows from being duplicated."
            );
        }

        await runCommand(
            nodeCommand,
            [
                tsxCliPath,
                "scrapers/markets/tshwane.ts"
            ],
            scraperEnvironment
        );

        console.log("");
        console.log(
            "Stage 1 completed successfully."
        );
    }

    const cleanJsonPath =
        findNewestCleanJson(
            options.skipScrape
                ? undefined
                : pipelineStartedAt
        );

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

    const runStatus =
        readRunStatus(
            verificationExpectations.marketDate,
            options.skipScrape
                ? undefined
                : pipelineStartedAt
        );

    logRunStatus(
        runStatus
    );

    console.log("");
    console.log(
        options.commit
            ? runStatus.status ===
                "PARTIAL"
                ? "Stage 2: Importing PARTIAL data into Supabase..."
                : "Stage 2: Importing COMPLETE data into Supabase..."
            : runStatus.status ===
                "PARTIAL"
                ? "Stage 2: Running Supabase dry-run for PARTIAL data..."
                : "Stage 2: Running Supabase dry-run for COMPLETE data..."
    );

    const importerArguments:
        string[] = [
            tsxCliPath,
            "scrapers/engine/supabase-importer.ts",
            cleanJsonPath
        ];

    if (
        options.commit
    ) {
        importerArguments.push(
            "--commit"
        );

        if (
            runStatus.status ===
            "PARTIAL"
        ) {
            importerArguments.push(
                "--partial"
            );
        }
    }

    await runCommand(
        nodeCommand,
        importerArguments
    );

    if (
        options.commit
    ) {
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

    if (
        options.commit &&
        runStatus.status ===
            "PARTIAL"
    ) {
        console.log(
            "PARTIAL TSHWANE DATA SAVED AND VERIFIED"
        );

        console.log(
            "Technical failures remain."
        );

        console.log(
            "A later scheduled run will retry this market date."
        );
    } else if (
        options.commit
    ) {
        console.log(
            "PIPELINE AND DATABASE IMPORT VERIFIED"
        );

        console.log(
            "Tshwane market date is COMPLETE."
        );
    } else {
        console.log(
            "PIPELINE DRY-RUN COMPLETED"
        );

        console.log(
            `Detected scrape status: ${runStatus.status}`
        );
    }

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

        console.error(
            error
        );

        process.exitCode =
            1;
    }
);
