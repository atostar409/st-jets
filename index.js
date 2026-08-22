import { toggleDrawer } from '../../../utils.js';
import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import {
    Searcher,
    DataLoader,
    CharacterSource,
    WorldInfoSource,
    PresetSource,
    ChatSource,
    jetsCache,
} from './src/index.js';

let jetsIdCounter = 0;

function getTextFromElement(element) {
    if (!element) return '';
    const text = element.textContent || '';
    return text.replace(/\s+/g, ' ').trim();
}

function findLabelElement(element) {
    if (!element) return null;
    return element.querySelector('[data-i18n]') || element.querySelector('span, strong, label, h3, h4');
}

function buildContent(parts) {
    return parts.filter(Boolean).join(' | ');
}

function normalizeI18nKey(value) {
    if (!value) return '';
    return value.replace(/^\[[^\]]+\]/, '').trim();
}

function ensureJetsSelector(element, prefix = 'settings') {
    if (!element) return null;
    if (element.id) {
        return { id: element.id, selector: `#${element.id}` };
    }
    let marker = element.getAttribute('data-st-jets-id');
    if (!marker) {
        marker = `${prefix}-${++jetsIdCounter}`;
        element.setAttribute('data-st-jets-id', marker);
    }
    return { id: marker, selector: `[data-st-jets-id="${marker}"]` };
}

const PANEL_CONTAINERS = [
    { id: 'rm_extensions_block', key: 'extensions' },
    { id: 'user-settings-block', key: 'user-settings' },
    { id: 'left-nav-panel', key: 'ai-config' },
    { id: 'right-nav-panel', key: 'character-management' },
    { id: 'WorldInfo', key: 'world-info' },
    { id: 'rm_api_block', key: 'system-settings' },
    { id: 'AdvancedFormatting', key: 'advanced-format' },
    { id: 'Backgrounds', key: 'backgrounds' },
    { id: 'PersonaManagement', key: 'persona-management' },
];

function resolvePanelKey(element, fallback = '') {
    if (!element) return fallback;
    for (const panel of PANEL_CONTAINERS) {
        if (element.closest(`#${panel.id}`)) {
            return panel.key;
        }
    }
    return fallback;
}

function collectOptionsMenuItems(seenSelectors) {
    const menu = document.getElementById('options');
    if (!menu) return [];

    const items = [];
    const seenIds = new Set();
    const nodes = menu.querySelectorAll('a[id], button[id]');
    nodes.forEach(node => {
        const id = node.id;
        if (!id || seenIds.has(id)) return;
        seenIds.add(id);

        const labelNode = findLabelElement(node);
        const title = getTextFromElement(labelNode || node);
        if (!title) return;

        const i18nKey = labelNode?.getAttribute?.('data-i18n') || '';
        const tooltip = node.getAttribute('title') || '';
        const content = buildContent([title, i18nKey, tooltip, id]);
        const selector = `#${id}`;
        if (seenSelectors?.has(selector)) return;
        seenSelectors?.add(selector);

        items.push({
            id: `settings-${id}`,
            type: 'settings',
            title,
            content,
            metadata: {
                action: 'click',
                selector,
                usageKey: `settings::options::click::${id}`,
            },
        });
    });

    return items;
}

function collectExtensionContainers(seenSelectors) {
    const container = document.getElementById('rm_extensions_block');
    if (!container) return [];

    const items = [];
    const seenIds = new Set();
    const nodes = container.querySelectorAll('[id$="_container"]');
    nodes.forEach(node => {
        const id = node.id;
        if (!id || seenIds.has(id)) return;
        seenIds.add(id);

        const labelNode = findLabelElement(node);
        const title = getTextFromElement(labelNode);
        if (!title) return;

        const i18nKey = labelNode?.getAttribute?.('data-i18n') || '';
        const content = buildContent([title, i18nKey, id]);
        const selector = `#${id}`;
        if (seenSelectors?.has(selector)) return;
        seenSelectors?.add(selector);

        items.push({
            id: `settings-${id}`,
            type: 'settings',
            title,
            content,
            metadata: {
                action: 'scroll',
                selector,
                panel: 'extensions',
                usageKey: `settings::extensions::scroll::${id}`,
            },
        });
    });

    return items;
}

function collectPanelItems(containerId, panelKey, idPrefix, seenSelectors) {
    const container = document.getElementById(containerId);
    if (!container) return [];

    const items = [];

    const addItem = ({ title, i18nKey, tooltip, target, action = 'reveal' }) => {
        if (!title) return;
        const targetInfo = ensureJetsSelector(target, idPrefix);
        if (!targetInfo || seenSelectors.has(targetInfo.selector)) return;
        seenSelectors.add(targetInfo.selector);

        const stableToken = target?.id || normalizeI18nKey(i18nKey) || title;
        const usageKey = `settings::${panelKey}::${action}::${stableToken}`;

        items.push({
            id: `${idPrefix}-${targetInfo.id}`,
            type: 'settings',
            title,
            content: buildContent([title, i18nKey, tooltip, targetInfo.id]),
            metadata: {
                action,
                selector: targetInfo.selector,
                panel: panelKey,
                usageKey,
            },
        });
    };

    container.querySelectorAll('label').forEach(label => {
        const labelNode = findLabelElement(label) || label;
        const title = getTextFromElement(labelNode);
        if (!title) return;

        const i18nKey = labelNode?.getAttribute?.('data-i18n')
            || label.getAttribute('data-i18n')
            || '';
        const tooltip = label.getAttribute('title') || labelNode?.getAttribute?.('title') || '';

        addItem({ title, i18nKey, tooltip, target: label });
    });

    container.querySelectorAll('span[data-i18n], small[data-i18n], strong[data-i18n], div[data-i18n], h3[data-i18n], h4[data-i18n], p[data-i18n]').forEach(node => {
        if (node.closest('label')) return;
        if (node.closest('.inline-drawer-header, .inline-drawer-toggle')) return;
        const title = getTextFromElement(node);
        if (!title) return;
        const i18nKey = node.getAttribute('data-i18n') || '';
        const tooltip = node.getAttribute('title') || '';

        const wrapper = node.closest('.flex-container, .alignItemsBaseline, .title_restorable, .range-block, .range-block-title, .range-block-input, .checkbox_label, .inline-drawer, .wide100p')
            || node.parentElement;
        const interactive = wrapper?.querySelector?.('input, select, textarea, button, .menu_button, .menu_button_icon') || node;
        addItem({ title, i18nKey, tooltip, target: interactive });
    });

    return items;
}

function isLikelyClickable(element) {
    if (!element) return false;
    if (element.matches?.('button, a, input, select, textarea')) return true;
    if (element.getAttribute?.('role') === 'button') return true;
    if (element.hasAttribute?.('onclick')) return true;
    if (element.tabIndex >= 0) return true;
    return element.classList?.contains('menu_button')
        || element.classList?.contains('menu_button_icon')
        || element.classList?.contains('right_menu_button')
        || element.classList?.contains('drawer-icon')
        || element.classList?.contains('interactable');
}

function getHighlightTarget(element) {
    if (!element) return null;
    return element.closest?.('.checkbox_label, .range-block, .inline-drawer, .flex-container, .menu_button, .menu_button_icon, .drawer-icon, .right_menu_button')
        || element;
}

function applyHighlight(element) {
    const target = getHighlightTarget(element);
    if (!target) return;
    target.classList.add('st-jets-target');
    setTimeout(() => target.classList.remove('st-jets-target'), 1200);
}

function scoreItem(item) {
    if (!item) return 0;
    let score = 0;
    const action = item.metadata?.action;
    if (action === 'click') score += 5;
    if (action === 'scroll') score += 3;
    if (action === 'reveal') score += 2;

    const selector = item.metadata?.selector;
    if (selector) {
        const target = document.querySelector(selector);
        if (target) {
            if (isElementVisible(target)) score += 5;
            if (isLikelyClickable(target)) score += 3;
            if (target.matches?.('input, select, textarea, button')) score += 2;
        }
    }

    const contentLength = item.content?.length ?? 0;
    score += Math.min(2, Math.floor(contentLength / 40));

    if (item.metadata?.panel) score += 1;
    return score;
}

function dedupeItems(items) {
    const map = new Map();
    for (const item of items) {
        const title = (item?.title || '').trim();
        if (!title) continue;
        const panel = item?.metadata?.panel || '';
        const key = `${panel}::${title.toLowerCase()}`;
        const existing = map.get(key);
        if (!existing || scoreItem(item) > scoreItem(existing)) {
            map.set(key, item);
        }
    }
    return Array.from(map.values());
}

function extractButtonLabel(element) {
    if (!element) return { title: '', i18nKey: '', tooltip: '' };
    const labelNode = findLabelElement(element);
    const textTitle = getTextFromElement(labelNode || element);
    const rawI18n = element.getAttribute('data-i18n')
        || labelNode?.getAttribute?.('data-i18n')
        || '';
    const i18nKey = rawI18n;
    const i18nLabel = normalizeI18nKey(rawI18n);
    const tooltip = element.getAttribute('title')
        || element.getAttribute('aria-label')
        || '';
    const title = textTitle || tooltip || i18nLabel;
    return { title, i18nKey, tooltip };
}

function collectActionButtons(root, panelKey, idPrefix, seenSelectors) {
    if (!root) return [];
    const items = [];
    const candidates = root.querySelectorAll('.menu_button, .menu_button_icon, .right_menu_button, .drawer-icon, .interactable');

    candidates.forEach(candidate => {
        if (candidate.closest('#st-jets-container')) return;
        const target = candidate.classList.contains('menu_button_icon')
            ? (candidate.closest('.menu_button') || candidate)
            : candidate;
        if (target.id && target.id.startsWith('st-jets')) return;
        if (!isLikelyClickable(target)) return;

        const { title, i18nKey, tooltip } = extractButtonLabel(target);
        if (!title) return;

        const targetInfo = ensureJetsSelector(target, idPrefix);
        if (!targetInfo || seenSelectors.has(targetInfo.selector)) return;
        seenSelectors.add(targetInfo.selector);

        const resolvedPanel = resolvePanelKey(target, panelKey);
        const stableToken = target?.id || normalizeI18nKey(i18nKey) || title;
        const usageKey = `settings::${resolvedPanel || panelKey || ''}::click::${stableToken}`;
        items.push({
            id: `${idPrefix}-${targetInfo.id}`,
            type: 'settings',
            title,
            content: buildContent([title, i18nKey, tooltip, targetInfo.id]),
            metadata: {
                action: 'click',
                selector: targetInfo.selector,
                panel: resolvedPanel || undefined,
                usageKey,
            },
        });
    });

    return items;
}

