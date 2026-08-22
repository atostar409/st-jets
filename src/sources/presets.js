/**
 * JETS 预设数据源
 * 将预设数据转换为可索引条目
 */

export class PresetSource {
    constructor(presets = [], presetType = 'context') {
        this.presets = presets;
        this.presetType = presetType;
    }

    async load({ type = this.presetType } = {}) {
        const context = (typeof globalThis !== 'undefined' && globalThis.SillyTavern?.getContext)
            ? globalThis.SillyTavern.getContext()
            : (typeof globalThis !== 'undefined' && typeof globalThis.getContext === 'function'
                ? globalThis.getContext()
                : null);

        if (context?.getPresetManager) {
            const manager = context.getPresetManager(type);
            const list = manager?.getPresetList ? manager.getPresetList() : null;
            // getPresetList 返回 { presets, ... }，个别版本直接返回数组，两种都兼容
            const presets = Array.isArray(list) ? list : list?.presets;
            if (Array.isArray(presets) && presets.length) {
                this.presets = presets;
                return this.presets;
            }
        }

        return this.presets;
    }

    toIndexItems() {
        return this.presets.map(preset => ({
            id: `preset-${this.presetType}-${preset?.name}`,
            type: 'preset',
            title: preset?.name,
            content: this.extractContent(preset),
            metadata: {
                presetType: this.presetType,
                presetName: preset?.name,
            },
        }));
    }

    extractContent(preset) {
        const data = preset?.data || preset || {};
        const parts = [];

        const pushText = (value) => {
            if (typeof value === 'string' && value.trim()) {
                parts.push(value);
            }
        };

        if (data.story_string) {
            pushText(data.story_string);
        }
        if (data.system_prompt) {
            pushText(data.system_prompt);
        }
        if (data.content) {
            // sysprompt 预设的正文存在 content 字段
            pushText(data.content);
        }
        if (data.input_suffix) {
            pushText(data.input_suffix);
        }
        if (data.output_suffix) {
            pushText(data.output_suffix);
        }

        if (Array.isArray(preset?.prompts)) {
            preset.prompts.forEach(prompt => pushText(prompt?.content));
        }

        if (preset?.utilityPrompts && typeof preset.utilityPrompts === 'object') {
            Object.values(preset.utilityPrompts).forEach(value => pushText(value));
        }

        return parts.join('\n');
    }
}
