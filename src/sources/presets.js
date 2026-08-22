/**
 * JETS 预设数据源
 * 将预设数据转换为可索引条目
 */

export class PresetSource {
    constructor(presets = [], presetType = 'context') {
        this.presets = presets;
        this.presetNames = [];
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
            // getPresetList 返回 { presets, preset_names, ... }，个别版本直接返回数组，两种都兼容
            const presets = Array.isArray(list) ? list : list?.presets;
            if (Array.isArray(presets) && presets.length) {
                this.presets = presets;
                this.presetNames = this.buildAlignedNames(list);
                return this.presets;
            }
        }

        return this.presets;
    }

    /**
     * preset_names 有两种官方形态：
     * - 按名键的管理器（文本补全 / 上下文 / 指令 / 系统提示 / 推理）：数组，preset_names[i] 对应 presets[i]
     * - 按下标的管理器（对话补全 / KoboldAI / NovelAI）：{ 预设名: 数组下标 } 映射
     * 对话补全预设文件本身没有 name 字段——名字全靠这里对齐出来
     */
    buildAlignedNames(list) {
        const presetNames = list?.preset_names;
        if (Array.isArray(presetNames)) {
            return presetNames.map(name => String(name ?? ''));
        }
        const aligned = [];
        if (presetNames && typeof presetNames === 'object') {
            for (const [name, index] of Object.entries(presetNames)) {
                const idx = Number(index);
                if (Number.isInteger(idx) && idx >= 0) {
                    aligned[idx] = String(name);
                }
            }
        }
        return aligned;
    }

    nameAt(index, preset) {
        return String(preset?.name || this.presetNames[index] || '').trim();
    }

    // 与世界书同构的两级结构：带 prompts[] 的预设（对话补全）展开成 prompt 级条目，
    // 挂载预设后搜索指向的就是这些条目；其余类型（采样器/模板/推理）整本一条
    toIndexItems() {
        const items = [];
        for (const { preset, index, name } of this.presets
            .map((entry, entryIndex) => ({ preset: entry, index: entryIndex, name: this.nameAt(entryIndex, entry) }))
            .filter(entry => entry.name)) {
            const baseMetadata = {
                presetType: this.presetType,
                presetName: name,
                presetIndex: index,
            };

            if (Array.isArray(preset?.prompts) && preset.prompts.length) {
                let expanded = 0;
                preset.prompts.forEach((prompt, promptIndex) => {
                    const title = String(prompt?.name || '').trim();
                    const content = String(prompt?.content || '').trim();
                    if (!title && !content) return;
                    items.push({
                        id: `preset-${this.presetType}-${name}-${promptIndex}`,
                        type: 'preset',
                        title: title || `Prompt ${promptIndex + 1}`,
                        content,
                        metadata: { ...baseMetadata, promptIndex },
                    });
                    expanded += 1;
                });
                if (expanded) continue;
            }

            items.push({
                id: `preset-${this.presetType}-${name}`,
                type: 'preset',
                title: name,
                content: this.extractContent(preset),
                metadata: { ...baseMetadata },
            });
        }
        return items;
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
        if (data.prefix) {
            // 推理模板 / NovelAI 预设的前后缀
            pushText(data.prefix);
        }
        if (data.suffix) {
            pushText(data.suffix);
        }
        if (data.description) {
            pushText(data.description);
        }

        if (preset?.utilityPrompts && typeof preset.utilityPrompts === 'object') {
            Object.values(preset.utilityPrompts).forEach(value => pushText(value));
        }

        return parts.join('\n');
    }
}