class SettingsSource {
    constructor(options = {}) {
        this.options = {
            includeOptionsMenu: true,
            includeExtensions: true,
            includeUserSettings: true,
            includeAiConfig: true,
            includeCharacterManagement: true,
            includeWorldInfoPanel: true,
            includeExtensionSettings: true,
            includeSystemSettings: true,
            includeAdvancedFormatting: true,
            includeBackgrounds: true,
            includePersonaManagement: true,
            includeActionButtons: true,
            ...options,
        };
    }

    async load() {
        return this.collectItems();
    }

    toIndexItems(items) {
        if (Array.isArray(items)) {
            return items;
        }
        return this.collectItems();
    }

    collectItems() {
        if (typeof document === 'undefined') {
            return [];
        }

        const items = [];
        const seenSelectors = new Set();
        if (this.options.includeOptionsMenu) {
            items.push(...collectOptionsMenuItems(seenSelectors));
        }
        if (this.options.includeExtensions) {
            items.push(...collectExtensionContainers(seenSelectors));
        }
        if (this.options.includeUserSettings) {
            items.push(...collectPanelItems('user-settings-block', 'user-settings', 'settings-user', seenSelectors));
        }
        if (this.options.includeAiConfig) {
            items.push(...collectPanelItems('left-nav-panel', 'ai-config', 'settings-ai', seenSelectors));
        }
        if (this.options.includeCharacterManagement) {
            items.push(...collectPanelItems('right-nav-panel', 'character-management', 'settings-char', seenSelectors));
        }
        if (this.options.includeWorldInfoPanel) {
            items.push(...collectPanelItems('WorldInfo', 'world-info', 'settings-world', seenSelectors));
        }
        if (this.options.includeExtensionSettings) {
            items.push(...collectPanelItems('rm_extensions_block', 'extensions', 'settings-ext', seenSelectors));
        }
        if (this.options.includeSystemSettings) {
            items.push(...collectPanelItems('rm_api_block', 'system-settings', 'settings-sys', seenSelectors));
        }
        if (this.options.includeAdvancedFormatting) {
            items.push(...collectPanelItems('AdvancedFormatting', 'advanced-format', 'settings-format', seenSelectors));
        }
        if (this.options.includeBackgrounds) {
            items.push(...collectPanelItems('Backgrounds', 'backgrounds', 'settings-bg', seenSelectors));
        }
        if (this.options.includePersonaManagement) {
            items.push(...collectPanelItems('PersonaManagement', 'persona-management', 'settings-persona', seenSelectors));
        }
        if (this.options.includeActionButtons) {
            items.push(...collectActionButtons(document, '', 'settings-action', seenSelectors));
        }
        return dedupeItems(items);
    }
}

const TYPE_LABELS = {
    character: '角色卡',
    chat: '聊天',
    chat_message: '聊天消息',
    worldinfo: '世界书',
    preset: '预设',
    quickreply: '快捷回复',
    regex: '正则',
    settings: '设置',
    other: '其他',
};

// 搜索分类：「全部」是总控——三个具体分类全亮时它自动跟着亮；
// 全亮时点它一键全灭，未全亮时点它一键全开，具体分类各自独立开关
const CATEGORIES = [
    { id: 'character', label: '角色/聊天', icon: 'fa-solid fa-user-group', color: '#7dd3fc', types: ['character', 'chat', 'chat_message'] },
    { id: 'worldinfo', label: '世界书', icon: 'fa-solid fa-book-bookmark', color: '#c4b5fd', types: ['worldinfo'] },
    { id: 'preset', label: '预设', icon: 'fa-solid fa-sliders', color: '#f472b6', types: ['preset'] },
];
const ALL_CATEGORY_IDS = CATEGORIES.map(category => category.id);

const STATIC_ITEMS = [
    {
        id: 'quickreply-1',
        type: 'quickreply',
        title: 'Quick Reply Settings',
        content: 'quick reply extension 快捷回复 设置',
        metadata: {},
    },
    {
        id: 'regex-1',
        type: 'regex',
        title: 'Regex Settings',
        content: 'regex scripts and presets 正则 设置',
        metadata: {},
    },
];

const USAGE_STORAGE_KEY = 'st-jets-usage';
const USAGE_MAX_ENTRIES = 500;
let usageStatsCache = null;

