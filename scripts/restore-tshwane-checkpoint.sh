#!/usr/bin/env bash

set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"

restore_root="$(mktemp -d)"
trap 'rm -rf "$restore_root"' EXIT

runs_file="$restore_root/workflow-runs.txt"

gh api \
    --method GET \
    "repos/${GITHUB_REPOSITORY}/actions/workflows/tshwane-collection.yml/runs" \
    -f per_page=100 \
    --jq '
        [.workflow_runs[]]
        | sort_by(.created_at)
        | reverse[]
        | .id
    ' > "$runs_file"

restored=false

while IFS= read -r run_id; do
    if [[ -z "$run_id" || "$run_id" == "$GITHUB_RUN_ID" ]]; then
        continue
    fi

    artifacts_file="$restore_root/artifacts-${run_id}.tsv"

    gh api \
        --method GET \
        "repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}/artifacts" \
        -f per_page=100 \
        --jq '
            [
                .artifacts[]
                | select(
                    (.expired == false)
                    and
                    (.name | startswith("tshwane-recovery-"))
                )
            ]
            | sort_by(.created_at)
            | reverse[]
            | [.name, (.id | tostring)]
            | @tsv
        ' > "$artifacts_file"

    while IFS=$'\t' read -r artifact_name artifact_id; do
        if [[ -z "$artifact_name" || -z "$artifact_id" ]]; then
            continue
        fi

        candidate_dir="$restore_root/artifact-${artifact_id}"
        mkdir -p "$candidate_dir"

        echo "Inspecting artifact ${artifact_name} from run ${run_id}"

        gh run download "$run_id" \
            --repo "$GITHUB_REPOSITORY" \
            --name "$artifact_name" \
            --dir "$candidate_dir"

        mapfile -d '' checkpoint_files < <(
            find "$candidate_dir" \
                -type f \
                -path '*/scraper-output/tshwane-checkpoint-*.json' \
                -print0
        )

        if (( ${#checkpoint_files[@]} == 0 )); then
            echo "Artifact contains no Tshwane checkpoint; checking older artifacts."
            continue
        fi

        mkdir -p scraper-output

        for checkpoint_file in "${checkpoint_files[@]}"; do
            checkpoint_name="$(basename "$checkpoint_file")"

            cp -- \
                "$checkpoint_file" \
                "scraper-output/$checkpoint_name"

            echo "Restored checkpoint: scraper-output/$checkpoint_name"
        done

        restored=true
        break 2
    done < "$artifacts_file"
done < "$runs_file"

if [[ "$restored" == false ]]; then
    echo "No previous usable Tshwane checkpoint artifact was found."
    echo "The scraper will start without restored checkpoint data."
fi
