import { App, PluginSettingTab, Setting } from "obsidian";
import { t, type MessageKey } from "./i18n";
import type CodeBlockAutoCollapsePlugin from "./main";
import type { SettingsUpdateMode } from "./main";
import { MINIMAP_WIDTH_RANGE, type CodeBlockSettings } from "./settings";

type NumericKey = {
	[K in keyof CodeBlockSettings]: CodeBlockSettings[K] extends number ? K : never;
}[keyof CodeBlockSettings];
type BooleanKey = {
	[K in keyof CodeBlockSettings]: CodeBlockSettings[K] extends boolean ? K : never;
}[keyof CodeBlockSettings];
type EnumKey = {
	[K in keyof CodeBlockSettings]: CodeBlockSettings[K] extends string ? K : never;
}[keyof CodeBlockSettings];

/**
 * 形如 `minimap.width` 的文案前缀，`.name` / `.desc` 由辅助方法补齐。
 *
 * 必须先经类型参数 K 转发，条件类型才会对联合类型逐项分配；
 * 直接写 `MessageKey extends ...` 会把整个联合当成一个类型判断，结果恒为 never。
 */
type PrefixOf<K> = K extends `${infer Prefix}.name` ? Prefix : never;
type LabelKey = PrefixOf<MessageKey>;

/** 分组与命名对齐 CodeGlance Pro 的设置页，便于对照。 */
export class CodeBlockAutoCollapseSettingTab extends PluginSettingTab {
	private readonly plugin: CodeBlockAutoCollapsePlugin;

	constructor(app: App, plugin: CodeBlockAutoCollapsePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// minAppVersion < 1.13.0，声明式设置 API 尚不可用，必须提供 display()。
	// 官方规则集里 no-deprecated 不允许被屏蔽，这条弃用告警是预期内的。
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName(t("collapse.heading")).setHeading();
		this.addSlider(containerEl, "collapse.minLines", "minimumLines", 2, 200, 1, "rebuild");
		this.addSlider(containerEl, "collapse.previewLines", "previewLines", 1, 50, 1, "rebuild");

		new Setting(containerEl).setName(t("minimap.heading")).setHeading();
		this.addSlider(containerEl, "minimap.minLines", "minimapMinLines", 0, 2000, 10, "rebuild");
		this.addSlider(containerEl, "minimap.maxLines", "minimapMaxLines", 1000, 100000, 1000, "rebuild");
		this.addToggle(containerEl, "minimap.outOfRangeEmpty", "outOfRangeEmpty", "rebuild");
		this.addSlider(containerEl, "minimap.pixelsPerLine", "pixelsPerLine", 1, 8, 1, "layout");
		this.addDropdown(containerEl, "minimap.editorSize", "editorSize", [
			{ value: "proportional", label: "Proportional" },
			{ value: "fit", label: "Fit" },
		], "layout");
		this.addDropdown(containerEl, "minimap.renderStyle", "renderStyle", [
			{ value: "clean", label: "Clean" },
			{ value: "accurate", label: "Accurate" },
		], "layout");
		this.addDropdown(containerEl, "minimap.alignment", "alignment", [
			{ value: "right", label: t("minimap.alignment.right") },
			{ value: "left", label: t("minimap.alignment.left") },
		], "layout");
		this.addSlider(containerEl, "minimap.width", "minimapWidth", MINIMAP_WIDTH_RANGE[0], MINIMAP_WIDTH_RANGE[1], 10, "layout");
		this.addToggle(containerEl, "minimap.lockWidth", "lockWidth", "layout");
		this.addToggle(containerEl, "minimap.autoShrinkWidth", "autoShrinkWidth", "layout");

		new Setting(containerEl).setName(t("viewport.heading")).setHeading();
		this.addColor(containerEl, "viewport.color", "viewportColor");
		this.addColor(containerEl, "viewport.borderColor", "viewportBorderColor");
		this.addSlider(containerEl, "viewport.borderThickness", "viewportBorderThickness", 0, 4, 1, "layout");

		new Setting(containerEl).setName(t("interaction.heading")).setHeading();
		this.addDropdown(containerEl, "interaction.clickType", "clickType", [
			{ value: "code", label: t("interaction.clickType.code") },
			{ value: "mouse", label: t("interaction.clickType.mouse") },
		], "layout");
		this.addDropdown(containerEl, "interaction.jumpOn", "jumpOn", [
			{ value: "down", label: t("interaction.jumpOn.down") },
			{ value: "up", label: t("interaction.jumpOn.up") },
			{ value: "none", label: t("interaction.jumpOn.none") },
		], "layout");
		this.addToggle(containerEl, "interaction.moveOnly", "moveOnly", "layout");
		this.addToggle(containerEl, "interaction.enableCodeLens", "enableCodeLens", "layout");
		this.addToggle(containerEl, "interaction.wheelMoveCodeLens", "wheelMoveCodeLens", "layout");

		new Setting(containerEl).setName(t("rendering.heading")).setHeading();
		this.addToggle(containerEl, "rendering.syntaxHighlight", "syntaxHighlight", "content");
		this.addToggle(containerEl, "rendering.enableMarkers", "enableMarkers", "content");
		this.addText(containerEl, "rendering.markerRegex", "markerRegex");
		this.addSlider(containerEl, "rendering.markerScale", "markerScale", 1, 6, 0.5, "content");

		new Setting(containerEl).setName(t("reset.heading")).setHeading();
		new Setting(containerEl)
			.setDesc(t("reset.desc"))
			.addButton((button) =>
				button.setButtonText(t("reset.button")).onClick(() => {
					this.plugin.restoreDefaultSettings();
					this.display();
				})
			);
	}

