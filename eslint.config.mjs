// 官方社区插件审核用的 ESLint 配置。
// 提交前跑 `npm run lint`，把报出来的问题清掉，能挡掉大部分机器人验证失败。
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	// 构建产物与发布目录不参与检查
	{ ignores: ["main.js", "release/**", "node_modules/**", "tools/**"] },
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts", "eslint.config.mjs"],
		languageOptions: {
			parserOptions: {
				// 推荐配置含类型检查规则，必须指向 TS 项目
				projectService: {
					allowDefaultProject: ["eslint.config.mjs"],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
]);
