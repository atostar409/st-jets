/**
 * JETS 世界书数据源
 * 将世界书条目转换为可索引条目
 */

const WORLDINFO_FETCH_CONCURRENCY = 4;

function getRequestHeaders() {
    const context = (typeof globalThis !== 'undefined' && globalThis.SillyTavern?.getContext)
        ? globalThis.SillyTavern.getContext()
        : null;
    return context?.getRequestHeaders
        ? context.getRequestHeaders()
        : { 'Content-Type': 'application/json' };
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(body || {}),
    });
    if (!response.ok) {
        throw new Error(`${url} ${response.status}`);
    }
    return response.json();
}

export class WorldInfoSource {
    constructor(worldbooks = []) {
        this.worldbooks = worldbooks;
    }

    async load() {
        // 直接走官方 HTTP 接口（旧代码依赖的 globalThis.ST_API 在 SillyTavern 里并不存在，
        // 之前因此永远拿到空列表，世界书完全搜不到）
        // POST /api/worldinfo/list -> [{ file_id, name, extensions }]
        const books = await postJson('/api/worldinfo/list', {});
        const list = (Array.isArray(books) ? books : []).filter(book => book?.name);
        const fullBooks = new Array(list.length);

        // 受控并发拉取各世界书，替代逐本串行请求
        let cursor = 0;
        const worker = async () => {
            while (cursor < list.length) {
                const index = cursor;
                cursor += 1;
                const { name } = list[index];
                try {
                    // POST /api/worldinfo/get { name } -> 世界书原始 JSON
                    // 书文件本体大多没有顶层 name 字段（书名就是文件名，只存在 list 接口里），
                    // 必须把 list 里的名字合并进书对象，否则索引条目全部变成「未命名」
                    const raw = await postJson('/api/worldinfo/get', { name });
                    fullBooks[index] = { ...raw, name };
                } catch (err) {
                    console.warn('WorldInfoSource.load: 获取世界书失败', name, err);
                }
            }
        };

        const workerCount = Math.max(1, Math.min(WORLDINFO_FETCH_CONCURRENCY, list.length));
        await Promise.all(Array.from({ length: workerCount }, () => worker()));

        this.worldbooks = fullBooks.filter(Boolean);
        return this.worldbooks;
    }

    toIndexItems() {
        const items = [];

        for (const book of this.worldbooks) {
            // 世界书文件有新旧两种格式：entries 为数组（新格式），
            // 或「uid -> 条目」对象（旧格式，最常见），旧格式挂在顶层而非 data.entries
            const entries = Array.isArray(book?.entries)
                ? book.entries.map(entry => [entry?.index ?? entry?.uid, entry])
                : Object.entries(book?.entries || book?.data?.entries || {});

            for (const [uid, entry] of entries) {
                const entryIndex = Number.isFinite(entry?.index)
                    ? entry.index
                    : Number.isFinite(uid)
                        ? uid
                        : Number.parseInt(uid, 10);
                const title = entry?.name || entry?.comment || entry?.key?.[0] || `Entry ${uid}`;
                const enabled = entry?.enabled !== undefined ? !!entry.enabled : !entry?.disable;
                items.push({
                    id: `worldinfo-${book?.name}-${entryIndex}`,
                    type: 'worldinfo',
                    title,
                    content: entry?.content || '',
                    metadata: {
                        bookName: book?.name,
                        entryIndex,
                        keywords: entry?.key || entry?.keywords || [],
                        secondaryKeywords: entry?.secondaryKey || entry?.keysecondary || [],
                        enabled,
                        position: entry?.position,
                    },
                });
            }
        }

        return items;
    }

    getBookNames() {
        return this.worldbooks.map(book => book?.name);
    }
}
