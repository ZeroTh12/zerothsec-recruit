import { defineConfig } from 'vite';

// 纯静态多页站点：开发时用 Vite 作为本地服务器即可。
// 部署到 GitHub Pages 时直接发布仓库根目录，无需构建。
export default defineConfig({
  server: {
    port: 5173,
  },
});
