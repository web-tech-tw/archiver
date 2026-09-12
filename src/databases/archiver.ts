import type mongoose from "mongoose";
import type { MessageDocument, MessageVia } from "./models/message";
import { parseChatStream } from "../utils/parser";

/**
 * Dry-run 掃描訊息串流並依據 Mongoose Schema 逐筆驗證資料完整性
 * 採用串流 (Async Cursor) 逐筆處理，不於記憶體累積陣列，避免 OOM
 *
 * @param filePath 本地文字檔案路徑
 * @param Model 對應集合的 Mongoose Model
 * @param via 上傳來源資訊（頻道與上傳者）
 * @returns 總驗證成功筆數
 */
export async function dryRunValidateStream(
    filePath: string,
    Model: mongoose.Model<MessageDocument>,
    via: MessageVia,
): Promise<number> {
    let count = 0;

    for await (const msg of parseChatStream(filePath)) {
        count++;

        const doc = new Model({
            _id: msg.hash,
            date: msg.date,
            time: msg.time,
            content: msg.content,
            via,
        });

        const validationError = doc.validateSync();
        if (validationError) {
            throw new Error(`第 ${count} 筆訊息 Schema 驗證失敗: ${validationError.message}`);
        }
    }

    if (count === 0) {
        throw new Error("檔案中無可解析的訊息內容");
    }

    return count;
}

/**
 * 依據串流批次寫入資料庫
 * 採用分批 (每 batchSize 筆 bulkWrite) 寫入並立即釋放記憶體，維持常數記憶體佔用
 *
 * @param filePath 本地文字檔案路徑
 * @param Model 對應集合的 Mongoose Model
 * @param via 上傳來源資訊（頻道與上傳者）
 * @param batchSize 每次批次寫入的大小，預設 1000
 * @returns 總寫入筆數
 */
export async function archiveChatStream(
    filePath: string,
    Model: mongoose.Model<MessageDocument>,
    via: MessageVia,
    batchSize = 1000,
): Promise<number> {
    let count = 0;
    let batch: Array<{
        updateOne: {
            filter: { _id: string };
            update: {
                $set: {
                    date: string;
                    time: string;
                    content: string;
                    via: MessageVia;
                };
                $setOnInsert: {
                    _id: string;
                };
            };
            upsert: true;
        };
    }> = [];

    for await (const msg of parseChatStream(filePath)) {
        count++;
        batch.push({
            updateOne: {
                filter: { _id: msg.hash },
                update: {
                    $set: {
                        date: msg.date,
                        time: msg.time,
                        content: msg.content,
                        via,
                    },
                    $setOnInsert: {
                        _id: msg.hash,
                    },
                },
                upsert: true,
            },
        });

        if (batch.length >= batchSize) {
            await Model.bulkWrite(batch);
            batch = [];
        }
    }

    if (batch.length > 0) {
        await Model.bulkWrite(batch);
        batch = [];
    }

    return count;
}
