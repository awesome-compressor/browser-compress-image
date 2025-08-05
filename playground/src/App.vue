<script setup lang="ts">
import {
  // @ts-ignore
  Picture,
  // @ts-ignore
  RefreshRight,
} from '@element-plus/icons-vue'
import GitForkVue from '@simon_he/git-fork-vue'
</script>

<template>
  <div class="app-container">
    <GitForkVue
      link="https://github.com/awesome-compressor/browser-compress-image"
      position="right"
      type="corners"
      content="Star on GitHub"
      color="#667eea"
    />

    <!-- 导航栏 -->
    <nav class="main-nav">
      <div class="nav-container">
        <div class="nav-brand">
          <vivid-typing content="Browser Image Tools" class="brand-title" />
        </div>

        <div class="nav-menu">
          <router-link
            to="/compression"
            class="nav-item"
            active-class="active"
          >
            <el-icon class="nav-icon">
              <Picture />
            </el-icon>
            <span class="nav-text">Image Compression</span>
          </router-link>

          <router-link
            to="/convert"
            class="nav-item"
            active-class="active"
          >
            <el-icon class="nav-icon">
              <RefreshRight />
            </el-icon>
            <span class="nav-text">Format Converter</span>
          </router-link>
        </div>
      </div>
    </nav>

    <!-- 路由视图 -->
    <main class="router-view-container">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 导航栏 */
.main-nav {
  position: relative;
  z-index: 50;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding: 16px 0;
}

.nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-brand {
  display: flex;
  align-items: center;
}

.brand-title {
  font-size: 1.5rem;
  font-weight: 700;
  background: linear-gradient(45deg, #fff, #e0e7ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.nav-menu {
  display: flex;
  gap: 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-weight: 500;
  font-size: 14px;
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.nav-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transition: left 0.5s;
}

.nav-item:hover::before {
  left: 100%;
}

.nav-item:hover {
  color: white;
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.nav-item.active {
  color: white;
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.nav-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 30px;
  height: 3px;
  background: linear-gradient(90deg, #4f46e5, #7c3aed);
  border-radius: 2px;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.4);
}

.nav-icon {
  font-size: 18px;
  display: flex;
  align-items: center;
  transition: transform 0.2s ease;
}

.nav-item:hover .nav-icon {
  transform: scale(1.1);
}

.nav-text {
  font-weight: 600;
  white-space: nowrap;
}

/* 路由视图容器 */
.router-view-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .nav-container {
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }

  .nav-menu {
    width: 100%;
    justify-content: center;
    flex-wrap: wrap;
  }

  .nav-item {
    flex: 1;
    min-width: 140px;
    justify-content: center;
  }

  .brand-title {
    font-size: 1.2rem;
  }
}

@media (max-width: 480px) {
  .nav-menu {
    flex-direction: column;
    width: 100%;
  }

  .nav-item {
    flex: none;
    width: 100%;
    max-width: 300px;
    margin: 0 auto;
  }

  .nav-text {
    font-size: 13px;
  }
}
</style>

<!-- 全局样式 -->
<style>
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow-x: hidden;
}

#app {
  height: 100%;
}

/* 路由过渡动画 */
.v-enter-active,
.v-leave-active {
  transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
}

.v-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

.v-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

/* 确保子页面填充整个容器 */
.router-view-container > * {
  flex: 1;
  min-height: 0;
}
</style>
