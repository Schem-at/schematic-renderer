// UIComponents.ts - Shared UI utilities and components for consistent styling

export type UIPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface BaseUIOptions {
	enableUI?: boolean;
	uiPosition?: UIPosition;
	enableKeyboardShortcuts?: boolean;
	toggleUIShortcut?: string;
}

/**
 * Shared color palette for consistent UI styling
 */
export const UIColors = {
	// Background colors
	panelBackground: "rgba(20, 20, 25, 0.95)",
	headerBackground: "rgba(255, 255, 255, 0.03)",
	inputBackground: "rgba(255, 255, 255, 0.05)",
	hoverBackground: "rgba(255, 255, 255, 0.15)",
	activeBackground: "rgba(74, 108, 247, 0.15)",

	// Border colors
	border: "rgba(255, 255, 255, 0.1)",
	inputBorder: "rgba(255, 255, 255, 0.15)",
	activeBorder: "rgba(74, 108, 247, 0.3)",

	// Text colors
	text: "#e0e0e0",
	textMuted: "rgba(255, 255, 255, 0.7)",
	textDim: "rgba(255, 255, 255, 0.5)",

	// Accent colors
	primary: "#4a6cf7",
	primaryHover: "#5b7af8",
	success: "#4caf50",
	warning: "#ff9800",
	danger: "#ff6b6b",

	// Shadow
	shadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
};

/**
 * Shared styles for common UI elements
 */
export const UIStyles = {
	panel: {
		position: "absolute" as const,
		width: "340px",
		backgroundColor: UIColors.panelBackground,
		borderRadius: "8px",
		boxShadow: UIColors.shadow,
		fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
		fontSize: "13px",
		color: UIColors.text,
		zIndex: "1000",
		display: "none",
		overflow: "hidden",
		border: `1px solid ${UIColors.border}`,
	},

	header: {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
		padding: "12px 16px",
		borderBottom: `1px solid ${UIColors.border}`,
		background: UIColors.headerBackground,
	},

	content: {
		padding: "16px",
		display: "flex",
		flexDirection: "column" as const,
		gap: "16px",
		maxHeight: "60vh",
		overflowY: "auto" as const,
	},

	section: {
		borderBottom: `1px solid ${UIColors.border}`,
		paddingBottom: "16px",
		marginBottom: "0",
	},

	sectionTitle: {
		fontSize: "11px",
		fontWeight: "600" as const,
		textTransform: "uppercase" as const,
		color: UIColors.textMuted,
		marginBottom: "12px",
		letterSpacing: "0.5px",
	},

	label: {
		display: "block",
		fontSize: "12px",
		fontWeight: "500" as const,
		marginBottom: "6px",
		color: UIColors.textMuted,
	},

	input: {
		width: "100%",
		padding: "8px 12px",
		border: `1px solid ${UIColors.inputBorder}`,
		borderRadius: "4px",
		backgroundColor: UIColors.inputBackground,
		color: UIColors.text,
		fontSize: "13px",
		outline: "none",
		boxSizing: "border-box" as const,
	},

	select: {
		width: "100%",
		padding: "8px 12px",
		border: `1px solid ${UIColors.inputBorder}`,
		borderRadius: "4px",
		backgroundColor: UIColors.inputBackground,
		color: UIColors.text,
		fontSize: "13px",
		outline: "none",
		cursor: "pointer",
	},

	button: {
		padding: "8px 16px",
		border: "none",
		borderRadius: "4px",
		backgroundColor: UIColors.primary,
		color: "#fff",
		cursor: "pointer",
		fontSize: "13px",
		fontWeight: "500" as const,
		transition: "background-color 0.15s",
	},

	buttonSecondary: {
		padding: "8px 16px",
		border: `1px solid ${UIColors.inputBorder}`,
		borderRadius: "4px",
		backgroundColor: "transparent",
		color: UIColors.text,
		cursor: "pointer",
		fontSize: "13px",
		transition: "background-color 0.15s",
	},

	iconButton: {
		width: "28px",
		height: "28px",
		border: "none",
		borderRadius: "4px",
		backgroundColor: "rgba(255, 255, 255, 0.08)",
		color: UIColors.text,
		cursor: "pointer",
		fontSize: "12px",
		transition: "background-color 0.15s",
	},

	footer: {
		padding: "12px 16px",
		borderTop: `1px solid ${UIColors.border}`,
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
		gap: "8px",
	},
};

