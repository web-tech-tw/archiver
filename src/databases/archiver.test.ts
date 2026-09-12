import { describe, it, expect, mock } from "bun:test";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { dryRunValidateStream, archiveChatStream } from "./archiver";
import { messageSchema, type MessageDocument } from "./models/message";
import mongoose from "mongoose";

describe("Archiver Stream Processing", () => {
    const TestModel = mongoose.model("TestMessageModel", messageSchema, "test_messages");
    const sampleVia = {
        channelId: "1234567890",
        uploaderId: "9876543210",
    };

    it("should pass dry-run validation for valid chat log", async () => {
        const tempPath = join(import.meta.dir, "temp_test_valid.txt");
        const content = `2026/06/26（週五）
10:00\tUserA\t早安
10:01\tUserB\t早安你好
`;
        await Bun.write(tempPath, content);

        const count = await dryRunValidateStream(tempPath, TestModel, sampleVia);
        expect(count).toBe(2);

        await unlink(tempPath);
    });

    it("should reject chat log with empty date during dry-run", async () => {
        const tempPath = join(import.meta.dir, "temp_test_invalid_date.txt");
        // No date header preceding the messages -> date will be empty string
        const content = `10:00\tUserA\t早安
10:01\tUserB\t早安你好
`;
        await Bun.write(tempPath, content);

        expect(
            dryRunValidateStream(tempPath, TestModel, sampleVia),
        ).rejects.toThrow("Schema 驗證失敗");

        await unlink(tempPath);
    });

    it("should reject chat log with zero messages during dry-run", async () => {
        const tempPath = join(import.meta.dir, "temp_test_empty.txt");
        await Bun.write(tempPath, "隨便一些不符合格式的文字\n第二行也是雜訊\n");

        expect(
            dryRunValidateStream(tempPath, TestModel, sampleVia),
        ).rejects.toThrow("檔案中無可解析的訊息內容");

        await unlink(tempPath);
    });

    it("should batch write via archiveChatStream and call bulkWrite", async () => {
        const tempPath = join(import.meta.dir, "temp_test_archive.txt");
        const content = `2026/06/26（週五）
10:00\tUserA\t早安
10:01\tUserB\t早安你好
`;
        await Bun.write(tempPath, content);

        const bulkWriteMock = mock(() => Promise.resolve({ ok: 1 }));
        const mockModel = {
            bulkWrite: bulkWriteMock,
        } as unknown as mongoose.Model<MessageDocument>;

        const count = await archiveChatStream(tempPath, mockModel, sampleVia, 1);
        expect(count).toBe(2);
        expect(bulkWriteMock).toHaveBeenCalledTimes(2);

        await unlink(tempPath);
    });
});
