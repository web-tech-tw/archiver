/**
 * 逐行非同步串流讀取檔案內容
 * @param path 檔案路徑
 * @yields 檔案中的每一行文字
 */
export async function* readLines(path: string): AsyncGenerator<string> {
  const stream = Bun.file(path).stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let leftover = '';

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;

    const chunk = leftover + decoder.decode(value, {stream: true});
    const lines = chunk.split(/\r?\n/);
    leftover = lines.pop() ?? '';

    for (const line of lines) {
      yield line;
    }
  }

  if (leftover.length > 0) {
    yield leftover;
  }
}