/**
 * Get position styles based on UIPosition
 */
export function getPositionStyles(position: UIPosition): Record<string, string> {
	const positions: Record<
		UIPosition,
		{ top?: string; right?: string; bottom?: string; left?: string }
	> = {
		"top-left": { top: "10px", left: "10px" },
		"top-right": { top: "10px", right: "10px" },
		"bottom-left": { bottom: "10px", left: "10px" },
		"bottom-right": { bottom: "10px", right: "10px" },
	};
	return positions[position] as Record<string, string>;
}

/**
 * Create a styled label element
 */
export function createLabel(text: string): HTMLLabelElement {
	const label = document.createElement("label");
	label.textContent = text;
	Object.assign(label.style, UIStyles.label);
	return label;
}

/**
 * Create a styled select element
 */
export function createSelect(
	options: { value: string; label: string }[],
	defaultValue: string,
	onChange?: (value: string) => void
): HTMLSelectElement {
	const select = document.createElement("select");
	Object.assign(select.style, UIStyles.select);

	options.forEach((opt) => {
		const option = document.createElement("option");
		option.value = opt.value;
		option.textContent = opt.label;
		option.style.backgroundColor = "#1a1a1f";
		select.appendChild(option);
	});

	select.value = defaultValue;

	select.addEventListener("focus", () => {
		select.style.borderColor = UIColors.primary;
	});
	select.addEventListener("blur", () => {
		select.style.borderColor = UIColors.inputBorder;
	});

	if (onChange) {
		select.addEventListener("change", () => onChange(select.value));
	}

	return select;
}

/**
 * Create a styled number input with optional range controls
 */
export function createNumberInput(
	value: number,
	options: {
		min?: number;
		max?: number;
		step?: number;
		unit?: string;
		onChange?: (value: number) => void;
	} = {}
): HTMLDivElement {
	const { min, max, step = 1, unit, onChange } = options;

	const container = document.createElement("div");
	Object.assign(container.style, {
		display: "flex",
		alignItems: "center",
		gap: "8px",
	});

	const input = document.createElement("input");
	input.type = "number";
	input.value = value.toString();
	if (min !== undefined) input.min = min.toString();
	if (max !== undefined) input.max = max.toString();
	input.step = step.toString();
	Object.assign(input.style, {
		...UIStyles.input,
		width: unit ? "80px" : "100%",
		flex: unit ? "0 0 80px" : "1",
	});

	input.addEventListener("focus", () => {
		input.style.borderColor = UIColors.primary;
	});
	input.addEventListener("blur", () => {
		input.style.borderColor = UIColors.inputBorder;
	});

	if (onChange) {
		input.addEventListener("change", () => {
			const val = parseFloat(input.value);
			if (!isNaN(val)) onChange(val);
		});
	}

	container.appendChild(input);

	if (unit) {
		const unitLabel = document.createElement("span");
		unitLabel.textContent = unit;
		Object.assign(unitLabel.style, {
			fontSize: "12px",
			color: UIColors.textDim,
		});
		container.appendChild(unitLabel);
	}

	return container;
}

/**
 * Create a styled toggle switch
 */