function loadUsageStats() {
    if (typeof localStorage === 'undefined') return {};
    try {
        const raw = localStorage.getItem(USAGE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function saveUsageStats(stats) {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(stats || {}));
    } catch {
        // ignore
    }
}

function getUsageStats() {
    if (!usageStatsCache) {
        usageStatsCache = loadUsageStats();
    }
    return usageStatsCache;
}

function getUsageKey(item) {
    const explicit = item?.metadata?.usageKey;
    if (explicit) return String(explicit);
    if (!item?.id) return '';
    return `${item?.type || 'unknown'}::${item.id}`;
}

function trimUsageStats(stats) {
    const entries = Object.entries(stats || {});
    if (entries.length <= USAGE_MAX_ENTRIES) return stats || {};
    entries.sort((a, b) => (Number(b[1]?.lastUsed) || 0) - (Number(a[1]?.lastUsed) || 0));
    return Object.fromEntries(entries.slice(0, USAGE_MAX_ENTRIES));
}

function recordUsage(item) {
    const key = getUsageKey(item);
    if (!key) return;
    const stats = getUsageStats();
    const now = Date.now();
    const prev = stats[key];
    const count = Math.max(0, Number(prev?.count) || 0);
    stats[key] = { count: count + 1, lastUsed: now };
    const trimmed = trimUsageStats(stats);
    usageStatsCache = trimmed;
    saveUsageStats(trimmed);
}

function getUsageExtraScore(item) {
    const key = getUsageKey(item);
    if (!key) return 0;
    const stats = getUsageStats();
    const usage = stats[key];
    if (!usage) return 0;

    const count = Math.max(0, Number(usage?.count) || 0);
    const lastUsed = Number(usage?.lastUsed) || 0;
    let score = Math.min(20, count * 2);

    const age = Date.now() - lastUsed;
    if (Number.isFinite(age) && age >= 0) {
        if (age < 3600000) score += 10;
        else if (age < 86400000) score += 5;
    }

    return score;
}

// ===== 插件设置（保存于 SillyTavern extension_settings，随酒馆设置备份迁移） =====

const DEFAULT_REASONING_TAGS = ['think', 'thinking', 'reasoning'];
const MAX_REASONING_TAGS = 12;
const MAX_PINNED_TERMS = 30;

function getJetsSettings() {
    let settings = extension_settings?.stJets;
    if (!settings || typeof settings !== 'object') {
        settings = {};
        if (extension_settings) {
            extension_settings.stJets = settings;
        }
    }

    // categories 语义：存「当前点亮的分类 id」——全量 = 全亮（含总控「全部」），空数组 = 一个没亮（搜不到任何东西）
    const knownIds = new Set(ALL_CATEGORY_IDS);
    if (Array.isArray(settings.categories)) {
        settings.categories = settings.categories.filter(id => knownIds.has(id));
        // 旧版（互斥逻辑）把空数组当「全部」：迁移成全量；新版里空数组是「全灭」
        if (!settings.chipsMasterLogic) {
            if (!settings.categories.length) {
                settings.categories = [...ALL_CATEGORY_IDS];
            }
            settings.chipsMasterLogic = true;
        }
    }
    else {
        settings.categories = [...ALL_CATEGORY_IDS];
        settings.chipsMasterLogic = true;
    }

    if (typeof settings.stripReasoning !== 'boolean') {
        settings.stripReasoning = true;
    }

    // 面板外观主题：default（默认深色）/ galaxy（星空液态玻璃）
    if (settings.theme !== 'galaxy' && settings.theme !== 'default') {
        settings.theme = 'default';
    }

    if (!Array.isArray(settings.reasoningTags)) {
        settings.reasoningTags = [...DEFAULT_REASONING_TAGS];
    }
    settings.reasoningTags = settings.reasoningTags
        .map(tag => String(tag || '').trim().toLowerCase())
        .filter(Boolean)
        .slice(0, MAX_REASONING_TAGS);

    if (!Array.isArray(settings.pinnedTerms)) {
        settings.pinnedTerms = [];
    }
    const seenPins = new Set();
    settings.pinnedTerms = settings.pinnedTerms
        .map(term => (typeof term === 'string' ? { text: term, enabled: true } : term))
        .filter(term => term && typeof term.text === 'string' && term.text.trim())
        .map(term => ({ text: term.text.trim().slice(0, 24), enabled: term.enabled !== false }))
        .filter(term => {
            if (seenPins.has(term.text)) return false;
            seenPins.add(term.text);
            return true;
        })
        .slice(0, MAX_PINNED_TERMS);

    return settings;
}

function saveJetsSettings() {
    if (typeof saveSettingsDebounced === 'function') {
        saveSettingsDebounced();
    }
}

// 把当前主题套到弹窗容器上（galaxy = 星空液态玻璃，其余 = 默认深色）
function applyJetsTheme() {
    const root = document.getElementById('st-jets-container');
    if (!root) return;
    root.classList.toggle('st-jets-theme-galaxy', getJetsSettings().theme === 'galaxy');
}

function getActiveTypes() {
    const settings = getJetsSettings();
    const enabled = new Set(settings.categories);
    if (enabled.size >= ALL_CATEGORY_IDS.length) {
        return null; // 全亮 = 不限类型
    }
    const types = new Set();
    for (const category of CATEGORIES) {
        if (enabled.has(category.id)) {
            category.types.forEach(type => types.add(type));
        }
    }
    return types; // 可能为空集合：一个分类都没亮，什么也搜不到
}

function getPinnedTerms() {
    return getJetsSettings().pinnedTerms;
}

function getEnabledPinnedTerms() {
    return getPinnedTerms().filter(term => term.enabled).map(term => term.text);
}

function addPinnedTerm(text) {
    const value = String(text || '').trim().slice(0, 24);
    if (!value) return;
    const settings = getJetsSettings();
    if (settings.pinnedTerms.some(term => term.text === value)) return;
    settings.pinnedTerms.push({ text: value, enabled: true });
    saveJetsSettings();
    renderPinChips();
    rerunSearchIfOpen();
}

function removePinnedTerm(text) {
    const settings = getJetsSettings();
    settings.pinnedTerms = settings.pinnedTerms.filter(term => term.text !== text);
    saveJetsSettings();
    renderPinChips();
    rerunSearchIfOpen();
}

function togglePinnedTerm(text) {
    const settings = getJetsSettings();
    const term = settings.pinnedTerms.find(item => item.text === text);
    if (!term) return;
    term.enabled = !term.enabled;
    saveJetsSettings();
    renderPinChips();
    rerunSearchIfOpen();
}

// ===== 思维链（推理标签）过滤 =====

let reasoningRegexCache = null;
let reasoningRegexKey = '';

function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getReasoningRegex() {
    const tags = getJetsSettings().reasoningTags;
    if (!tags.length) return null;
    const key = tags.join('|');
    if (reasoningRegexCache && reasoningRegexKey === key) {
        return reasoningRegexCache;
    }
    const names = tags.map(escapeRegExp).join('|');
    reasoningRegexCache = new RegExp(
        `<(${names})(?:\\s[^>]*)?>[\\s\\S]*?</\\1\\s*>`   // 闭合块 <think>…</think>
        + `|<(${names})(?:\\s[^>]*)?>[\\s\\S]*$`,          // 未闭合块：<think>… 直到结尾
        'gi',
    );
    reasoningRegexKey = key;
    return reasoningRegexCache;
}

function stripReasoningBlocks(value) {
    if (!value) return value;
    const regex = getReasoningRegex();
    if (!regex) return value;
    return String(value).replace(regex, '');
}

function processMessageContent(value) {
    const settings = getJetsSettings();
    if (!settings.stripReasoning) return value;
    return stripReasoningBlocks(value);
}

const searcher = new Searcher({
    maxResults: 50,
    getExtraScore: (item) => getUsageExtraScore(item),
});
searcher.addBatch([...STATIC_ITEMS]);

function registerTestApi() {
    if (typeof window === 'undefined') return;
    if (!window.__stJetsTest) {
        window.__stJetsTest = {};
    }
    if (typeof window.__stJetsTest.addItems !== 'function') {
        window.__stJetsTest.addItems = (items = []) => {
            searcher.addBatch(items);
        };
    }
}

const characterSource = new CharacterSource();
characterSource.type = 'character';

const worldInfoSource = new WorldInfoSource();
worldInfoSource.type = 'worldinfo';

const presetContextSource = new PresetSource([], 'context');
presetContextSource.type = 'preset:context';

const presetInstructSource = new PresetSource([], 'instruct');
presetInstructSource.type = 'preset:instruct';

const presetSyspromptSource = new PresetSource([], 'sysprompt');
presetSyspromptSource.type = 'preset:sysprompt';

const chatSource = new ChatSource([], {
    includeMessages: false,
    maxMessagesPerChat: Number.POSITIVE_INFINITY,
    listMax: Number.MAX_SAFE_INTEGER,
    processContent: processMessageContent,
});
chatSource.type = 'chat';

const settingsSource = new SettingsSource();
settingsSource.type = 'settings';

const dataLoader = new DataLoader({
    sources: [
        characterSource,
        worldInfoSource,
        presetContextSource,
        presetInstructSource,
        presetSyspromptSource,
        chatSource,
        settingsSource,
    ],
    maxRetries: 1,
});

let indexLoadPromise = null;
let settingsIndexDirty = true;

// ===== IndexedDB 缓存辅助 =====

const cacheChatMeta = new Map(); // chatId -> { signature, messageCount }

function updateIndexStatusUi() {
    const chatCount = cacheChatMeta.size;
    const messageCount = Array.from(cacheChatMeta.values())
        .reduce((sum, meta) => sum + (meta.messageCount || 0), 0);
    const status = document.getElementById('st-jets-index-status');
    if (status) {
        status.textContent = `已索引 ${chatCount} 个聊天 · ${messageCount} 条消息`;
    }
}

function computeChatSignature(chat) {
    return JSON.stringify([
        chat?.file_name || chat?.fileName || '',
        chat?.file_id || chat?.fileId || '',
        chat?.file_size || '',
        chat?.chat_items ?? chat?.messageCount ?? '',
        chat?.last_mes ?? '',
    ]);
}

function pseudoChatFromRecord(record) {
    return {
        characterName: record.characterName || '',
        avatar: record.avatar || '',
        groupId: record.groupId || '',
        group: record.groupId || '',
        fileId: record.fileId || record.chatId,
        file_id: record.fileId || record.chatId,
        fileName: record.fileName || '',
        file_name: record.fileName || '',
        preview_message: record.preview || '',
        last_mes: record.lastMessageAt || '',
        chat_items: Array.isArray(record.messages) ? record.messages.length : 0,
        messages: record.messages || [],
    };
}

function cacheRecordFromChat(chat, messages, signature) {
    const chatItem = chatSource.buildChatItem(chat, 0);
    const slimMessages = (Array.isArray(messages) ? messages : [])
        .map((message, index) => ({
            mes: String(message?.mes ?? ''),
            name: message?.name || (message?.is_user ? 'User' : ''),
            is_user: !!message?.is_user,
            is_system: !!message?.is_system,
            index,
        }))
        .filter(message => message.mes.trim());
    return {
        chatId: chatItem?.metadata?.chatId || '',
        signature: signature || '',
        characterName: chatItem?.metadata?.characterName || '',
        avatar: chatItem?.metadata?.avatar || '',
        groupId: chatItem?.metadata?.groupId || '',
        fileId: chatItem?.metadata?.fileId || '',
        fileName: chatItem?.metadata?.fileName || '',
        preview: chatItem?.content || '',
        lastMessageAt: chatItem?.metadata?.lastMessageAt || '',
        messages: slimMessages,
    };
}

function appendChatItemsWithoutDuplicates(items = []) {
    const existingChatIds = new Set(
        searcher.items.filter(item => item?.type === 'chat').map(item => item.id),
    );
    for (const item of items) {
        if (item?.type === 'chat') {
            if (existingChatIds.has(item.id)) continue;
            existingChatIds.add(item.id);
        }
        searcher.add(item);
    }
}

/**
 * 从 IndexedDB 恢复聊天索引：零网络请求，分批构建并周期性让出主线程。
 */
async function restoreChatIndexFromCache() {
    try {
        await jetsCache.ensureSchema();
        const pseudoChats = [];
        await jetsCache.forEachChat(records => {
            for (const record of records) {
                cacheChatMeta.set(record.chatId, {
                    signature: record.signature,
                    messageCount: Array.isArray(record.messages) ? record.messages.length : 0,
                });
                pseudoChats.push(pseudoChatFromRecord(record));
            }
        });

        const BATCH = 100;
        for (let i = 0; i < pseudoChats.length; i += BATCH) {
            const items = chatSource.toIndexItems(pseudoChats.slice(i, i + BATCH), { includeMessages: true });
            appendChatItemsWithoutDuplicates(items);
            await new Promise(resolve => setTimeout(resolve, 0)); // 让出主线程
        }
        updateIndexStatusUi();
    } catch (err) {
        console.warn('JETS: 从缓存恢复索引失败', err);
    }
}

/**
 * 思维链过滤开关/标签变更后，从缓存的原始数据即时重建消息条目（无需重新请求网络）。
 */
function rebuildChatItemsFromCache() {
    searcher.replaceByFilter(item => item?.type === 'chat_message', []);
    void restoreChatIndexFromCache().then(() => rerunSearchIfOpen());
}

async function rebuildChatIndex() {
    resetBackgroundChatIndexing();
    searcher.replaceByFilter(item => item?.type === 'chat' || item?.type === 'chat_message', []);
    cacheChatMeta.clear();
    await jetsCache.clearChats();
    startBackgroundChatIndexing();
    updateIndexStatusUi();
}

// ===== 启动调度：等待 APP_READY + 空闲时段，不与其他扩展抢加载关键路径 =====

function waitForAppReady(timeoutMs = 20000) {
    return new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if (!settled) {
                settled = true;
                resolve();
            }
        };
        const tryBind = (attempts = 0) => {
            const context = getContextFromGlobal();
            const eventSource = context?.eventSource;
            const eventTypes = context?.eventTypes;
            if (eventSource?.once && eventTypes?.APP_READY) {
                eventSource.once(eventTypes.APP_READY, finish);
                setTimeout(finish, timeoutMs);
                return;
            }
            if (attempts < 40) {
                setTimeout(() => tryBind(attempts + 1), 500);
            } else {
                finish();
            }
        };
        tryBind();
    });
}

function scheduleIdle(callback, timeout = 4000) {
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(callback, { timeout });
    } else {
        setTimeout(callback, 150);
    }
}

