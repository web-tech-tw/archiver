import { existsSync } from "node:fs";

export interface ChannelMappingConfig {
    mappings?: Record<string, string>;
    [key: string]: unknown;
}

const DEFAULT_MAPPING_PATH = "./mapping.toml";

/**
 * 載入 mapping.toml 設定檔並取得頻道與 Collection 名稱對應表
 */
export async function loadMappingConfig(path = DEFAULT_MAPPING_PATH): Promise<Record<string, string>> {
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
 * 依據 roomId (頻道 ID) 查詢對應的 MongoDB Collection 名稱
 */
export async function getCollectionForRoom(roomId: string, path = DEFAULT_MAPPING_PATH): Promise<string | null> {
    const mappings = await loadMappingConfig(path);
    return mappings[roomId] || null;
}