export function createToggle(
	isOn: boolean,
	onChange?: (enabled: boolean) => void | Promise<void>
): HTMLLabelElement {
	const label = document.createElement("label");
	Object.assign(label.style, {
		position: "relative",
		display: "inline-block",
		width: "36px",
		height: "20px",
		cursor: "pointer",
		flexShrink: "0",
	});

	const input = document.createElement("input");
	input.type = "checkbox";
	input.checked = isOn;
	input.style.opacity = "0";
	input.style.width = "0";
	input.style.height = "0";

	const slider = document.createElement("span");
	Object.assign(slider.style, {
		position: "absolute",
		top: "0",
		left: "0",
		right: "0",
		bottom: "0",
		backgroundColor: isOn ? UIColors.primary : "rgba(255, 255, 255, 0.2)",
		borderRadius: "20px",
		transition: "0.2s",
	});

	const knob = document.createElement("span");
	Object.assign(knob.style, {
		position: "absolute",
		height: "14px",
		width: "14px",
		left: isOn ? "19px" : "3px",
		bottom: "3px",
		backgroundColor: "#fff",
		borderRadius: "50%",
		transition: "0.2s",
	});
	slider.appendChild(knob);

	// Update visual state on change
	input.addEventListener("change", () => {
		const checked = input.checked;
		slider.style.backgroundColor = checked ? UIColors.primary : "rgba(255, 255, 255, 0.2)";
		knob.style.left = checked ? "19px" : "3px";

		if (onChange) {
			const result = onChange(checked);
			if (result instanceof Promise) {
				result.catch((err) => console.error("Toggle error:", err));
			}
		}
	});

	label.appendChild(input);
	label.appendChild(slider);

	return label;
}

/**
 * Create a styled checkbox
 */
export function createCheckbox(
	id: string,
	labelText: string,
	checked: boolean,
	onChange?: (checked: boolean) => void,
	tooltip?: string
): HTMLLabelElement {
	const container = document.createElement("label");
	Object.assign(container.style, {
		display: "flex",
		alignItems: "center",
		gap: "6px",
		cursor: "pointer",
		fontSize: "12px",
		color: UIColors.textMuted,
	});

	if (tooltip) {
		container.title = tooltip;
	}

	const input = document.createElement("input");
	input.type = "checkbox";
	input.id = id;
	input.checked = checked;
	Object.assign(input.style, {
		width: "14px",
		height: "14px",
		cursor: "pointer",
	});

	if (onChange) {
		input.addEventListener("change", () => onChange(input.checked));
	}

	container.appendChild(input);

	const label = document.createElement("span");
	label.textContent = labelText;
	container.appendChild(label);

	return container;
}

/**
 * Create a styled icon button
 */
export function createIconButton(
	icon: string,
	title: string,
	onClick: () => void
): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.textContent = icon;
	btn.title = title;
	Object.assign(btn.style, UIStyles.iconButton);

	btn.addEventListener("mouseenter", () => {
		btn.style.backgroundColor = UIColors.hoverBackground;
	});
	btn.addEventListener("mouseleave", () => {
		btn.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
	});
	btn.addEventListener("click", onClick);

	return btn;
}

/**
 * Create a styled primary button
 */
export function createButton(
	text: string,
	onClick: () => void,
	options: { primary?: boolean; disabled?: boolean } = {}
): HTMLButtonElement {
	const { primary = true, disabled = false } = options;

	const btn = document.createElement("button");
	btn.textContent = text;
	btn.disabled = disabled;
	Object.assign(btn.style, primary ? UIStyles.button : UIStyles.buttonSecondary);

	if (disabled) {
		btn.style.opacity = "0.5";
		btn.style.cursor = "not-allowed";
	}

	if (!disabled) {
		btn.addEventListener("mouseenter", () => {
			btn.style.backgroundColor = primary ? UIColors.primaryHover : UIColors.hoverBackground;
		});
		btn.addEventListener("mouseleave", () => {
			btn.style.backgroundColor = primary ? UIColors.primary : "transparent";
		});
	}

	btn.addEventListener("click", onClick);

	return btn;
}

/**
 * Create a color picker input
 */
