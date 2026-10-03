import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { ingestKnowledgeFile } from "../src/utils/knowledge";

/**
 * 一次性回填 script：將 received/ 內快取的知識文件（<nanoid>_<原檔名>.md|.pdf）
 * 重新送進 Nymph 的 knowledge ingest API。以內容雜湊去重，重跑不會重複入庫。
 *
 * 用法：
 *   bun scripts/backfill-knowledge.ts --room <頻道 ID> [--dir ./received] [--url http://nymph:3000] [--dry-run]
 */

interface BackfillOptions {
    room: string;
    dir: string;
    dryRun: boolean;
}

function parseArgs(argv: string[]): BackfillOptions | null {
    const options: BackfillOptions = { room: "", dir: "./received", dryRun: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--room") {
            options.room = argv[++i] || "";
        } else if (arg === "--dir") {
            options.dir = argv[++i] || options.dir;
        } else if (arg === "--url") {
            const url = argv[++i];
            if (url) Bun.env.NYMPH_URL = url;
        } else if (arg === "--dry-run") {
            options.dryRun = true;
        }
    }
    return options.room ? options : null;
}

const KNOWLEDGE_FILE_PATTERN = /^([A-Za-z0-9_-]{21})_(.+\.(md|pdf))$/i;

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (!options) {
        console.error("用法：bun scripts/backfill-knowledge.ts --room <頻道 ID> [--dir ./received] [--url http://nymph:3000] [--dry-run]");
        process.exit(1);
    }

    if (!Bun.env.KNOWLEDGE_INGEST_SECRET) {
        console.error("[Backfill] 缺少 KNOWLEDGE_INGEST_SECRET 環境變數。");
        process.exit(1);
    }

    let entries: string[];
    try {
        entries = await readdir(options.dir);
    } catch (err) {
        console.error(`[Backfill] 無法讀取目錄 ${options.dir}：`, (err as Error).message);
        process.exit(1);
    }

    const targets: { filePath: string; fileName: string; transactionId: string }[] = [];
    for (const name of entries) {
        const match = name.match(KNOWLEDGE_FILE_PATTERN);
        const transactionId = match?.[1];
        const originalName = match?.[2];
        if (!match || !transactionId || !originalName) continue;
        targets.push({
            filePath: join(options.dir, name),
            fileName: originalName,
            transactionId,
        });
    }

    if (!targets.length) {
        console.info(`[Backfill] ${options.dir} 內沒有可回填的 .md/.pdf 檔案。`);
        return;
    }

    console.info(`[Backfill] 共發現 ${targets.length} 檔待回填至頻道 ${options.room}。`);

    let ingested = 0;
    let deduped = 0;
    let failed = 0;

    for (const target of targets) {
        if (options.dryRun) {
            console.info(`[Dry-run] ${target.fileName}（txn: ${target.transactionId}）`);
            continue;
        }

        const result = await ingestKnowledgeFile({
            filePath: target.filePath,
            fileName: target.fileName,
            roomId: options.room,
            uploaderId: "archiver-backfill",
            transactionId: target.transactionId,
        });

        if (result.ok) {
            if (result.deduped) {
                deduped++;
                console.info(`[Backfill] ${target.fileName}：已存在（knowledgeId ${result.knowledgeId}），跳過。`);
            } else {
                ingested++;
                console.info(`[Backfill] ${target.fileName}：已入庫（knowledgeId ${result.knowledgeId}）。`);
            }
        } else {
            failed++;
            console.error(`[Backfill] ${target.fileName}：失敗（${result.status}）${result.error ?? ""}`);
        }
    }

    console.info(`[Backfill] 完成：新入庫 ${ingested}、重複跳過 ${deduped}、失敗 ${failed}。`);
    if (failed > 0) process.exit(1);
}

await main();
