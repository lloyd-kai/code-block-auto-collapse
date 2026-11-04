/** 将触控板的细碎像素增量累计为预览行；鼠标的行/页单位仍保留原义。 */
export class WheelSteps {
	private remainder = 0;

	consume(deltaY: number, deltaMode: number): number {
		if (!Number.isFinite(deltaY)) return 0;
		const pixelsPerLine = 24;
		const delta = deltaMode === 1 ? deltaY : deltaMode === 2 ? deltaY * 9 : deltaY / pixelsPerLine;
		// 改变方向时不让旧方向的余量吞掉用户的第一下反向滚动。
		if (delta * this.remainder < 0) this.remainder = 0;
		const total = this.remainder + delta;
		const lines = Math.trunc(total);
		this.remainder = total - lines;
		return lines;
	}

	reset(): void {
		this.remainder = 0;
	}
}
