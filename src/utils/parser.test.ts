import { describe, it, expect } from "bun:test";
import { parseChatStream, parseChat, extractChatPreview } from "./parser";
import { join } from "node:path";
import { unlink } from "node:fs/promises";

describe("LINE Chat Parser", () => {
    it("should parse sample chat stream and calculate sha3-256 hash", async () => {
        const tempPath = join(import.meta.dir, "temp_test_chat.txt");
        const sampleChat = `2026/05/06 星期三
11:47 Alice 早安
11:48 Bob 早安！今天天氣真好
跨行訊息測試
11:49 Alice 收到
`;
        await Bun.write(tempPath, sampleChat);

        const streamed: Array<{ date: string; time: string; content: string; hash: string }> = [];
        for await (const msg of parseChatStream(tempPath)) {
            streamed.push(msg);
        }
        expect(streamed.length).toBe(3);

        const messages = await parseChat(tempPath);
        expect(messages.length).toBe(3);

        const msg0 = messages[0];
        const msg1 = messages[1];
        const msg2 = messages[2];
        if (!msg0 || !msg1 || !msg2) {
            throw new Error("Expected 3 messages to be parsed");
        }

        expect(msg0.date).toBe("2026/05/06 星期三");
        expect(msg0.time).toBe("11:47");
        expect(msg0.content).toBe("Alice 早安");
        expect(msg0.hash).toBeDefined();

        expect(msg1.time).toBe("11:48");
        expect(msg1.content).toBe("Bob 早安！今天天氣真好\n跨行訊息測試");

        expect(msg2.time).toBe("11:49");
        expect(msg2.content).toBe("Alice 收到");

        await unlink(tempPath);
    });

    it("should extract header and first message preview", async () => {
        const tempPath = join(import.meta.dir, "temp_test_preview.txt");
        const sampleChat = `[LINE] Vue.js Plus 社群的聊天記錄
儲存日期：2026/9/12 01:14

2026/6/26（週五）
23:31\t小菜\t摁⋯看客戶需求吧
有些很注重效能的產品...
23:32\t小明\t同意
`;
        await Bun.write(tempPath, sampleChat);

        const preview = await extractChatPreview(tempPath);
        expect(preview).toContain("[LINE] Vue.js Plus 社群的聊天記錄");
        expect(preview).toContain("儲存日期：2026/9/12 01:14");
        expect(preview).toContain("23:31\t小菜\t摁⋯看客戶需求吧\n有些很注重效能的產品...");
        expect(preview).not.toContain("23:32\t小明\t同意");

        await unlink(tempPath);
    });
});
