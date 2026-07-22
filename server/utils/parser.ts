import {readLines} from './text';

export interface Message {
  date: string;
  time: string;
  content: string; // 包含發送者姓名與訊息內容的原始字串
  hash: string; // SHA3-256 訊息雜湊值
}

const DATE_REGEX = /^(\d{4}[/.-]\d{1,2}[/.-]\d{1,2})(?:\s+(.+))?$/;
const TIME_REGEX = /^(\d{1,2}:\d{2})\s+(.*)$/;

/**
 * 計算訊息的 SHA3-256 雜湊值
 * @param date 日期字串
 * @param time 時間字串
 * @param content 訊息內容
 * @returns SHA3-256 雜湊 Hex 字串
 */
function generateHash(date: string, time: string, content: string): string {
  const hasher = new Bun.CryptoHasher('sha3-256');
  hasher.update(`${date}\n${time}\n${content}`);
  return hasher.digest('hex');
}

/**
 * 非同步串流解析聊天紀錄檔並為每條訊息計算 SHA3-256 雜湊
 * @param filePath 檔案路徑
 * @yields Message 物件
 */
export async function* parseChatStream(
    filePath: string,
): AsyncGenerator<Message, void, unknown> {
  let currentDate = '';
  let currentMsg: Omit<Message, 'hash'> | null = null;

  /**
   * Flush current message and return it
   * @returns current message with hash
   */
  function flushMsg(): Message | null {
    if (!currentMsg) return null;
    const content = currentMsg.content.trimEnd();
    const hash = generateHash(currentMsg.date, currentMsg.time, content);
    const msg = {...currentMsg, content, hash};
    currentMsg = null;
    return msg;
  }

  for await (const line of readLines(filePath)) {
    // 1. 日期標頭 (例: "2026.05.06 星期三")
    const dateMatch = line.match(DATE_REGEX);
    if (dateMatch) {
      const matchedDate = dateMatch[1];
      if (dateMatch.length < 2 || matchedDate === undefined) {
        throw new Error(`Invalid date match format for line: "${line}"`);
      }

      const flushed = flushMsg();
      if (flushed) yield flushed;

      currentDate = line.trim();
      continue;
    }

    // 2. 跨行訊息續行
    const timeMatch = line.match(TIME_REGEX);
    if (!timeMatch) {
      if (currentMsg) {
        currentMsg.content += '\n' + line;
      }
      continue;
    }

    // 3. 時間標頭 (例: "11:47 發送人名稱 發送內容")
    const time = timeMatch[1];
    const content = timeMatch[2];
    if (timeMatch.length < 3 || time === undefined || content === undefined) {
      throw new Error(`Invalid time match format for line: "${line}"`);
    }

    const flushed = flushMsg();
    if (flushed) yield flushed;

    currentMsg = {
      date: currentDate,
      time,
      content,
    };
  }

  const lastMsg = flushMsg();
  if (lastMsg) yield lastMsg;
}

/**
 * 一次性解析所有訊息回傳陣列
 * @param filePath 檔案路徑
 * @returns 所有 Message 物件的陣列
 */
export async function parseChat(filePath: string): Promise<Message[]> {
  const messages: Message[] = [];
  for await (const msg of parseChatStream(filePath)) {
    messages.push(msg);
  }
  return messages;
}
