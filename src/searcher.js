/**
 * JETS 搜索器
 * 负责在索引条目中进行匹配和排序
 */

const DEFAULT_OPTIONS = {
    maxResults: 200,
    getExtraScore: null,
};

// 性能护栏：命中区间最多记 12 个（摘要只展示前几处，记几百个纯属浪费）；
// 子序列兜底只扫短内容（长内容逐字符比对在无命中查询下是最大隐性开销）；
// 结果爆量后放弃低分条目，避免上万条对象进排序
const MATCH_RANGE_LIMIT = 12;
const SUBSEQUENCE_CONTENT_LIMIT = 1200;
const RESULT_OVERFLOW_LIMIT = 3000;

function normalizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value).toLowerCase();
}

// 小写化是最贵的一步：结果缓存在条目上，后续搜索直接复用。
// 不缓存的话每敲一次键（防抖后）都会把全库内容 toLowerCase 一遍——大聊天库下就是卡顿主因
function getNormalizedTexts(item) {
    let cache = item?._jetsNorm;
    if (!cache) {
        cache = {
            title: normalizeText(item?.title ?? ''),
            content: normalizeText(item?.content ?? ''),
        };
        item._jetsNorm = cache;
    }
    return cache;
}

// 入参均为已小写文本；limit <= 0 表示不限量
function getMatchPositions(lowerText, lowerQuery, limit = MATCH_RANGE_LIMIT) {
    const matches = [];
    if (!lowerText || !lowerQuery) return matches;

    let index = lowerText.indexOf(lowerQuery);
    while (index !== -1) {
        matches.push({ start: index, end: index + lowerQuery.length });
        if (limit > 0 && matches.length >= limit) {
            break;
        }
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

            const norm = getNormalizedTexts(item);

            let termMatches = [];
            let termsSatisfied = true;
            for (const term of terms) {
                const titleTermMatches = getMatchPositions(norm.title, term);
                const contentTermMatches = getMatchPositions(norm.content, term);
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
            let hadTitleMatch = false;

            if (normalizedQuery) {
                const titleMatches = getMatchPositions(norm.title, normalizedQuery);
                const contentMatches = getMatchPositions(norm.content, normalizedQuery);

                if (titleMatches.length > 0) {
                    score += 100 + titleMatches.length * 10;
                    hadTitleMatch = true;
                }
                if (contentMatches.length > 0) {
                    score += 50 + contentMatches.length * 5;
                }

                if (score === 0) {
                    if (isSubsequence(normalizedQuery, norm.title)) {
                        score = 30;
                    } else if (norm.content.length <= SUBSEQUENCE_CONTENT_LIMIT
                        && isSubsequence(normalizedQuery, norm.content)) {
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

            // 爆量保护：条目已远超展示所需时只保留标题命中的（正文命中排序必居后、
            // 渲染根本用不到），别让几万个对象进排序。代价是病理查询下计数偏低，可接受
            if (results.length >= RESULT_OVERFLOW_LIMIT && !hadTitleMatch) {
                continue;
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
