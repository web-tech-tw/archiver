import { connectDatabase, disconnectDatabase } from "./src/databases/connection";
import { getMessageModel } from "./src/databases/models/message";
import { parseChatStream } from "./src/utils/parser";
import { getCollectionForRoom, loadMappingConfig } from "./src/config/mapping";
import { DiscordProvider } from "./src/providers/discord";
import type { ChatContext } from "./src/types/provider";

await connectDatabase();
await loadMappingConfig();

const provider = new DiscordProvider({
    token: Bun.env.DISCORD_BOT_TOKEN || "",
    presence: Bun.env.DISCORD_PRESENCE || "萬眾一心",
});

provider.onMessage(async (ctx: ChatContext) => {
    // 1. 若收到的是聊天紀錄文字檔案（.txt）
    if (ctx.type === "file" && ctx.fileName?.toLowerCase().endsWith(".txt")) {
        const collectionName = await getCollectionForRoom(ctx.roomId);
        if (!collectionName) {
            await ctx.reply(`[Archiver] 查無此頻道 (${ctx.roomId}) 對應的 Collection，請先於 mapping.toml 進行設定。`);
            return;
        }

        await ctx.reply(`[Archiver] 開始解析檔案「${ctx.fileName}」，目標集合：「${collectionName}」...`);
        const Model = getMessageModel(collectionName);

        let count = 0;
        let batch: Array<{
            updateOne: {
                filter: { _id: string };
                update: {
                    $setOnInsert: {
                        _id: string;
                        date: string;
                        time: string;
                        content: string;
                    };
                };
                upsert: true;
            };
        }> = [];

        try {
            for await (const msg of parseChatStream(ctx.content)) {
                count++;
                batch.push({
                    updateOne: {
                        filter: { _id: msg.hash },
                        update: {
                            $setOnInsert: {
                                _id: msg.hash,
                                date: msg.date,
                                time: msg.time,
                                content: msg.content,
                            },
                        },
                        upsert: true,
                    },
                });

                if (batch.length >= 1000) {
                    await Model.bulkWrite(batch);
                    batch = [];
                }
            }

            if (batch.length > 0) {
                await Model.bulkWrite(batch);
            }

            await ctx.reply(`[Archiver] 解析完成！共處理 ${count} 條訊息並寫入集合「${collectionName}」。`);
        } catch (error) {
            console.error("[Archiver] 檔案解析或資料庫寫入失敗:", error);
            await ctx.reply(`[Archiver] 解析失敗: ${(error as Error).message}`);
        }
        return;
    }

    // 2. 一般文字訊息日誌
    console.info(`[Message] [${ctx.platformName}] Room: ${ctx.roomId}, User: ${ctx.sender.nickname || ctx.sender.id} (${ctx.type}): ${ctx.content}`);
});

provider.onCommand(async (command, _args, ctx) => {
    if (command === "ping") {
        await ctx.reply("pong");
    }
});

await provider.start();
console.info("[Archiver] Discord Bot started successfully.");

const shutdown = async () => {
    console.info("[Archiver] Shutting down...");
    await provider.stop();
    await disconnectDatabase();
    process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
