import {
	App,
	PluginSettingTab,
	type SettingDefinition,
	type SettingDefinitionItem,
} from "obsidian";
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

/** 设置字段名联合。把声明式控件的 key 收窄成它，写错字段名编译不过。 */
type ControlKey = keyof CodeBlockSettings;

/** 分组内的一项：控件行、动作行或纯文本行，**不能再嵌套分组**。 */
type Definition = SettingDefinition<ControlKey>;

/** 顶层数组的一项：在 Definition 之外还允许 `type: "group"`。 */
type DefinitionItem = SettingDefinitionItem<ControlKey>;

/**
 * 每个设置项改动后需要的刷新档位。
 *
 * 旧实现把档位作为参数逐处传，新增设置时容易漏配或配错。改成穷尽映射表后，
 * 往 `CodeBlockSettings` 里加字段却忘了归类会直接编译失败。
 */
const UPDATE_MODE: Record<keyof CodeBlockSettings, SettingsUpdateMode> = {
	minimumLines: "rebuild",
	previewLines: "rebuild",

	minimapMinLines: "rebuild",
	minimapMaxLines: "rebuild",
	outOfRangeEmpty: "rebuild",
	pixelsPerLine: "layout",
	editorSize: "layout",
	renderStyle: "layout",
	alignment: "layout",
	minimapWidth: "layout",
	lockWidth: "layout",
	autoShrinkWidth: "layout",

	viewportColor: "layout",
	viewportBorderColor: "layout",
	viewportBorderThickness: "layout",

	clickType: "layout",
	jumpOn: "layout",
	moveOnly: "layout",
	enableCodeLens: "layout",
	wheelMoveCodeLens: "layout",

	syntaxHighlight: "content",
	enableMarkers: "content",
	markerRegex: "content",
	markerScale: "content",
};

/**
 * 颜色控件统一转小写再存。
 *
 * 缩略图用颜色拼 themeKey 做样式缓存比对，大小写不一致会让它误判成"配色变了"
 * 而白白重绘一次。
 */
const COLOR_KEYS: ReadonlySet<keyof CodeBlockSettings> = new Set<keyof CodeBlockSettings>([
	"viewportColor",
	"viewportBorderColor",
]);

function slider(
	labelKey: LabelKey,
	key: NumericKey,
	min: number,
	max: number,
	step: number
): Definition {
	return {
		name: t(`${labelKey}.name`),
		desc: t(`${labelKey}.desc`),
		control: { type: "slider", key, min, max, step },
	};
}

function toggle(labelKey: LabelKey, key: BooleanKey): Definition {
	return {
		name: t(`${labelKey}.name`),
		desc: t(`${labelKey}.desc`),
		control: { type: "toggle", key },
	};
}

function dropdown(
	labelKey: LabelKey,
	key: EnumKey,
	options: Record<string, string>
): Definition {
	return {
		name: t(`${labelKey}.name`),
		desc: t(`${labelKey}.desc`),
		control: { type: "dropdown", key, options },
	};
}

function text(labelKey: LabelKey, key: "markerRegex"): Definition {
	return {
		name: t(`${labelKey}.name`),
		desc: t(`${labelKey}.desc`),
		control: { type: "text", key },
	};
}

function color(labelKey: LabelKey, key: "viewportColor" | "viewportBorderColor"): Definition {
	return {
		name: t(`${labelKey}.name`),
		desc: t(`${labelKey}.desc`),
		control: { type: "color", key },
	};
}

/** 分组与命名对齐 CodeGlance Pro 的设置页，便于对照。 */
export class CodeBlockAutoCollapseSettingTab extends PluginSettingTab {
	private readonly plugin: CodeBlockAutoCollapsePlugin;