async function performStartupLoad() {
    // 1. 本地缓存先行：二次加载毫秒级可搜
    await restoreChatIndexFromCache();
    // 2. 轻量数据源（角色 / 世界书 / 预设 / 设置 / 聊天列表）
    const items = await dataLoader.loadAll({ force: false });
    const nonChatItems = items.filter(item => item?.type !== 'chat');
    const chatListItems = items.filter(item => item?.type === 'chat');
    // 保留缓存恢复出的 chat_message，其余整体替换
    searcher.replaceByFilter(item => item?.type !== 'chat_message', []);
    searcher.addBatch([...STATIC_ITEMS, ...nonChatItems, ...chatListItems]);
    // 3. 仅把新增/变更的聊天排入后台增量索引
    startBackgroundChatIndexing();
    // 4. 兜底：世界书/预设依赖的客户端数据偶发晚就绪，首次空手而归时延迟强刷一次
    if (!nonChatItems.some(item => item?.type === 'worldinfo' || item?.type === 'preset')) {
        setTimeout(() => { void refreshWorldInfoAndPresetIndex(); }, 15000);
    }
}

function ensureDataLoaded() {
    if (!indexLoadPromise) {
        indexLoadPromise = (async () => {
            await waitForAppReady();
            await new Promise(resolve => scheduleIdle(resolve));
            await performStartupLoad();
        })();
    }
    return indexLoadPromise;
}

async function refreshSettingsIndex() {
    const items = await dataLoader.loadByType('settings', { force: true });
    searcher.replaceByType('settings', items);
    return items;
}

// 世界书 + 三类预设：晚就绪兜底用，整类替换避免与旧条目重复
const LIGHT_SOURCE_TYPES = ['worldinfo', 'preset:context', 'preset:instruct', 'preset:sysprompt'];

async function refreshWorldInfoAndPresetIndex() {
    const results = await Promise.all(LIGHT_SOURCE_TYPES.map(type =>
        dataLoader.loadByType(type, { force: true }).catch(err => {
            console.warn(`JETS: 重载 ${type} 失败`, err);
            return [];
        }),
    ));
    const items = results.flat().filter(Boolean);
    if (!items.length) return;
    for (const type of ['worldinfo', 'preset']) {
        searcher.replaceByType(type, items.filter(item => item?.type === type));
    }
    rerunSearchIfOpen();
}

const BACKGROUND_CHAT_BATCH_SIZE = 3;
let backgroundChatQueue = [];
let backgroundChatRunning = false;
let backgroundIdleHandle = null;
let backgroundPaused = false; // AI 生成期间暂停后台索引，避免抢占资源

function resetBackgroundChatIndexing() {
    backgroundChatQueue = [];
    backgroundChatRunning = false;
    if (backgroundIdleHandle) {
        if (typeof cancelIdleCallback === 'function') {
            cancelIdleCallback(backgroundIdleHandle);
        } else {
            clearTimeout(backgroundIdleHandle);
        }
        backgroundIdleHandle = null;
    }
}

function scheduleBackgroundChatWork() {
    if (backgroundIdleHandle) return;
    const run = () => {
        backgroundIdleHandle = null;
        void processBackgroundChatQueue();
    };
    if (typeof requestIdleCallback === 'function') {
        backgroundIdleHandle = requestIdleCallback(run, { timeout: 3000 });
    } else {
        backgroundIdleHandle = setTimeout(run, 120);
    }
}

async function processBackgroundChatQueue() {
    if (backgroundPaused) return;
    if (!backgroundChatQueue.length) {
        backgroundChatRunning = false;
        updateIndexStatusUi();
        return;
    }
    const batch = backgroundChatQueue.splice(0, BACKGROUND_CHAT_BATCH_SIZE);
    await indexChatMessagesBatch(batch);
    updateIndexStatusUi();
    scheduleBackgroundChatWork();
}

async function indexChatMessagesBatch(chats = []) {
    const includeSystem = !!chatSource.options?.includeSystem;
    const maxMessagesPerChat = Number.isFinite(chatSource.options?.maxMessagesPerChat)
        ? chatSource.options.maxMessagesPerChat
        : Number.POSITIVE_INFINITY;

    await Promise.all(chats.map(async ({ chat, signature }) => {
        if (!chat) return;
        try {
            const chatItem = chatSource.buildChatItem(chat, 0);
            const chatId = chatItem?.metadata?.chatId;
            if (!chatId) return;

            const messages = await chatSource.loadMessagesForChat(chat);
            const messageItems = [];
            let added = 0;
            messages.forEach((message, messageIndex) => {
                if (added >= maxMessagesPerChat) {
                    return;
                }
                if (!String(message?.mes ?? '').trim()) return;
                if (!includeSystem && message?.is_system) return;
                const item = chatSource.buildMessageItem(chat, message, messageIndex, chatItem);
                if (!item.content.trim()) return;
                messageItems.push(item);
                added += 1;
            });

            searcher.replaceByFilter(item => {
                return item?.type === 'chat_message' && item?.metadata?.chatId === chatId;
            }, messageItems);

            const record = cacheRecordFromChat(chat, messages, signature);
            if (record.chatId) {
                await jetsCache.putChat(record);
                cacheChatMeta.set(record.chatId, {
                    signature: record.signature,
                    messageCount: record.messages.length,
                });
            }
        } catch (err) {
            console.warn('JETS: 背景索引聊天失败', err);
        }
    }));
}

function startBackgroundChatIndexing() {
    const chats = Array.isArray(chatSource.chats) ? chatSource.chats : [];
    if (!chats.length) {
        return;
    }

    // 增量索引：只排队缓存缺失或签名变更（新增/更新）的聊天
    const pending = [];
    for (const chat of chats) {
        const signature = computeChatSignature(chat);
        const chatId = chatSource.buildChatItem(chat, 0)?.metadata?.chatId;
        if (!chatId) continue;
        const cached = cacheChatMeta.get(chatId);
        if (cached && cached.signature === signature) continue;
        pending.push({ chat, signature });
    }
    if (!pending.length) {
        return;
    }

    backgroundChatQueue = backgroundChatRunning
        ? backgroundChatQueue.concat(pending)
        : pending;
    backgroundChatRunning = true;
    scheduleBackgroundChatWork();
}

let liveChatIndexBound = false;
let liveChatIndexInitAttempts = 0;
let liveChatIndexTimer = null;

function buildLiveChatSnapshot(context) {
    if (!context) return null;
    const messages = Array.isArray(context.chat) ? context.chat : [];
    const isGroup = !!context.groupId;
    const groupId = context.groupId || '';
    let characterName = '';
    let avatar = '';
    let fileId = '';
    let fileName = '';

    if (isGroup) {
        const group = context.groups?.find(item => String(item?.id) === String(groupId));
        fileId = group?.chat_id || context.chatId || '';
        fileName = fileId || '';
    } else {
        const character = context.characters?.[context.characterId];
        characterName = character?.name || character?.data?.name || '';
        avatar = character?.avatar || '';
        fileId = context.chatId || character?.chat || '';
        fileName = fileId || '';
    }

    const lastMessage = messages.length ? messages[messages.length - 1] : null;
    return {
        characterName,
        avatar,
        groupId,
        group: groupId,
        group_id: groupId,
        fileId,
        file_id: fileId,
        fileName,
        file_name: fileName,
        preview_message: lastMessage?.mes || '',
        lastMessage,
        messages,
    };
}

function refreshLiveChatIndex() {
    const context = getContextFromGlobal();
    if (!context?.chat) return false;
    const snapshot = buildLiveChatSnapshot(context);
    if (!snapshot) return false;

    const items = chatSource.toIndexItems([snapshot], { includeMessages: true });
    const chatItem = items.find(item => item?.type === 'chat');
    const chatId = chatItem?.metadata?.chatId;
    if (!chatId) return false;

    searcher.replaceByFilter(item => {
        if (!item) return false;
        if (item.type !== 'chat' && item.type !== 'chat_message') return false;
        return item?.metadata?.chatId === chatId;
    }, items);

    // 写穿缓存：当前聊天的最新内容立即持久化，下次启动免重新请求
    const messages = Array.isArray(context.chat) ? context.chat : [];
    const signature = cacheChatMeta.get(chatId)?.signature || `live:${messages.length}`;
    const record = cacheRecordFromChat(snapshot, messages, signature);
    if (record.chatId) {
        void jetsCache.putChat(record).then(() => {
            cacheChatMeta.set(record.chatId, {
                signature: record.signature,
                messageCount: record.messages.length,
            });
            updateIndexStatusUi();
        });
    }
    return true;
}

function scheduleLiveChatIndexRefresh(delay = 120) {
    if (liveChatIndexTimer) {
        clearTimeout(liveChatIndexTimer);
    }
    liveChatIndexTimer = setTimeout(() => {
        liveChatIndexTimer = null;
        refreshLiveChatIndex();
    }, delay);
}

function bindLiveChatIndexing() {
    if (liveChatIndexBound) return;
    const context = getContextFromGlobal();
    const eventSource = context?.eventSource;
    const eventTypes = context?.eventTypes;
    if (!eventSource || !eventTypes) {
        liveChatIndexInitAttempts += 1;
        if (liveChatIndexInitAttempts < 10) {
            setTimeout(bindLiveChatIndexing, 500);
        }
        return;
    }

    const handler = () => scheduleLiveChatIndexRefresh();
    const events = [
        eventTypes.MESSAGE_SENT,
        eventTypes.MESSAGE_RECEIVED,
        eventTypes.MESSAGE_EDITED,
        eventTypes.MESSAGE_UPDATED,
        eventTypes.MESSAGE_DELETED,
        eventTypes.MESSAGE_SWIPED,
        eventTypes.MESSAGE_SWIPE_DELETED,
        eventTypes.MORE_MESSAGES_LOADED,
        eventTypes.CHAT_CHANGED,
    ];
    events.forEach(type => eventSource.on(type, handler));

    // AI 生成期间暂停后台索引，结束后恢复
    if (eventTypes.GENERATION_STARTED) {
        eventSource.on(eventTypes.GENERATION_STARTED, () => {
            backgroundPaused = true;
        });
    }
    [eventTypes.GENERATION_STOPPED, eventTypes.GENERATION_ENDED].forEach(type => {
        if (!type) return;
        eventSource.on(type, () => {
            backgroundPaused = false;
            if (backgroundChatRunning && backgroundChatQueue.length) {
                scheduleBackgroundChatWork();
            }
        });
    });

    // 酒馆设置变更后，下次打开搜索框再重扫设置面板
    if (eventTypes.SETTINGS_UPDATED) {
        eventSource.on(eventTypes.SETTINGS_UPDATED, () => {
            settingsIndexDirty = true;
        });
    }

    liveChatIndexBound = true;
    scheduleLiveChatIndexRefresh(0);
}

