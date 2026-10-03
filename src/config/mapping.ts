import { existsSync } from "node:fs";

export interface RoomMapping {
    message_collection: string;
    knowledge_collection?: string;
}

export interface ChannelMappingConfig {
    mappings?: Record<string, RoomMapping>;
    [key: string]: unknown;
}

const DEFAULT_MAPPING_PATH = "./mapping.toml";

/**
 * 載入 mapping.toml 設定檔並取得頻道對應表
 * 格式：[mappings] 底下每個 roomId 對應 { message_collection, knowledge_collection }
 */
export async function loadMappingConfig(path = DEFAULT_MAPPING_PATH): Promise<Record<string, RoomMapping>> {
    if (!existsSync(path)) {
        return {};
    }

    try {
        const content = await Bun.file(path).text();
        const parsed = Bun.TOML.parse(content) as ChannelMappingConfig;
        return parsed.mappings || {};
    } catch (err) {
        console.error(`[Mapping] Failed to parse ${path}:`, err);
        return {};
    }
}

/**
 * 依據 roomId (頻道 ID) 查詢對應的訊息 Collection 名稱
 */
export async function getCollectionForRoom(roomId: string, path = DEFAULT_MAPPING_PATH): Promise<string | null> {
    const mappings = await loadMappingConfig(path);
    return mappings[roomId]?.message_collection || null;
}

/**
 * 判斷 roomId 是否啟用知識文件進料（.md/.pdf → Nymph knowledge ingest）
 * knowledge_collection 存在即視為啟用
 */
export async function isKnowledgeRoom(roomId: string, path = DEFAULT_MAPPING_PATH): Promise<boolean> {
    const mappings = await loadMappingConfig(path);
    return Boolean(mappings[roomId]?.knowledge_collection);
}

/**
 * 依據 roomId 查詢對應的知識 Collection 名稱
 */
export async function getKnowledgeCollectionForRoom(roomId: string, path = DEFAULT_MAPPING_PATH): Promise<string | null> {
    const mappings = await loadMappingConfig(path);
    return mappings[roomId]?.knowledge_collection || null;
}