	constructor(app: App, plugin: CodeBlockAutoCollapsePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * 声明式设置定义（Obsidian 1.13.0+）。
	 *
	 * 框架据此渲染控件、写回 `plugin.settings` 并建立全局设置搜索索引，
	 * 不再需要手写 display() 与逐控件的 onChange。
	 *
	 * 本方法在每次 update() 以及标签页注册时（建索引）都会被调用，必须保持轻量：
	 * 只拼数组与取文案，不要读文件或做重计算。
	 */
	getSettingDefinitions(): DefinitionItem[] {
		return [
			{
				type: "group",
				heading: t("collapse.heading"),
				items: [
					slider("collapse.minLines", "minimumLines", 2, 200, 1),
					slider("collapse.previewLines", "previewLines", 1, 50, 1),
				],
			},
			{
				type: "group",
				heading: t("minimap.heading"),
				items: [
					slider("minimap.minLines", "minimapMinLines", 0, 2000, 10),
					slider("minimap.maxLines", "minimapMaxLines", 1000, 100000, 1000),
					toggle("minimap.outOfRangeEmpty", "outOfRangeEmpty"),
					slider("minimap.pixelsPerLine", "pixelsPerLine", 1, 8, 1),
					dropdown("minimap.editorSize", "editorSize", { proportional: "Proportional", fit: "Fit" }),
					dropdown("minimap.renderStyle", "renderStyle", { clean: "Clean", accurate: "Accurate" }),
					dropdown("minimap.alignment", "alignment", {
						right: t("minimap.alignment.right"),
						left: t("minimap.alignment.left"),
					}),
					slider("minimap.width", "minimapWidth", MINIMAP_WIDTH_RANGE[0], MINIMAP_WIDTH_RANGE[1], 10),
					toggle("minimap.lockWidth", "lockWidth"),
					toggle("minimap.autoShrinkWidth", "autoShrinkWidth"),
				],
			},
			{
				type: "group",
				heading: t("viewport.heading"),
				items: [
					color("viewport.color", "viewportColor"),
					color("viewport.borderColor", "viewportBorderColor"),
					slider("viewport.borderThickness", "viewportBorderThickness", 0, 4, 1),
				],
			},
			{
				type: "group",
				heading: t("interaction.heading"),
				items: [
					dropdown("interaction.clickType", "clickType", {
						code: t("interaction.clickType.code"),
						mouse: t("interaction.clickType.mouse"),
					}),
					dropdown("interaction.jumpOn", "jumpOn", {
						down: t("interaction.jumpOn.down"),
						up: t("interaction.jumpOn.up"),
						none: t("interaction.jumpOn.none"),
					}),
					toggle("interaction.moveOnly", "moveOnly"),
					toggle("interaction.enableCodeLens", "enableCodeLens"),
					toggle("interaction.wheelMoveCodeLens", "wheelMoveCodeLens"),
				],
			},
			{
				type: "group",
				heading: t("rendering.heading"),
				items: [
					toggle("rendering.syntaxHighlight", "syntaxHighlight"),
					toggle("rendering.enableMarkers", "enableMarkers"),
					text("rendering.markerRegex", "markerRegex"),
					slider("rendering.markerScale", "markerScale", 1, 6, 0.5),
				],
			},
			{
				type: "group",
				heading: t("reset.heading"),
				items: [
					{
						name: t("reset.button"),
						desc: t("reset.desc"),
						action: () => {
							this.plugin.restoreDefaultSettings();
							// 1.13.0+ 上 display() 已被绕过，刷新声明式内容只能用 update()。
							this.update();
						},
					},
				],
			},
		];
	}

	/**
	 * 声明式控件的写入路径。
	 *
	 * 覆写它会整体接管默认实现（直接写 `this.plugin.settings` 并自动 saveData），
	 * 所以必须自己走 `plugin.updateSettings`：它同步改设置、防抖保存，并按档位
	 * 刷新视图。绕过它的话，改完设置要重载插件才看得到效果。
	 */
	setControlValue(key: string, value: unknown): void {
		const field = key as keyof CodeBlockSettings;
		const normalized =
			typeof value === "string" && COLOR_KEYS.has(field) ? value.toLowerCase() : value;
		this.plugin.updateSettings((settings) => {
			(settings as unknown as Record<string, unknown>)[key] = normalized;
		}, UPDATE_MODE[field]);
	}
}