let isOpen = false;
let selectedIndex = -1;
let currentResults = [];
let searchTimer = null;
let queryWatcher = null;
let lastQuery = '';

let container;
let overlay;
let modal;
let input;
let results;

function ensureDom() {
    if (document.getElementById('st-jets-container')) {
        container = document.getElementById('st-jets-container');
        overlay = document.getElementById('st-jets-overlay');
        modal = document.getElementById('st-jets-modal');
        input = document.getElementById('st-jets-input');
        results = document.getElementById('st-jets-results');
        return;
    }

    container = document.createElement('div');
    container.id = 'st-jets-container';
    container.setAttribute('aria-hidden', 'true');

    overlay = document.createElement('div');
    overlay.id = 'st-jets-overlay';

    modal = document.createElement('div');
    modal.id = 'st-jets-modal';

    // 星空液态玻璃主题的背景层（默认主题下隐藏，纯装饰不拦截点击）
    const galaxyLayer = document.createElement('div');
    galaxyLayer.id = 'st-jets-galaxy-layer';

    const header = document.createElement('div');
    header.id = 'st-jets-header';

    input = document.createElement('input');
    input.id = 'st-jets-input';
    input.type = 'text';
    input.placeholder = '搜索角色 / 聊天 / 世界书 / 预设…';
    input.autocomplete = 'off';
    input.setAttribute('enterkeyhint', 'search');

    const settingsButton = document.createElement('div');
    settingsButton.id = 'st-jets-settings-toggle';
    settingsButton.className = 'fa-solid fa-gear';
    settingsButton.title = '设置';
    settingsButton.setAttribute('aria-label', '设置');
    settingsButton.setAttribute('role', 'button');
    settingsButton.tabIndex = 0;
    settingsButton.addEventListener('click', event => {
        event.stopPropagation();
        toggleSettingsPanel();
    });
    settingsButton.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleSettingsPanel();
        }
    });

    const closeButton = document.createElement('div');
    closeButton.id = 'st-jets-close';
    closeButton.className = 'fa-solid fa-xmark';
    closeButton.title = '关闭';
    closeButton.setAttribute('aria-label', '关闭');
    closeButton.setAttribute('role', 'button');
    closeButton.tabIndex = 0;
    closeButton.addEventListener('click', event => {
        event.stopPropagation();
        closeJets();
    });
    closeButton.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            closeJets();
        }
    });

    header.appendChild(input);
    header.appendChild(settingsButton);
    header.appendChild(closeButton);

    const toolbar = document.createElement('div');
    toolbar.id = 'st-jets-toolbar';

    const categoriesRow = document.createElement('div');
    categoriesRow.id = 'st-jets-categories';
    categoriesRow.className = 'st-jets-chip-row';

    const pinsRow = document.createElement('div');
    pinsRow.id = 'st-jets-pins';
    pinsRow.className = 'st-jets-chip-row';

    toolbar.appendChild(categoriesRow);
    toolbar.appendChild(pinsRow);

    const settingsPanel = buildSettingsPanel();

    results = document.createElement('div');
    results.id = 'st-jets-results';

    modal.appendChild(galaxyLayer);
    modal.appendChild(header);
    modal.appendChild(toolbar);
    modal.appendChild(settingsPanel);
    modal.appendChild(results);
    container.appendChild(overlay);
    container.appendChild(modal);
    document.body.appendChild(container);
    applyJetsTheme();

    overlay.addEventListener('click', closeJets);
    overlay.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        closeJets();
    });
    input.addEventListener('input', handleSearchInput);
}

function ensureOptionsMenuEntry() {
    if (document.getElementById('option_st_jets')) {
        return;
    }
    const menu = document.querySelector('#options .options-content');
    if (!menu) return;

    const divider = document.createElement('hr');

    const item = document.createElement('a');
    item.id = 'option_st_jets';
    item.title = '全局搜索 (Alt+K)';

    const icon = document.createElement('i');
    icon.className = 'fa-lg fa-solid fa-magnifying-glass';
    const label = document.createElement('span');
    label.textContent = '全局搜索';

    item.appendChild(icon);
    item.appendChild(label);
    item.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const optionsMenu = document.getElementById('options');
        if (optionsMenu) optionsMenu.style.display = 'none';
        openJets();
    });

    menu.appendChild(divider);
    menu.appendChild(item);
}

function openJets() {
    if (isOpen) return;
    ensureDom();
    applyJetsTheme();
    ensureDataLoaded();
    if (settingsIndexDirty) {
        settingsIndexDirty = false;
        void refreshSettingsIndex();
    }
    renderCategoryChips();
    renderPinChips();
    refreshSettingsPanel();
    updateIndexStatusUi();
    isOpen = true;
    container.classList.add('is-open');
    container.setAttribute('aria-hidden', 'false');
    lastQuery = input.value.trim();
    if (!queryWatcher) {
        queryWatcher = setInterval(() => {
            if (!isOpen) return;
            const current = input.value.trim();
            if (current !== lastQuery) {
                lastQuery = current;
                runSearch();
            }
        }, 100);
    }
    input.focus();
    setTimeout(() => {
        if (isOpen) {
            input.focus();
        }
    }, 0);
}

function closeJets() {
    if (!isOpen) return;
    isOpen = false;
    container.classList.remove('is-open');
    container.setAttribute('aria-hidden', 'true');
    input.value = '';
    clearResults();
    hideResults();
    if (queryWatcher) {
        clearInterval(queryWatcher);
        queryWatcher = null;
    }
    if (input && document.activeElement === input) {
        input.blur();
    }
}

function toggleJets() {
    if (isOpen) {
        closeJets();
    } else {
        openJets();
    }
}

function handleSearchInput() {
    if (searchTimer) {
        clearTimeout(searchTimer);
    }
    const query = input.value.trim();
    if (!query && !getEnabledPinnedTerms().length) {
        clearResults();
        hideResults();
        return;
    }
    showResults();
    searchTimer = setTimeout(runSearch, 200);
}

function rerunSearchIfOpen() {
    if (isOpen) {
        runSearch();
    }
}

function runSearch() {
    const query = input.value.trim();
    const pins = getEnabledPinnedTerms();
    if (!query && !pins.length) {
        clearResults();
        hideResults();
        return;
    }

    if (!searcher.items.length) {
        searcher.addBatch([...STATIC_ITEMS]);
    }

    const filters = { types: getActiveTypes(), requiredTerms: pins };
    let found = searcher.search(query, filters);
    if (!found.length && query.length <= 1) {
        const typeSet = filters.types;
        const fallbackItems = [...STATIC_ITEMS]
            .filter(item => !typeSet || typeSet.has(item.type));
        const limit = searcher.options?.maxResults || 50;
        found = fallbackItems.slice(0, limit).map(item => ({ item, score: 0, matches: [] }));
    }
    renderResults(found);
    showResults();
}

function clearResults() {
    currentResults = [];
    selectedIndex = -1;
    if (results) {
        results.innerHTML = '';
    }
}

function showResults() {
    if (!results) return;
    results.classList.add('is-visible');
    results.style.display = 'block';
}

function hideResults() {
    if (!results) return;
    results.classList.remove('is-visible');
    results.style.display = '';
}

const SNIPPET_RADIUS = 48;
const SNIPPET_MAX = 140;
const MAX_SNIPPETS = 3;

function normalizeRanges(ranges = [], length = 0) {
    const filtered = ranges
        .filter(range => Number.isFinite(range?.start) && Number.isFinite(range?.end))
        .map(range => ({
            start: Math.max(0, Math.min(length, range.start)),
            end: Math.max(0, Math.min(length, range.end)),
            kind: range.kind,
        }))
        .filter(range => range.end > range.start)
        .sort((a, b) => a.start - b.start);

    const merged = [];
    for (const range of filtered) {
        const last = merged[merged.length - 1];
        if (!last || range.start > last.end) {
            merged.push({ ...range });
        } else {
            last.end = Math.max(last.end, range.end);
        }
    }
    return merged;
}

function buildSingleSnippet(text, ranges) {
    if (!text) return { snippet: '', ranges: [], prefix: '', suffix: '' };
    const normalized = normalizeRanges(ranges, text.length);
    if (!normalized.length) {
        const clipped = text.length > SNIPPET_MAX ? text.slice(0, SNIPPET_MAX) : text;
        return { snippet: clipped, ranges: [], prefix: '', suffix: text.length > SNIPPET_MAX ? '…' : '' };
    }

    const first = normalized[0];
    let start = Math.max(0, first.start - SNIPPET_RADIUS);
    let end = Math.min(text.length, first.end + SNIPPET_RADIUS);

    if (end - start > SNIPPET_MAX) {
        const center = Math.floor((first.start + first.end) / 2);
        start = Math.max(0, Math.min(text.length - SNIPPET_MAX, center - Math.floor(SNIPPET_MAX / 2)));
        end = Math.min(text.length, start + SNIPPET_MAX);
    }

    const snippet = text.slice(start, end);
    const snippetRanges = normalized
        .filter(range => range.end > start && range.start < end)
        .map(range => ({
            start: Math.max(0, range.start - start),
            end: Math.min(end, range.end) - start,
        }));

    return {
        snippet,
        ranges: normalizeRanges(snippetRanges, snippet.length),
        prefix: start > 0 ? '…' : '',
        suffix: end < text.length ? '…' : '',
    };
}