export function createColorPicker(
	value: string,
	onChange?: (color: string) => void
): HTMLDivElement {
	const container = document.createElement("div");
	Object.assign(container.style, {
		display: "flex",
		alignItems: "center",
		gap: "8px",
	});

	const colorInput = document.createElement("input");
	colorInput.type = "color";
	colorInput.value = value;
	Object.assign(colorInput.style, {
		width: "40px",
		height: "32px",
		border: `1px solid ${UIColors.inputBorder}`,
		borderRadius: "4px",
		cursor: "pointer",
		padding: "2px",
		backgroundColor: UIColors.inputBackground,
	});

	const hexInput = document.createElement("input");
	hexInput.type = "text";
	hexInput.value = value.toUpperCase();
	Object.assign(hexInput.style, {
		...UIStyles.input,
		width: "100px",
		flex: "1",
		fontFamily: "monospace",
	});

	// Sync color picker and hex input
	colorInput.addEventListener("input", () => {
		hexInput.value = colorInput.value.toUpperCase();
		if (onChange) onChange(colorInput.value);
	});

	hexInput.addEventListener("change", () => {
		let hex = hexInput.value;
		if (!hex.startsWith("#")) hex = "#" + hex;
		if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
			colorInput.value = hex;
			hexInput.value = hex.toUpperCase();
			if (onChange) onChange(hex);
		}
	});

	container.appendChild(colorInput);
	container.appendChild(hexInput);

	return container;
}

/**
 * Create a slider with value display
 */
export function createSlider(
	value: number,
	options: {
		min?: number;
		max?: number;
		step?: number;
		showValue?: boolean;
		formatValue?: (val: number) => string;
		onChange?: (value: number) => void;
	} = {}
): HTMLDivElement {
	const {
		min = 0,
		max = 100,
		step = 1,
		showValue = true,
		formatValue = (v) => v.toString(),
		onChange,
	} = options;

	const container = document.createElement("div");
	Object.assign(container.style, {
		display: "flex",
		alignItems: "center",
		gap: "12px",
	});

	const slider = document.createElement("input");
	slider.type = "range";
	slider.min = min.toString();
	slider.max = max.toString();
	slider.step = step.toString();
	slider.value = value.toString();
	Object.assign(slider.style, {
		flex: "1",
		height: "4px",
		cursor: "pointer",
		accentColor: UIColors.primary,
	});

	container.appendChild(slider);

	let valueDisplay: HTMLSpanElement | null = null;
	if (showValue) {
		valueDisplay = document.createElement("span");
		valueDisplay.textContent = formatValue(value);
		Object.assign(valueDisplay.style, {
			fontSize: "12px",
			color: UIColors.textMuted,
			minWidth: "40px",
			textAlign: "right",
		});
		container.appendChild(valueDisplay);
	}

	slider.addEventListener("input", () => {
		const val = parseFloat(slider.value);
		if (valueDisplay) {
			valueDisplay.textContent = formatValue(val);
		}
		if (onChange) onChange(val);
	});

	return container;
}

/**
 * Create a row with label and control
 */
export function createSettingRow(
	labelText: string,
	control: HTMLElement,
	options: { tooltip?: string; fullWidth?: boolean } = {}
): HTMLDivElement {
	const { tooltip, fullWidth = false } = options;

	const row = document.createElement("div");
	Object.assign(row.style, {
		display: fullWidth ? "block" : "flex",
		justifyContent: "space-between",
		alignItems: fullWidth ? "stretch" : "center",
		gap: "12px",
		marginBottom: "12px",
	});

	const label = document.createElement("span");
	label.textContent = labelText;
	Object.assign(label.style, {
		fontSize: "12px",
		color: UIColors.textMuted,
		flexShrink: "0",
	});

	if (tooltip) {
		label.title = tooltip;
		label.style.cursor = "help";
	}

	row.appendChild(label);

	if (fullWidth) {
		const controlWrapper = document.createElement("div");
		controlWrapper.style.marginTop = "8px";
		controlWrapper.appendChild(control);
		row.appendChild(controlWrapper);
	} else {
		row.appendChild(control);
	}

	return row;
}

