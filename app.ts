import { connectDatabase, disconnectDatabase } from "./src/databases/connection";
import { getMessageModel } from "./src/databases/models/message";
import { parseChatStream, extractChatPreview } from "./src/utils/parser";
import { getCollectionForRoom, loadMappingConfig } from "./src/config/mapping";
import { DiscordProvider } from "./src/providers/discord";
import type { ChatContext, MessageCard } from "./src/types/provider";

await connectDatabase();
await loadMappingConfig();

const provider = new DiscordProvider({
    token: Bun.env.DISCORD_BOT_TOKEN || "",
    presence: Bun.env.DISCORD_PRESENCE || "萬眾一心",
});

function buildStatusCard(params: {
    fileName: string;
    uploaderId?: string;
    uploaderName?: string;
    preview: string;
    collectionName: string;
    status: "processing" | "success" | "error";
    count?: number;
    errorMessage?: string;
}): MessageCard {
    const uploaderText = params.uploaderId ? `<@${params.uploaderId}>` : (params.uploaderName || "未知使用者");

    let color = 0x3498db; // 藍色（處理中）
    let statusText = `⏳ 正在解析並批次歸檔至集合「${params.collectionName}」...`;

    if (params.status === "success") {
        color = 0x2ecc71; // 綠色（成功）
        statusText = `✅ 解析完成！共處理 ${params.count ?? 0} 條訊息並寫入集合「${params.collectionName}」。`;
    } else if (params.status === "error") {
        color = 0xe74c3c; // 紅色（失敗）
        statusText = `❌ 解析失敗：${params.errorMessage}`;
    }

    return {
        title: "📁 聊天紀錄歸檔",
        description: `**檔案名稱**：\`${params.fileName}\`\n**上傳者**：${uploaderText}\n\n\`\`\`\n${params.preview}\n\`\`\``,
        color,
        fields: [
            { name: "目標集合", value: `\`${params.collectionName}\``, inline: true },
            { name: "處理狀態", value: statusText, inline: false },
        ],
        timestamp: new Date(),
        footer: "Chat Archiver",
    };
}

provider.onMessage(async (ctx: ChatContext) => {
    // 1. 若收到的是聊天紀錄文字檔案（.txt）
    if (ctx.type === "file" && ctx.fileName?.toLowerCase().endsWith(".txt")) {
        const collectionName = await getCollectionForRoom(ctx.roomId);
        if (!collectionName) {
            await ctx.reply(`[Archiver] 查無此頻道 (${ctx.roomId}) 對應的 Collection，請先於 mapping.toml 進行設定。`);
            return;
        }

        const preview = await extractChatPreview(ctx.content);
        const cardParams = {
            fileName: ctx.fileName,
            uploaderId: ctx.sender.id,
            uploaderName: ctx.sender.nickname,
            preview,
            collectionName,
        };

        const statusMsg = await ctx.reply(buildStatusCard({
            ...cardParams,
            status: "processing",
        }));

        const Model = getMessageModel(collectionName);
        let count = 0;
        let batch: Array<{
            updateOne: {
                filter: { _id: string };
                update: {
                    $set: {
                        date: string;
                        time: string;
                        content: string;
                        via: {
                            channelId: string;
                            uploaderId: string;
                        };
                    };
                    $setOnInsert: {
                        _id: string;
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
                            $set: {
                                date: msg.date,
                                time: msg.time,
                                content: msg.content,
                                via: {
                                    channelId: ctx.roomId,
                                    uploaderId: ctx.sender.id,
                                },
                            },
                            $setOnInsert: {
                                _id: msg.hash,
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

            await statusMsg.edit(buildStatusCard({
                ...cardParams,
                status: "success",
                count,
            }));
        } catch (error) {
            console.error("[Archiver] 檔案解析或資料庫寫入失敗:", error);
            await statusMsg.edit(buildStatusCard({
                ...cardParams,
                status: "error",
                errorMessage: (error as Error).message,
            }));
        } finally {
            if (ctx.deleteUserMessage) {
                await ctx.deleteUserMessage().catch((err) => {
                    console.warn("[Archiver] 刪除使用者上傳訊息失敗:", err);
                });
            }
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
