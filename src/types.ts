/** 缩略图高度计算方式，对应 CodeGlance Pro 的 Editor Size。 */
export type EditorSizeMode = "proportional" | "fit";

/** 字符栅格化方式，对应 CodeGlance Pro 的 Render Style。 */
export type RenderStyle = "clean" | "accurate";

/** 缩略图停靠在代码块的哪一侧，对应 Alignment。 */
export type MinimapAlignment = "right" | "left";

/** 点击缩略图时的定位方式，对应 Click Type。 */
export type ClickType = "code" | "mouse";

/** 何时触发跳转，对应 Jump to position on。 */
export type JumpOn = "down" | "up" | "none";