function buildSnippetWindow(range, length) {
    let start = Math.max(0, range.start - SNIPPET_RADIUS);
    let end = Math.min(length, range.end + SNIPPET_RADIUS);
    if (end - start > SNIPPET_MAX) {
        const center = Math.floor((range.start + range.end) / 2);
        start = Math.max(0, Math.min(length - SNIPPET_MAX, center - Math.floor(SNIPPET_MAX / 2)));
        end = Math.min(length, start + SNIPPET_MAX);
    }
    return { start, end };
}

function mergeWindows(windows = []) {
    const ordered = windows
        .filter(win => Number.isFinite(win?.start) && Number.isFinite(win?.end))
        .sort((a, b) => a.start - b.start);
    const merged = [];
    const gap = 8;
    for (const win of ordered) {
        const last = merged[merged.length - 1];
        if (!last || win.start > last.end + gap) {
            merged.push({ ...win });
        } else {
            last.end = Math.max(last.end, win.end);
        }
    }
    return merged;
}

function buildSnippets(text, ranges) {
    if (!text) return [];
    const normalized = normalizeRanges(ranges, text.length);
    if (!normalized.length) return [];

    const windows = normalized.map(range => buildSnippetWindow(range, text.length));
    const merged = mergeWindows(windows);

    return merged.map(window => {
        const snippet = text.slice(window.start, window.end);
        const snippetRanges = normalized
            .filter(range => range.end > window.start && range.start < window.end)
            .map(range => ({
                start: Math.max(0, range.start - window.start),
                end: Math.min(window.end, range.end) - window.start,
            }));
        return {
            snippet,
            ranges: normalizeRanges(snippetRanges, snippet.length),
            prefix: window.start > 0 ? '…' : '',
            suffix: window.end < text.length ? '…' : '',
        };
    });
}

function appendHighlightedText(container, text, ranges, { prefix = '', suffix = '' } = {}) {
    if (!container) return;
    if (prefix) container.appendChild(document.createTextNode(prefix));

    if (!ranges.length) {
        container.appendChild(document.createTextNode(text));
        if (suffix) container.appendChild(document.createTextNode(suffix));
        return;
    }

    let cursor = 0;
    ranges.forEach(range => {
        if (range.start > cursor) {
            container.appendChild(document.createTextNode(text.slice(cursor, range.start)));
        }
        const mark = document.createElement('span');
        mark.className = range.kind === 'term'
            ? 'st-jets-highlight st-jets-highlight-term'
            : 'st-jets-highlight';
        mark.textContent = text.slice(range.start, range.end);
        container.appendChild(mark);
        cursor = range.end;
    });

    if (cursor < text.length) {
        container.appendChild(document.createTextNode(text.slice(cursor)));
    }
    if (suffix) container.appendChild(document.createTextNode(suffix));
}

function renderResults(found) {
    clearResults();

    if (!found.length) {
        const empty = document.createElement('div');
        empty.className = 'st-jets-empty';
        empty.textContent = !getJetsSettings().categories.length
            ? '没有点亮任何分类，点「全部」或具体分类开始搜索'
            : getEnabledPinnedTerms().length
                ? '没有同时命中所有已启用关键词的结果'
                : '没有找到结果';
        results.appendChild(empty);
        return;
    }

    const grouped = new Map();
    for (const result of found) {
        const type = result.item?.type || 'other';
        if (!grouped.has(type)) {
            grouped.set(type, []);
        }
        grouped.get(type).push(result);
    }

    const order = ['character', 'chat', 'chat_message', 'worldinfo', 'preset', 'settings', 'quickreply', 'regex', 'other'];
    for (const type of order) {
        if (!grouped.has(type)) continue;
        const header = document.createElement('div');
        header.className = 'st-jets-group-header';
        header.textContent = TYPE_LABELS[type] || type;
        results.appendChild(header);

        for (const result of grouped.get(type)) {
            const item = result.item;
            const row = document.createElement('div');
            row.className = 'st-jets-result-item';
            row.dataset.type = item.type || 'other';
            row.dataset.id = item.id || '';

            if (item?.metadata?.entryIndex !== undefined) {
                const entrySelector = `.world_entry[uid="${item.metadata.entryIndex}"]`;
                if (document.querySelector(entrySelector)) {
                    row.dataset.entryIndex = String(item.metadata.entryIndex);
                }
            }

            const title = document.createElement('div');
            title.className = 'st-jets-result-title';
            const titleText = item.title || 'Untitled';
            const titleRanges = normalizeRanges(
                (result.matches || []).filter(match => match.field === 'title'),
                titleText.length,
            );
            if (titleRanges.length) {
                appendHighlightedText(title, titleText, titleRanges);
            } else {
                title.textContent = titleText;
            }

            const subtitle = document.createElement('div');
            subtitle.className = 'st-jets-result-subtitle';
            const contentText = item.content || '';
            const contentRanges = (result.matches || []).filter(match => match.field === 'content');
            const snippets = buildSnippets(contentText, contentRanges);
            const snippetItems = snippets.length ? snippets : [buildSingleSnippet(contentText, [])];
            const snippetList = document.createElement('div');
            snippetList.className = 'st-jets-snippet-list';

            const applyExpandedState = expanded => {
                snippetList.dataset.expanded = expanded ? 'true' : 'false';
                const hidden = snippetList.querySelectorAll('.st-jets-snippet');
                hidden.forEach((node, index) => {
                    if (index >= MAX_SNIPPETS) {
                        node.classList.toggle('is-hidden', !expanded);
                    }
                });
            };

            snippetItems.forEach((snippet, index) => {
                const line = document.createElement('div');
                line.className = 'st-jets-snippet';
                if (index >= MAX_SNIPPETS) {
                    line.classList.add('is-hidden');
                }
                appendHighlightedText(line, snippet.snippet, snippet.ranges, {
                    prefix: snippet.prefix,
                    suffix: snippet.suffix,
                });
                snippetList.appendChild(line);
            });

            if (snippetItems.length > MAX_SNIPPETS) {
                const toggle = document.createElement('div');
                toggle.className = 'st-jets-snippet-toggle';
                toggle.textContent = '展开更多';
                toggle.addEventListener('click', event => {
                    event.stopPropagation();
                    const expanded = snippetList.dataset.expanded !== 'true';
                    applyExpandedState(expanded);
                    toggle.textContent = expanded ? '收起' : '展开更多';
                });
                snippetList.appendChild(toggle);
                applyExpandedState(false);
            }

            subtitle.appendChild(snippetList);

            row.appendChild(title);
            row.appendChild(subtitle);
            row.addEventListener('click', () => void executeResult(result));

            results.appendChild(row);
            currentResults.push({ result, element: row });
        }
    }
}

function updateSelection(nextIndex) {
    if (!currentResults.length) return;
    const total = currentResults.length;
    const normalized = ((nextIndex % total) + total) % total;

    if (selectedIndex >= 0 && currentResults[selectedIndex]) {
        currentResults[selectedIndex].element.classList.remove('selected');
    }

    selectedIndex = normalized;
    const entry = currentResults[selectedIndex];
    if (entry) {
        entry.element.classList.add('selected');
        entry.element.scrollIntoView({ block: 'nearest' });
    }
}

function ensureResultsReady() {
    if (!currentResults.length && input?.value?.trim()) {
        runSearch();
    }
}

function getContextFromGlobal() {
    if (typeof globalThis === 'undefined') return null;
    if (globalThis.SillyTavern?.getContext) {
        return globalThis.SillyTavern.getContext();
    }
    if (typeof globalThis.getContext === 'function') {
        return globalThis.getContext();
    }
    return null;
}

function getSTApi() {
    return typeof globalThis !== 'undefined' ? globalThis.ST_API : null;
}

function resolveCharacterIndex(context, metadata) {
    if (Number.isInteger(metadata?.characterId)) {
        return metadata.characterId;
    }
    const characters = context?.characters || [];
    const avatar = metadata?.avatar;
    const name = metadata?.characterName;
    let index = -1;

    if (avatar) {
        index = characters.findIndex(char => char?.avatar === avatar);
    }
    if (index < 0 && name) {
        index = characters.findIndex(char => char?.name === name || char?.data?.name === name);
    }

    return index >= 0 ? index : null;
}

async function selectCharacterForItem(item) {
    const context = getContextFromGlobal();
    if (!context?.selectCharacterById) return;
    const index = resolveCharacterIndex(context, item?.metadata);
    if (index !== null) {
        await context.selectCharacterById(index, { switchMenu: true });
    }
}

async function openChatTarget(item) {
    const context = getContextFromGlobal();
    if (!context) return;

    const meta = item?.metadata || {};
    if (meta.isGroup && context.openGroupChat) {
        await context.openGroupChat(meta.groupId);
        return;
    }

    const index = resolveCharacterIndex(context, meta);
    if (index !== null && context.selectCharacterById) {
        await context.selectCharacterById(index, { switchMenu: true });
    }
    if (meta.fileId && context.openCharacterChat) {
        await context.openCharacterChat(meta.fileId);
    }
}