/**
 * Create section title
 */
export function createSectionTitle(text: string): HTMLDivElement {
	const title = document.createElement("div");
	title.textContent = text;
	Object.assign(title.style, UIStyles.sectionTitle);
	return title;
}

/**
 * Base class for UI panels
 */
export abstract class BaseUI {
	protected container: HTMLDivElement;
	protected isVisible: boolean = false;
	protected canvas: HTMLCanvasElement;
	protected options: BaseUIOptions;
	protected keydownHandler: ((e: KeyboardEvent) => void) | null = null;

	constructor(canvas: HTMLCanvasElement, options: BaseUIOptions = {}) {
		this.canvas = canvas;
		this.options = {
			enableUI: options.enableUI ?? true,
			uiPosition: options.uiPosition ?? "top-right",
			enableKeyboardShortcuts: options.enableKeyboardShortcuts ?? true,
			toggleUIShortcut: options.toggleUIShortcut,
			...options,
		};

		this.container = this.createContainer();

		if (this.options.enableKeyboardShortcuts && this.options.toggleUIShortcut) {
			this.setupKeyboardShortcuts();
		}
	}

	protected createContainer(): HTMLDivElement {
		const container = document.createElement("div");
		const pos = getPositionStyles(this.options.uiPosition!);

		Object.assign(container.style, {
			...UIStyles.panel,
			...pos,
		});

		// Append to canvas parent
		const parent = this.canvas.parentElement;
		if (parent) {
			if (getComputedStyle(parent).position === "static") {
				parent.style.position = "relative";
			}
			parent.appendChild(container);
		}

		return container;
	}

	protected createHeader(title: string, icon?: string): HTMLDivElement {
		const header = document.createElement("div");
		Object.assign(header.style, UIStyles.header);

		// Title with optional icon
		const titleContainer = document.createElement("div");
		Object.assign(titleContainer.style, {
			display: "flex",
			alignItems: "center",
			gap: "8px",
		});

		if (icon) {
			const iconSpan = document.createElement("span");
			iconSpan.textContent = icon;
			iconSpan.style.fontSize = "16px";
			titleContainer.appendChild(iconSpan);
		}

		const titleSpan = document.createElement("span");
		titleSpan.textContent = title;
		Object.assign(titleSpan.style, {
			fontWeight: "600",
			fontSize: "14px",
		});
		titleContainer.appendChild(titleSpan);
		header.appendChild(titleContainer);

		// Close Button
		const closeBtn = createIconButton("✕", "Close", () => this.hide());
		header.appendChild(closeBtn);

		return header;
	}

	protected setupKeyboardShortcuts(): void {
		this.keydownHandler = (e: KeyboardEvent) => {
			if (
				document.activeElement?.tagName === "INPUT" ||
				document.activeElement?.tagName === "TEXTAREA" ||
				document.activeElement?.tagName === "SELECT"
			) {
				return;
			}

			if (e.code === this.options.toggleUIShortcut) {
				this.toggle();
			}
		};

		document.addEventListener("keydown", this.keydownHandler);
	}

	public show(): void {
		this.isVisible = true;
		this.container.style.display = "block";
	}

	public hide(): void {
		this.isVisible = false;
		this.container.style.display = "none";
	}

	public toggle(): void {
		if (this.isVisible) {
			this.hide();
		} else {
			this.show();
		}
	}

	public isShowing(): boolean {
		return this.isVisible;
	}

	public destroy(): void {
		if (this.keydownHandler) {
			document.removeEventListener("keydown", this.keydownHandler);
		}
		this.container.remove();
	}

	public dispose(): void {
		this.destroy();
	}
}
