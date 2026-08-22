/**
 * JETS 搜索器
 * 负责在索引条目中进行匹配和排序
 */

const DEFAULT_OPTIONS = {
    maxResults: 200,
    getExtraScore: null,
};

function normalizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value).toLowerCase();
}

function getMatchPositions(text, query) {
    const matches = [];
    if (!text || !query) return matches;

    const lowerText = normalizeText(text);
    const lowerQuery = normalizeText(query);

    let index = lowerText.indexOf(lowerQuery);
    while (index !== -1) {
        matches.push({ start: index, end: index + lowerQuery.length });
        index = lowerText.indexOf(lowerQuery, index + lowerQuery.length);
    }

    return matches;
}

function isSubsequence(query, text) {
    if (!query || !text) return false;
    let qi = 0;
    for (let ti = 0; ti < text.length; ti += 1) {
        if (text[ti] === query[qi]) {
            qi += 1;
            if (qi >= query.length) {
                return true;
            }
        }
    }
    return false;
}

export class Searcher {
    constructor(options = {}) {
        this.items = [];
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    add(item) {
        if (item) {
            this.items.push(item);
        }
        return this;
    }

    addBatch(items = []) {
        items.forEach(item => this.add(item));
        return this;
    }

    replaceByType(type, items = []) {
        if (!type) {
            return this;
        }
        const remaining = this.items.filter(item => item?.type !== type);
        this.items = remaining;
        this.addBatch(items);
        return this;
    }

    replaceByFilter(predicate, items = []) {
        if (typeof predicate !== 'function') {
            return this;
        }
        this.items = this.items.filter(item => !predicate(item));
        this.addBatch(items);
        return this;
    }

    clear() {
        this.items = [];
        return this;
    }

    /**
     * @param {string} query 搜索词
     * @param {object} [filters]
     * @param {Set<string>|string[]|null} [filters.types] 允许的条目类型，null 表示全部
     * @param {string[]} [filters.requiredTerms] 必含关键词（AND 叠加），
     *   条目必须同时包含每个关键词才会命中；查询词为空时仅按关键词筛选
     * @param {Function|null} [filters.filter] 条目预过滤（类型过滤之后、匹配之前），
     *   返回 false 的条目直接跳过；用于世界书挂载范围等定向搜索
     * @param {number|null} [filters.maxResults] 本次调用的结果上限，Infinity 表示不设限
     */
    search(query, { types = null, requiredTerms = [], filter = null, maxResults = null } = {}) {
        const normalizedQuery = normalizeText(query).trim();
        const typeSet = types
            ? (types instanceof Set ? types : new Set(Array.from(types || [])))
            : null;
        const terms = (Array.isArray(requiredTerms) ? requiredTerms : [])
            .map(term => normalizeText(term).trim())
            .filter(Boolean);

        if (!normalizedQuery && !terms.length) {
            return [];
        }

        const getExtraScore = typeof this.options.getExtraScore === 'function'
            ? this.options.getExtraScore
            : null;

        const results = [];
        for (const item of this.items) {
            if (typeSet && !typeSet.has(item?.type)) {
                continue;
            }
            if (typeof filter === 'function' && !filter(item)) {
                continue;
            }

            const title = item?.title ?? '';
            const content = item?.content ?? '';

            let termMatches = [];
            let termsSatisfied = true;
            for (const term of terms) {
                const titleTermMatches = getMatchPositions(title, term);
                const contentTermMatches = getMatchPositions(content, term);
                if (!titleTermMatches.length && !contentTermMatches.length) {
                    termsSatisfied = false;
                    break;
                }
                termMatches = termMatches.concat(
                    titleTermMatches.map(match => ({ field: 'title', kind: 'term', ...match })),
                    contentTermMatches.map(match => ({ field: 'content', kind: 'term', ...match })),
                );
            }
            if (!termsSatisfied) {
                continue;
            }

            let score = 0;
            const matches = [];

            if (normalizedQuery) {
                const titleMatches = getMatchPositions(title, normalizedQuery);
                const contentMatches = getMatchPositions(content, normalizedQuery);

                if (titleMatches.length > 0) {
                    score += 100 + titleMatches.length * 10;
                }
                if (contentMatches.length > 0) {
                    score += 50 + contentMatches.length * 5;
                }

                if (score === 0) {
                    const lowerTitle = normalizeText(title);
                    const lowerContent = normalizeText(content);
                    if (isSubsequence(normalizedQuery, lowerTitle)) {
                        score = 30;
                    } else if (isSubsequence(normalizedQuery, lowerContent)) {
                        score = 15;
                    }
                }

                if (score <= 0) {
                    continue;
                }

                matches.push(
                    ...titleMatches.map(match => ({ field: 'title', kind: 'query', ...match })),
                    ...contentMatches.map(match => ({ field: 'content', kind: 'query', ...match })),
                );
            } else {
                // 无查询词：仅按关键词筛选，命中次数越多越靠前
                score = 40 + Math.min(60, termMatches.length);
            }

            if (getExtraScore) {
                const extraScore = Number(getExtraScore(item, normalizedQuery));
                if (Number.isFinite(extraScore) && extraScore !== 0) {
                    score += extraScore;
                    if (score <= 0) {
                        continue;
                    }
                }
            }

            matches.push(...termMatches);
            results.push({ item, score, matches });
        }

        results.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            const titleA = String(a.item?.title ?? '');
            const titleB = String(b.item?.title ?? '');
            return titleA.localeCompare(titleB);
        });

        const cap = maxResults === Infinity
            ? 0
            : Number.isFinite(maxResults) && maxResults > 0
                ? maxResults
                : this.options.maxResults;
        if (cap && results.length > cap) {
            return results.slice(0, cap);
        }

        return results;
    }
}