async function scrollToMessage(messageIndex) {
    if (!Number.isFinite(messageIndex)) return;
    const api = getSTApi();
    if (api?.ui?.scrollChat) {
        await api.ui.scrollChat({ target: messageIndex, behavior: 'smooth' });
        return;
    }
    const target = document.querySelector(`.mes[mesid="${messageIndex}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    target.classList.add('st-jets-target');
    setTimeout(() => target.classList.remove('st-jets-target'), 1200);
}

async function executeResult(result) {
    const item = result?.item;
    if (!item) {
        closeJets();
        return;
    }

    recordUsage(item);

    switch (item.type) {
        case 'character':
            openPanel('#right-nav-panel');
            await selectCharacterForItem(item);
            break;
        case 'worldinfo':
            openPanel('#WorldInfo');
            focusWorldEntry(item?.metadata?.entryIndex);
            break;
        case 'preset':
            openPanel('#left-nav-panel');
            break;
        case 'chat':
            await openChatTarget(item);
            break;
        case 'chat_message':
            await openChatTarget(item);
            setTimeout(() => {
                void scrollToMessage(item?.metadata?.messageIndex);
            }, 200);
            break;
        case 'settings': {
            const action = item?.metadata?.action;
            if (item?.metadata?.panel === 'extensions') {
                openPanel('#rm_extensions_block');
            }
            if (item?.metadata?.panel === 'user-settings') {
                openPanel('#user-settings-block');
            }
            if (item?.metadata?.panel === 'ai-config') {
                openPanel('#left-nav-panel');
            }
            if (item?.metadata?.panel === 'character-management') {
                openPanel('#right-nav-panel');
            }
            if (item?.metadata?.panel === 'world-info') {
                openPanel('#WorldInfo');
            }
            if (item?.metadata?.panel === 'system-settings') {
                openPanel('#rm_api_block');
            }
            if (item?.metadata?.panel === 'advanced-format') {
                openPanel('#AdvancedFormatting');
            }
            if (item?.metadata?.panel === 'backgrounds') {
                openPanel('#Backgrounds');
            }
            if (item?.metadata?.panel === 'persona-management') {
                openPanel('#PersonaManagement');
            }
            if (action === 'click' && item?.metadata?.selector) {
                focusElementBySelector(item.metadata.selector);
                clickBySelector(item.metadata.selector);
            } else if (action === 'scroll' && item?.metadata?.selector) {
                const targetId = item.metadata.selector.replace('#', '');
                focusExtensionContainer(targetId);
            } else if (action === 'reveal' && item?.metadata?.selector) {
                focusElementBySelector(item.metadata.selector);
            }
            break;
        }
        case 'quickreply':
            openPanel('#rm_extensions_block');
            focusExtensionContainer('qr_container');
            break;
        case 'regex':
            openPanel('#rm_extensions_block');
            focusExtensionContainer('regex_container');
            break;
        default:
            break;
    }

    closeJets();
}

function openPanel(selector) {
    const panel = document.querySelector(selector);
    if (panel) {
        panel.classList.add('openDrawer');
        settingsIndexDirty = true;
    }
}

function isElementVisible(element) {
    return !!(element && (element.offsetParent || element.getClientRects().length));
}

function clickBySelector(selector) {
    const nodes = document.querySelectorAll(selector);
    if (!nodes.length) return false;
    for (const node of nodes) {
        if (isElementVisible(node)) {
            if (node.scrollIntoView) {
                node.scrollIntoView({ block: 'center' });
            }
            applyHighlight(node);
            node.click();
            return true;
        }
    }
    const fallback = nodes[0];
    if (fallback.scrollIntoView) {
        fallback.scrollIntoView({ block: 'center' });
    }
    applyHighlight(fallback);
    fallback.click();
    return true;
}

function focusExtensionContainer(containerId) {
    if (!containerId) return;
    const container = document.getElementById(containerId);
    if (!container) return;
    expandInlineDrawer(container);
    container.scrollIntoView({ block: 'center' });
    applyHighlight(container);
}

function focusElementBySelector(selector) {
    if (!selector) return;
    const target = document.querySelector(selector);
    if (!target) return;
    const drawer = target.closest('.inline-drawer');
    if (drawer) {
        toggleDrawer(drawer, true);
    }
    target.scrollIntoView({ block: 'center' });
    applyHighlight(target);
    const focusable = target.matches?.('input, select, textarea, button')
        ? target
        : target.querySelector?.('input, select, textarea, button');
    if (focusable?.focus) {
        focusable.focus();
    }
}

function expandInlineDrawer(container) {
    if (!container) return;
    const drawer = container.querySelector('.inline-drawer');
    if (!drawer) return;
    const content = drawer.querySelector(':scope > .inline-drawer-content');
    if (content && content.style.display !== 'none' && content.getClientRects().length) {
        return;
    }
    toggleDrawer(drawer, true);
}

function focusWorldEntry(entryIndex) {
    if (entryIndex === undefined || entryIndex === null) return;
    const entry = document.querySelector(`.world_entry[uid="${entryIndex}"]`);
    if (!entry) return;
    entry.scrollIntoView({ block: 'center' });
    entry.classList.add('st-jets-target');
    setTimeout(() => entry.classList.remove('st-jets-target'), 1200);
}

function isAuxiliaryInputTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    // 主搜索框除外：它需要方向键/回车导航结果
    if (target.id === 'st-jets-input') return false;
    // 弹窗内其他任何输入框（词条输入、设置面板等）不劫持按键
    return !!(target.closest('#st-jets-pins') || target.closest('#st-jets-settings'));
}

function handleGlobalKeydown(event) {
    const keyLower = String(event?.key || '').toLowerCase();
    const code = event?.code;
    const isAltKHotkey = !!event?.altKey
        && !event?.metaKey
        && !event?.shiftKey
        && (code === 'KeyK' || keyLower === 'k');

    if (isAltKHotkey) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }
        toggleJets();
        return;
    }

    // 输入法组词中的按键（含确认候选词的回车）一律不当作快捷键，
    // 否则中文输入法按回车确认文字会被误判为「打开选中结果」导致页面跳转
    if (event.isComposing) {
        return;
    }

    if (!isOpen) {
        return;
    }

    // 在设置面板/词条输入框中打字时不劫持按键
    if (isAuxiliaryInputTarget(event.target)) {
        return;
    }

    if (event.key === 'Escape') {
        event.preventDefault();
        closeJets();
        return;
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        ensureResultsReady();
        updateSelection(selectedIndex + 1);
        return;
    }

    if (event.key === 'ArrowUp') {
        event.preventDefault();
        ensureResultsReady();
        updateSelection(selectedIndex - 1);
        return;
    }

    if (event.key === 'Enter') {
        ensureResultsReady();
        if (currentResults.length && selectedIndex < 0) {
            updateSelection(0);
        }
        if (selectedIndex >= 0 && currentResults[selectedIndex]) {
            event.preventDefault();
            void executeResult(currentResults[selectedIndex].result);
        }
    }
}

// ===== 分类 / 常驻词条 chips 与设置面板 =====

function createChip({ label, icon = '', color = '', active = false, title = '', onClick }) {
    const chip = document.createElement('div');
    chip.className = 'st-jets-chip' + (active ? ' is-active' : '');
    if (color) {
        chip.style.setProperty('--st-jets-chip-color', color);
    }
    if (title) {
        chip.title = title;
    }
    chip.setAttribute('role', 'button');
    chip.tabIndex = 0;
    if (icon) {
        const chipIcon = document.createElement('i');
        chipIcon.className = icon;
        chip.appendChild(chipIcon);
    }
    const text = document.createElement('span');
    text.textContent = label;
    chip.appendChild(text);
    chip.addEventListener('click', event => {
        event.stopPropagation();
        onClick?.();
    });
    chip.addEventListener('keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onClick?.();
        }
    });
    return chip;
}

function setCategories(ids) {
    const settings = getJetsSettings();
    const enabled = new Set(ids);
    // 直接存点亮的集合：全量 = 全亮，空 = 全灭，不做任何换算
    settings.categories = ALL_CATEGORY_IDS.filter(id => enabled.has(id));
    saveJetsSettings();
    renderCategoryChips();
    rerunSearchIfOpen();
}

function renderCategoryChips() {
    const row = document.getElementById('st-jets-categories');
    if (!row) return;
    row.innerHTML = '';

    const settings = getJetsSettings();
    const enabled = new Set(settings.categories);
    // 总控「全部」：三个具体分类全亮时它自动亮
    const isAll = ALL_CATEGORY_IDS.every(id => enabled.has(id));

    row.appendChild(createChip({
        label: '全部',
        icon: 'fa-solid fa-layer-group',
        active: isAll,
        title: isAll ? '全部点亮中，点击一键全灭' : '一键点亮所有分类',
        onClick: () => setCategories(isAll ? [] : [...ALL_CATEGORY_IDS]),
    }));

    for (const category of CATEGORIES) {
        const active = enabled.has(category.id);
        row.appendChild(createChip({
            label: category.label,
            icon: category.icon,
            color: category.color,
            active,
            title: active ? `已点亮「${category.label}」，点击熄灭` : `点亮「${category.label}」（可与其他分类叠加）`,
            onClick: () => {
                const next = new Set(enabled);
                if (next.has(category.id)) {
                    next.delete(category.id);
                } else {
                    next.add(category.id);
                }
                setCategories([...next]);
            },
        }));
    }
}

function renderPinChips() {
    const row = document.getElementById('st-jets-pins');
    if (!row) return;
    // 重绘会清空整行；如果词条输入框正开着（连续添加中），重绘后恢复它
    const reopenPinInput = row.querySelector('#st-jets-pin-input') !== null;
    row.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'st-jets-pin-rowlabel';
    label.title = '常驻关键词：启用后结果必须同时包含这些词，叠加越多越精准';
    const labelIcon = document.createElement('i');
    labelIcon.className = 'fa-solid fa-tag';
    label.appendChild(labelIcon);
    row.appendChild(label);

    for (const pin of getPinnedTerms()) {
        const chip = document.createElement('div');
        chip.className = 'st-jets-chip st-jets-pin' + (pin.enabled ? ' is-active' : '');
        chip.title = pin.enabled ? '点击停用（词条保留）' : '点击启用筛选';
        chip.setAttribute('role', 'button');
        chip.tabIndex = 0;

        const text = document.createElement('span');
        text.className = 'st-jets-chip-text';
        text.textContent = pin.text;

        const remove = document.createElement('span');
        remove.className = 'st-jets-chip-remove';
        remove.textContent = '×';
        remove.title = '删除词条';
        remove.addEventListener('click', event => {
            event.stopPropagation();
            removePinnedTerm(pin.text);
        });

        chip.appendChild(text);
        chip.appendChild(remove);
        chip.addEventListener('click', () => togglePinnedTerm(pin.text));
        chip.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                togglePinnedTerm(pin.text);
            }
        });
        row.appendChild(chip);
    }

    const addChip = document.createElement('div');
    addChip.id = 'st-jets-pin-add';
    addChip.className = 'st-jets-chip st-jets-chip-add';
    addChip.title = '添加常驻关键词（如人名）';
    addChip.setAttribute('role', 'button');
    addChip.tabIndex = 0;
    const addIcon = document.createElement('i');
    addIcon.className = 'fa-solid fa-plus';
    addChip.appendChild(addIcon);
    addChip.addEventListener('click', event => {
        event.stopPropagation();
        showPinInput(row, addChip);
    });
    addChip.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            showPinInput(row, addChip);
        }
    });
    row.appendChild(addChip);

    if (reopenPinInput) {
        showPinInput(row, addChip);
    }
}

function showPinInput(row, addChip) {
    if (document.getElementById('st-jets-pin-input')) return;
    addChip.classList.add('is-hidden');

    const pinInput = document.createElement('input');
    pinInput.id = 'st-jets-pin-input';
    pinInput.type = 'text';
    pinInput.placeholder = '关键词，回车添加';
    pinInput.maxLength = 24;
    pinInput.autocomplete = 'off';

    let closed = false;
    const cleanup = () => {
        if (closed) return;
        closed = true;
        pinInput.remove();
        addChip.classList.remove('is-hidden');
    };

    pinInput.addEventListener('keydown', event => {
        event.stopPropagation();
        // 输入法组词中的回车是确认候选词，不是提交
        if (event.isComposing) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            const value = pinInput.value.trim();
            if (value) {
                // 添加后输入框重开，可连续录入多个关键词；焦点不会掉到页面上
                pinInput.value = '';
                addPinnedTerm(value);
            }
            else {
                cleanup();
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cleanup();
        }
    });
    pinInput.addEventListener('blur', cleanup);

    row.insertBefore(pinInput, addChip);
    pinInput.focus();
}

// ===== 设置面板 =====

function toggleSettingsPanel() {
    const panel = document.getElementById('st-jets-settings');
    if (!panel) return;
    const open = panel.classList.toggle('is-open');
    const toggle = document.getElementById('st-jets-settings-toggle');
    if (toggle) {
        toggle.classList.toggle('is-active', open);
    }
    if (open) {
        refreshSettingsPanel();
    }
}

function buildSettingsPanel() {
    const panel = document.createElement('div');
    panel.id = 'st-jets-settings';

    // —— 外观 ——
    const themeTitle = document.createElement('div');
    themeTitle.className = 'st-jets-settings-title';
    themeTitle.textContent = '面板外观';

    const themeRow = document.createElement('div');
    themeRow.className = 'st-jets-settings-row';
    themeRow.id = 'st-jets-theme-row';

    // —— 内容屏蔽 ——
    const blockTitle = document.createElement('div');
    blockTitle.className = 'st-jets-settings-title';
    blockTitle.textContent = '内容屏蔽（不进入搜索结果）';

    const reasoningRow = document.createElement('div');
    reasoningRow.className = 'st-jets-settings-row';
    const reasoningLabel = document.createElement('label');
    reasoningLabel.className = 'st-jets-toggle';
    const reasoningCheckbox = document.createElement('input');
    reasoningCheckbox.type = 'checkbox';
    reasoningCheckbox.id = 'st-jets-reasoning-toggle';
    const reasoningText = document.createElement('span');
    reasoningText.textContent = '屏蔽思维链 / XML 标签（如 <think>…</think> 的推理内容）';
    reasoningLabel.appendChild(reasoningCheckbox);
    reasoningLabel.appendChild(reasoningText);
    reasoningRow.appendChild(reasoningLabel);
    reasoningCheckbox.addEventListener('change', () => {
        const settings = getJetsSettings();
        settings.stripReasoning = reasoningCheckbox.checked;
        saveJetsSettings();
        rebuildChatItemsFromCache();
    });

    // 自定义过滤标签：紧跟开关、缩进展示，一眼看出是在这里填
    const tagsRow = document.createElement('div');
    tagsRow.className = 'st-jets-settings-row st-jets-settings-subrow';
    const tagsLabel = document.createElement('span');
    tagsLabel.className = 'st-jets-settings-label';
    tagsLabel.textContent = '屏蔽的标签：';
    const tagsList = document.createElement('div');
    tagsList.id = 'st-jets-reasoning-tags';
    tagsRow.appendChild(tagsLabel);
    tagsRow.appendChild(tagsList);

    const tagsHint = document.createElement('div');
    tagsHint.className = 'st-jets-settings-hint';
    tagsHint.textContent = '模型输出的其他标签（如 <dream>）在这里补一个名字，点 × 可移除；改动立即生效。';

    // —— 索引 ——
    const indexTitle = document.createElement('div');
    indexTitle.className = 'st-jets-settings-title';
    indexTitle.textContent = '索引';

    const indexRow = document.createElement('div');
    indexRow.className = 'st-jets-settings-row';
    const status = document.createElement('span');
    status.id = 'st-jets-index-status';
    status.textContent = '已索引 0 个聊天 · 0 条消息';
    const rebuildButton = document.createElement('button');
    rebuildButton.id = 'st-jets-rebuild';
    rebuildButton.type = 'button';
    rebuildButton.className = 'st-jets-button';
    rebuildButton.textContent = '重建索引';
    rebuildButton.title = '清空本地缓存并重新索引全部聊天';
    rebuildButton.addEventListener('click', async () => {
        rebuildButton.disabled = true;
        rebuildButton.textContent = '重建中…';
        try {
            await rebuildChatIndex();
        } finally {
            rebuildButton.disabled = false;
            rebuildButton.textContent = '重建索引';
        }
    });
    indexRow.appendChild(status);
    indexRow.appendChild(rebuildButton);

    const hint = document.createElement('div');
    hint.className = 'st-jets-settings-hint';
    hint.textContent = '首次使用会在后台空闲时逐步索引全部聊天；AI 生成回复期间自动暂停，不影响酒馆性能。';

    panel.appendChild(themeTitle);
    panel.appendChild(themeRow);
    panel.appendChild(blockTitle);
    panel.appendChild(reasoningRow);
    panel.appendChild(tagsRow);
    panel.appendChild(tagsHint);
    panel.appendChild(indexTitle);
    panel.appendChild(indexRow);
    panel.appendChild(hint);
    return panel;
}

function renderThemeChips() {
    const row = document.getElementById('st-jets-theme-row');
    if (!row) return;
    row.innerHTML = '';

    const current = getJetsSettings().theme;
    const options = [
        { id: 'default', label: '默认', icon: 'fa-solid fa-circle-half-stroke', color: '' },
        { id: 'galaxy', label: '星空玻璃', icon: 'fa-solid fa-star', color: '#a5b4fc' },
    ];
    for (const option of options) {
        row.appendChild(createChip({
            label: option.label,
            icon: option.icon,
            color: option.color,
            active: current === option.id,
            title: option.id === 'galaxy'
                ? '液态玻璃质感 + 流动星云与微闪星光'
                : '默认深色面板',
            onClick: () => {
                const settings = getJetsSettings();
                if (settings.theme === option.id) return;
                settings.theme = option.id;
                saveJetsSettings();
                applyJetsTheme();
                renderThemeChips();
            },
        }));
    }
}

function refreshSettingsPanel() {
    const settings = getJetsSettings();
    const checkbox = document.getElementById('st-jets-reasoning-toggle');
    if (checkbox) {
        checkbox.checked = !!settings.stripReasoning;
    }
    renderThemeChips();
    renderReasoningTagChips();
    updateIndexStatusUi();
}

function addReasoningTag(tag) {
    const value = String(tag || '').trim().toLowerCase().slice(0, 20);
    if (!value) return;
    const settings = getJetsSettings();
    if (settings.reasoningTags.includes(value)) return;
    settings.reasoningTags.push(value);
    saveJetsSettings();
    if (settings.stripReasoning) {
        rebuildChatItemsFromCache();
    }
    renderReasoningTagChips();
}

function removeReasoningTag(tag) {
    const settings = getJetsSettings();
    settings.reasoningTags = settings.reasoningTags.filter(item => item !== tag);
    saveJetsSettings();
    if (settings.stripReasoning) {
        rebuildChatItemsFromCache();
    }
    renderReasoningTagChips();
}

function renderReasoningTagChips() {
    const list = document.getElementById('st-jets-reasoning-tags');
    if (!list) return;
    list.innerHTML = '';

    const settings = getJetsSettings();
    for (const tag of settings.reasoningTags) {
        const chip = document.createElement('div');
        chip.className = 'st-jets-chip st-jets-tag is-active';
        chip.title = '点击移除该过滤标签';

        const text = document.createElement('span');
        text.className = 'st-jets-chip-text';
        text.textContent = tag;
        const remove = document.createElement('span');
        remove.className = 'st-jets-chip-remove';
        remove.textContent = '×';
        remove.title = '移除';
        remove.addEventListener('click', event => {
            event.stopPropagation();
            removeReasoningTag(tag);
        });

        chip.appendChild(text);
        chip.appendChild(remove);
        chip.addEventListener('click', () => removeReasoningTag(tag));
        list.appendChild(chip);
    }

    const tagInput = document.createElement('input');
    tagInput.id = 'st-jets-tag-input';
    tagInput.type = 'text';
    tagInput.placeholder = '输入标签名（如 dream），回车添加';
    tagInput.maxLength = 20;
    tagInput.autocomplete = 'off';
    tagInput.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.isComposing) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            const value = tagInput.value.trim();
            if (value) {
                addReasoningTag(value);
                tagInput.value = '';
            }
        }
    });
    list.appendChild(tagInput);
}

function initJets() {
    if (window.__stJetsInitialized) {
        return;
    }
    window.__stJetsInitialized = true;
    registerTestApi();
    ensureDom();
    ensureOptionsMenuEntry();
    ensureDataLoaded();
    bindLiveChatIndexing();
    document.addEventListener('keydown', handleGlobalKeydown, true);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initJets);
} else {
    initJets();
}
