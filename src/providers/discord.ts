import {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
    PresenceUpdateStatus,
    ActivityType,
    EmbedBuilder,
} from "discord.js";
import { PlatformName } from "../types/provider";
import type {
    BasePlatformProvider,
    MessageCallback,
    CommandCallback,
    ChatContext,
    MessageCard,
    SentMessageHandle
} from "../types/provider";
import type { DiscordProviderParams } from "../types/discord";

import { sliceContent } from "../utils/text";
import { saveReceivedImage, RECEIVED_DIR } from "../utils/media";
import { nanoid } from "nanoid";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

function toDiscordEmbed(card: MessageCard): EmbedBuilder {
    const embed = new EmbedBuilder();
    if (card.title) embed.setTitle(card.title);
    if (card.description) embed.setDescription(card.description);
    if (card.color !== undefined) embed.setColor(card.color);
    if (card.fields && card.fields.length > 0) embed.addFields(card.fields);
    if (card.footer) embed.setFooter({ text: card.footer });
    if (card.timestamp) embed.setTimestamp(card.timestamp);
    return embed;
}

export class DiscordProvider implements BasePlatformProvider {
    readonly name: PlatformName = PlatformName.Discord;
    readonly enabled: boolean;

    #token: string;
    #presence: string;
    #client: Client | null = null;
    #messageCallbacks: MessageCallback[] = [];
    #commandCallbacks: CommandCallback[] = [];

    constructor(params: DiscordProviderParams) {
        this.#token = params.token;
        this.#presence = params.presence || "Archiver";
        this.enabled = this.#token !== "";
    }

