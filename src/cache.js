/**
 * JETS 索引缓存
 * 基于 IndexedDB 持久化已索引的聊天原始数据，
 * 二次加载无需重新请求全部聊天文件。
 */

const DB_NAME = 'st-jets-cache';
const DB_VERSION = 1;
const CHAT_STORE = 'chats';
const META_STORE = 'meta';
const SCHEMA_VERSION = 1;

function openDatabase() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB 不可用'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(CHAT_STORE)) {
                db.createObjectStore(CHAT_STORE, { keyPath: 'chatId' });
            }
            if (!db.objectStoreNames.contains(META_STORE)) {
                db.createObjectStore(META_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败'));
        request.onblocked = () => reject(new Error('IndexedDB 被占用'));
    });
}

export class JetsCache {
    constructor() {
        this.dbPromise = null;
    }

    async getDb() {
        if (!this.dbPromise) {
            this.dbPromise = openDatabase().catch(err => {
                this.dbPromise = null;
                throw err;
            });
        }
        return this.dbPromise;
    }

    async ensureSchema() {
        await this.getDb();
        const current = await this.getMeta('schemaVersion');
        if (current !== SCHEMA_VERSION) {
            await this.clear();
            await this.putMeta('schemaVersion', SCHEMA_VERSION);
        }
    }

    async getChat(chatId) {
        try {
            return await this.runRequest(store => store.get(chatId), 'readonly', CHAT_STORE);
        } catch {
            return null;
        }
    }

    async putChat(record) {
        if (!record?.chatId) return;
        try {
            await this.runRequest(store => store.put(record), 'readwrite', CHAT_STORE);
        } catch {
            // 存储失败时静默降级为无缓存模式
        }
    }

    async deleteChat(chatId) {
        try {
            await this.runRequest(store => store.delete(chatId), 'readwrite', CHAT_STORE);
        } catch {
            // ignore
        }
    }

    /**
     * 游标遍历全部聊天记录，每 batchSize 条让出主线程，避免大库恢复时卡顿。
     * onBatch 回调接收一批记录，可返回 Promise 用于让出前的异步处理。
     */
    async forEachChat(onBatch, batchSize = 100) {
        if (typeof onBatch !== 'function') return;
        let db;
        try {
            db = await this.getDb();
        } catch {
            return;
        }

        await new Promise(resolve => {
            let collected = [];

            const flush = async () => {
                if (!collected.length) return;
                const batch = collected;
                collected = [];
                try {
                    await onBatch(batch);
                } catch (err) {
                    console.warn('JETS: 处理缓存批次失败', err);
                }
            };

            const tx = db.transaction(CHAT_STORE, 'readonly');
            const request = tx.objectStore(CHAT_STORE).openCursor();

            request.onsuccess = async () => {
                const cursor = request.result;
                if (!cursor) {
                    await flush();
                    resolve();
                    return;
                }
                collected.push(cursor.value);
                if (collected.length >= batchSize) {
                    await flush();
                    try {
                        cursor.continue();
                    } catch {
                        resolve();
                    }
                    return;
                }
                cursor.continue();
            };
            request.onerror = () => {
                console.warn('JETS: 读取缓存游标失败', request.error);
                resolve();
            };
        });
    }

    async clear() {
        try {
            await this.runRequest(store => store.clear(), 'readwrite', CHAT_STORE);
            await this.runRequest(store => store.clear(), 'readwrite', META_STORE);
        } catch {
            // ignore
        }
    }

    /**
     * 仅清空聊天索引数据，保留 meta（如 schema 版本），用于「重建索引」。
     */
    async clearChats() {
        try {
            await this.runRequest(store => store.clear(), 'readwrite', CHAT_STORE);
        } catch {
            // ignore
        }
    }

    async getMeta(key) {
        try {
            return await this.runRequest(store => store.get(key), 'readonly', META_STORE);
        } catch {
            return undefined;
        }
    }

    async putMeta(key, value) {
        try {
            await this.runRequest(store => store.put(value, key), 'readwrite', META_STORE);
        } catch {
            // ignore
        }
    }

    runRequest(build, mode, storeName) {
        return new Promise((resolve, reject) => {
            this.getDb().then(database => {
                const tx = database.transaction(storeName, mode);
                const request = build(tx.objectStore(storeName));
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            }).catch(reject);
        });
    }
}

export const jetsCache = new JetsCache();
