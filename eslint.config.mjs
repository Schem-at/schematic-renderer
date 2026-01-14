import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: "module",
			},
		},
		rules: {
			// TypeScript-specific rules - relaxed for existing codebase
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-non-null-assertion": "warn",
			"@typescript-eslint/ban-ts-comment": "warn",

			// General rules - relaxed for existing codebase
			"no-console": "off",
			"prefer-const": "warn",
			"no-var": "warn",
			"no-case-declarations": "warn",
			"no-async-promise-executor": "warn",
			"@typescript-eslint/no-unused-expressions": "warn",
			"no-empty": "warn",
			"no-useless-catch": "warn",
			"no-prototype-builtins": "warn",
			"@typescript-eslint/no-this-alias": "warn",
		},
	},
	{
		files: ["src/workers/**/*.ts", "src/wasm/**/*.js"],
		languageOptions: {
			globals: {
				console: "readonly",
				TextEncoder: "readonly",
				TextDecoder: "readonly",
				WebAssembly: "readonly",
				Response: "readonly",
				self: "readonly",
				postMessage: "readonly",
				fetch: "readonly",
			},
		},
		rules: {
			// Workers and WASM modules have different global context
			"no-restricted-globals": "off",
			"no-undef": "off",
			"@typescript-eslint/no-unused-vars": "off",
		},
	},
	{
		files: ["**/*.test.ts", "**/*.spec.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"test/**",
			"*.config.js",
			"*.config.mjs",
			"mesh_builder_wasm/**",
			"nucleation_local/**",
		],
	}
);
