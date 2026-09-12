export const PlatformName = {
    Discord: "Discord",
} as const;

export type PlatformName = (typeof PlatformName)[keyof typeof PlatformName];

export interface MessageCardField {
    name: string;
    value: string;
    inline?: boolean;
}

export interface MessageCard {
    title?: string;
    description?: string;
    color?: number;
    fields?: MessageCardField[];
    footer?: string;
    timestamp?: Date;
}

export interface SentMessageHandle {
    edit(content: string | MessageCard): Promise<void>;
}

export type MessageCallback = (ctx: ChatContext) => Promise<void>;
export type CommandCallback = (command: string, args: string[], ctx: ChatContext) => Promise<void>;

export interface BasePlatformProvider extends BaseProvider {
    sendText(roomId: string, content: string): void | Promise<void>;
}

export interface BaseProvider {
    readonly name: PlatformName;
    readonly enabled: boolean;
    start(): void | Promise<void>;
    stop(): void | Promise<void>;
    onMessage(cb: MessageCallback): void;
    onCommand(cb: CommandCallback): void;
}

export interface UserProfile {
    id: string;
    nickname: string;
    [key: string]: unknown;
}

export type MessageContentType = "text" | "image" | "file";

export interface ChatContext {
    platformName: PlatformName;
    roomId: string;
    sender: UserProfile;
    type: MessageContentType;
    content: string;
    fileName?: string;
    transactionId?: string;
    reply(content: string | MessageCard): Promise<SentMessageHandle>;
    deleteUserMessage?(): Promise<void>;
}