	private addSlider(
		containerEl: HTMLElement,
		labelKey: LabelKey,
		key: NumericKey,
		min: number,
		max: number,
		step: number,
		mode: SettingsUpdateMode
	): void {
		new Setting(containerEl)
			.setName(t(`${labelKey}.name`))
			.setDesc(t(`${labelKey}.desc`))
			.addSlider((slider) =>
				slider
					.setLimits(min, max, step)
					.setValue(this.plugin.settings[key])
					.onChange((value) => {
						this.setValue(key, value, mode);
					})
			);
	}

	private addToggle(
		containerEl: HTMLElement,
		labelKey: LabelKey,
		key: BooleanKey,
		mode: SettingsUpdateMode
	): void {
		new Setting(containerEl)
			.setName(t(`${labelKey}.name`))
			.setDesc(t(`${labelKey}.desc`))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings[key]).onChange((value) => {
					this.setValue(key, value, mode);
				})
			);
	}

	private addDropdown(
		containerEl: HTMLElement,
		labelKey: LabelKey,
		key: EnumKey,
		options: ReadonlyArray<{ value: string; label: string }>,
		mode: SettingsUpdateMode
	): void {
		new Setting(containerEl)
			.setName(t(`${labelKey}.name`))
			.setDesc(t(`${labelKey}.desc`))
			.addDropdown((dropdown) => {
				for (const option of options) dropdown.addOption(option.value, option.label);
				dropdown.setValue(String(this.plugin.settings[key]));
				dropdown.onChange((value) => {
					this.setValue(key, value, mode);
				});
			});
	}

	private addText(containerEl: HTMLElement, labelKey: LabelKey, key: "markerRegex"): void {
		new Setting(containerEl)
			.setName(t(`${labelKey}.name`))
			.setDesc(t(`${labelKey}.desc`))
			.addText((text) =>
				text.setValue(this.plugin.settings[key]).onChange((value) => {
					this.setValue(key, value, "content");
				})
			);
	}

	private addColor(
		containerEl: HTMLElement,
		labelKey: LabelKey,
		key: "viewportColor" | "viewportBorderColor"
	): void {
		new Setting(containerEl)
			.setName(t(`${labelKey}.name`))
			.setDesc(t(`${labelKey}.desc`))
			.addColorPicker((picker) =>
				picker.setValue(this.plugin.settings[key]).onChange((value) => {
					this.setValue(key, value.toLowerCase(), "layout");
				})
			);
	}

	private setValue(
		key: keyof CodeBlockSettings,
		value: number | boolean | string,
		mode: SettingsUpdateMode
	): void {
		this.plugin.updateSettings((settings) => {
			(settings as unknown as Record<string, number | boolean | string>)[key] = value;
		}, mode);
	}
}