    async start(): Promise<void> {
        if (!this.enabled) return;
        if (this.#client) return;

        const client = new Client({
            partials: [Partials.Channel, Partials.Message],
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.MessageContent,
            ],
        });

        client.on(Events.ClientReady, () => {
            console.info(`[DiscordProvider] Logged in as ${client.user?.tag}`);
            client.user?.setPresence({
                status: PresenceUpdateStatus.Online,
                activities: [{ type: ActivityType.Playing, name: this.#presence }],
            });
        });

        client.on(Events.MessageCreate, async (message) => {
            if (message.author.bot) return;

            let cleanContent = message.content;
            if (client.user) {
                const mentionRegex = new RegExp(`<@!?${client.user.id}>`, "g");
                cleanContent = cleanContent.replace(mentionRegex, "").trim();
            }

            const imageAttachments = message.attachments.filter(
                (att) => att.contentType?.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(att.name || ""),
            );

            const fileAttachments = message.attachments.filter(
                (att) => !imageAttachments.has(att.id),
            );

            if (!cleanContent && imageAttachments.size === 0 && fileAttachments.size === 0) return;

            const channel = message.channel;
            const channelId = channel.id;

            const createReply = () => {
                return async (content: string | MessageCard): Promise<SentMessageHandle> => {
                    if (!channel.isSendable()) {
                        throw new Error(`[DiscordProvider] Channel ${channelId} is not sendable`);
                    }
                    const payload = typeof content === "string" ? { content } : { embeds: [toDiscordEmbed(content)] };
                    const sent = await channel.send(payload);
                    return {
                        edit: async (newContent: string | MessageCard) => {
                            const editPayload = typeof newContent === "string"
                                ? { content: newContent, embeds: [] }
                                : { content: null, embeds: [toDiscordEmbed(newContent)] };
                            await sent.edit(editPayload);
                        },
                    };
                };
            };

            const deleteUserMessage = async () => {
                if (!message.deletable) return;
                await message.delete();
            };

            // 處理檔案附件（例如 LINE 聊天紀錄 .txt）
            for (const [, attachment] of fileAttachments) {
                try {
                    const res = await fetch(attachment.url);
                    if (res.ok) {
                        const buffer = await res.arrayBuffer();
                        const id = nanoid();
                        await mkdir(RECEIVED_DIR, { recursive: true });
                        const originalName = attachment.name || `${id}.txt`;
                        const targetPath = join(RECEIVED_DIR, `${id}_${originalName}`);
                        await Bun.write(targetPath, buffer);

                        const fileCtx: ChatContext = {
                            platformName: PlatformName.Discord,
                            roomId: channelId,
                            sender: {
                                id: message.author.id,
                                nickname: message.member?.displayName ?? message.author.displayName ?? message.author.username,
                                username: message.author.username,
                            },
                            type: "file",
                            content: targetPath,
                            fileName: originalName,
                            reply: createReply(),
                            deleteUserMessage,
                        };

                        for (const cb of this.#messageCallbacks) {
                            try {
                                await cb(fileCtx);
                            } catch (error) {
                                console.error("[DiscordProvider] Error executing file callback:", error);
                            }
                        }
                    }
                } catch (error) {
                    console.error("[DiscordProvider] Error processing file attachment:", error);
                }
            }

            // 處理圖片附件
            for (const [, attachment] of imageAttachments) {
                try {
                    const res = await fetch(attachment.url);
                    if (res.ok) {
                        const buffer = await res.arrayBuffer();
                        const id = await saveReceivedImage(buffer);
                        const imageCtx: ChatContext = {
                            platformName: PlatformName.Discord,
                            roomId: channelId,
                            sender: {
                                id: message.author.id,
                                nickname: message.member?.displayName ?? message.author.displayName ?? message.author.username,
                                username: message.author.username,
                            },
                            type: "image",
                            content: id,
                            fileName: attachment.name || undefined,
                            reply: createReply(),
                            deleteUserMessage,
                        };

                        for (const cb of this.#messageCallbacks) {
                            try {
                                await cb(imageCtx);
                            } catch (error) {
                                console.error("[DiscordProvider] Error executing image callback:", error);
                            }
                        }
                    }
                } catch (error) {
                    console.error("[DiscordProvider] Error processing image attachment:", error);
                }
            }

            // 處理純文字訊息
            if (cleanContent) {
                const ctx: ChatContext = {
                    platformName: PlatformName.Discord,
                    roomId: channelId,
                    sender: {
                        id: message.author.id,
                        nickname: message.member?.displayName ?? message.author.displayName ?? message.author.username,
                        username: message.author.username,
                    },
                    type: "text",
                    content: cleanContent,
                    reply: createReply(),
                    deleteUserMessage,
                };

                for (const cb of this.#messageCallbacks) {
                    try {
                        await cb(ctx);
                    } catch (error) {
                        console.error("[DiscordProvider] Error executing message callback:", error);
                    }
                }
            }
        });

        this.#client = client;
        await client.login(this.#token);
    }

    async stop(): Promise<void> {
        if (this.#client) {
            await this.#client.destroy();
            this.#client = null;
        }
    }

    onMessage(cb: MessageCallback): void {
        this.#messageCallbacks.push(cb);
    }

    onCommand(cb: CommandCallback): void {
        this.#commandCallbacks.push(cb);
    }

    async sendText(roomId: string, content: string): Promise<void> {
        if (!this.enabled) {
            console.warn("[DiscordProvider] Cannot send text: Provider is disabled");
            return;
        }
        if (!this.#client) {
            console.warn("[DiscordProvider] Cannot send text: Discord client is not initialized");
            return;
        }

        const channel = await this.#client.channels.fetch(roomId).catch((err) => {
            console.error(`[DiscordProvider] Failed to fetch channel ${roomId}:`, err);
            return null;
        });
        if (!channel) {
            console.error(`[DiscordProvider] Channel ${roomId} not found`);
            return;
        }
        if (!channel.isSendable()) {
            console.error(`[DiscordProvider] Channel ${roomId} is not sendable`);
            return;
        }

        const chunks = sliceContent(content, 2000);
        for (const chunk of chunks) {
            try {
                await channel.send(chunk);
            } catch (err) {
                console.error(`[DiscordProvider] Failed to send message to channel ${roomId}:`, err);
            }
        }
    }
}