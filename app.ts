import { connectDatabase, disconnectDatabase } from "./src/databases/connection";
import { getMessageModel } from "./src/databases/models/message";
import { dryRunValidateStream, archiveChatStream } from "./src/databases/archiver";
import { extractChatPreview } from "./src/utils/parser";
import { getCollectionForRoom, loadMappingConfig } from "./src/config/mapping";
import { DiscordProvider } from "./src/providers/discord";
import type { ChatContext, MessageCard } from "./src/types/provider";
import { nanoid } from "nanoid";

await connectDatabase();
await loadMappingConfig();

const provider = new DiscordProvider({
    token: Bun.env.DISCORD_BOT_TOKEN || "",
    presence: Bun.env.DISCORD_PRESENCE || "萬眾一心",
});

function buildStatusCard(params: {
    transactionId: string;
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
            { name: "交易 ID", value: `\`${params.transactionId}\``, inline: true },
            { name: "處理狀態", value: statusText, inline: false },
        ],
        timestamp: new Date(),
        footer: `Chat Archiver • ${params.transactionId}`,
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

        const transactionId = nanoid();
        const preview = await extractChatPreview(ctx.content);
        const cardParams = {
            transactionId,
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
        const via = {
            channelId: ctx.roomId,
            uploaderId: ctx.sender.id,
            transactionId,
        };

        try {
            // 1. Dry-run 掃描 Schema 驗證完整性 (Cursor 串流逐筆處理，避免記憶體溢出)
            await dryRunValidateStream(ctx.content, Model, via);

            // 2. 驗證通過後，以串流批次寫入資料庫 (每 1000 筆 bulkWrite，維持常數記憶體)
            const count = await archiveChatStream(ctx.content, Model, via);

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
