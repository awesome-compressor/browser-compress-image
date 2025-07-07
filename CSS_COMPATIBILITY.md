# CSS兼容性解决方案

## 🚀 推荐的Vite插件

### 1. Autoprefixer - 自动添加浏览器前缀

```bash
npm install -D autoprefixer
```

**vite.config.ts 配置:**

```typescript
css: {
  postcss: {
    plugins: [
      autoprefixer({
        overrideBrowserslist: [
          'Chrome >= 35',
          'Firefox >= 38',
          'Edge >= 12',
          'Explorer >= 10',
          'iOS >= 8',
          'Safari >= 8',
          'Android >= 4.4',
          'Opera >= 22',
        ],
      }),
    ],
  },
},
```

### 2. Legacy Support - 支持旧版浏览器

```bash
npm install -D @vitejs/plugin-legacy
```

**vite.config.ts 配置:**

```typescript
import legacy from '@vitejs/plugin-legacy'

plugins: [
  legacy({
    targets: ['ie >= 11'],
    additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    modernPolyfills: true,
  }),
]
```

### 3. PostCSS Preset Env - 现代CSS特性回退

```bash
npm install -D postcss-preset-env
```

**vite.config.ts 配置:**

```typescript
css: {
  postcss: {
    plugins: [
      postcssPresetEnv({
        stage: 3,
        features: {
          'nesting-rules': true,
          'custom-properties': true,
          'custom-media-queries': true,
        },
      }),
    ],
  },
},
```

### 4. CSS Nano - 生产环境CSS优化

```bash
npm install -D cssnano
```

**vite.config.ts 配置:**

```typescript
css: {
  postcss: {
    plugins: [
      process.env.NODE_ENV === 'production' ? cssnano({
        preset: ['default', {
          discardComments: { removeAll: true },
        }],
      }) : null,
    ].filter(Boolean),
  },
},
```

## 🎯 构建目标配置

**vite.config.ts:**

```typescript
build: {
  target: ['es2015', 'edge88', 'firefox78', 'chrome87', 'safari12'],
  cssTarget: ['chrome61', 'firefox60', 'safari11'],
},
```

## 📱 CSS兼容性最佳实践

### 1. 使用CSS Autoprefixer支持的属性

```css
/* 自动添加前缀 */
.element {
  display: flex;
  backdrop-filter: blur(10px);
  transform: translateY(-4px);
}

/* 编译后 */
.element {
  display: -webkit-flex;
  display: flex;
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  -webkit-transform: translateY(-4px);
  transform: translateY(-4px);
}
```

### 2. 使用@supports进行特性检测

```css
/* 检测backdrop-filter支持 */
@supports (backdrop-filter: blur(10px)) {
  .modal {
    backdrop-filter: blur(10px);
  }
}

@supports not (backdrop-filter: blur(10px)) {
  .modal {
    background: rgba(255, 255, 255, 0.95);
  }
}
```

### 3. Flexbox和Grid回退

```css
/* Flexbox 回退 */
.container {
  display: table; /* IE9+ */
  display: -webkit-flex; /* Safari */
  display: flex; /* 现代浏览器 */
}

/* Grid 回退 */
.grid {
  display: flex; /* 回退 */
  flex-wrap: wrap;
}

@supports (display: grid) {
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
}
```

### 4. 常见兼容性问题修复

#### 4.1 object-fit 兼容性

```css
.image {
  width: 100%;
  height: 400px;
  object-fit: cover;
  font-family: 'object-fit: cover;'; /* IE9-11 polyfill */
}

/* 不支持 object-fit 的回退 */
@supports not (object-fit: cover) {
  .image {
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
}
```

#### 4.2 CSS 变量回退

```css
:root {
  --primary-color: #667eea;
  --border-radius: 8px;
}

.button {
  background: #667eea; /* 回退值 */
  background: var(--primary-color);
  border-radius: 8px; /* 回退值 */
  border-radius: var(--border-radius);
}
```

#### 4.3 渐变背景兼容性

```css
.gradient {
  background: #667eea; /* 回退 */
  background: -webkit-linear-gradient(45deg, #667eea, #764ba2);
  background: -moz-linear-gradient(45deg, #667eea, #764ba2);
  background: linear-gradient(45deg, #667eea, #764ba2);
}
```

## 🔧 完整的vite.config.ts示例

```typescript
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import autoprefixer from 'autoprefixer'
import postcssPresetEnv from 'postcss-preset-env'

export default defineConfig({
  plugins: [
    Vue(),
    legacy({
      targets: ['ie >= 11'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],

  css: {
    postcss: {
      plugins: [
        autoprefixer({
          overrideBrowserslist: [
            'Chrome >= 35',
            'Firefox >= 38',
            'Edge >= 12',
            'Explorer >= 10',
            'iOS >= 8',
            'Safari >= 8',
            'Android >= 4.4',
            'Opera >= 22',
          ],
        }),
        postcssPresetEnv({
          stage: 3,
          features: {
            'nesting-rules': true,
            'custom-properties': true,
          },
        }),
      ],
    },
  },

  build: {
    target: ['es2015', 'edge88', 'firefox78', 'chrome87', 'safari12'],
    cssTarget: ['chrome61', 'firefox60', 'safari11'],
  },
})
```

## 📋 浏览器支持目标

- **Chrome**: >= 61
- **Firefox**: >= 60
- **Safari**: >= 11
- **Edge**: >= 16
- **IE**: >= 11 (通过 legacy plugin)
- **iOS Safari**: >= 10
- **Android Chrome**: >= 61

## 🛠️ 额外工具推荐

### 1. Browserslist 配置

创建 `.browserslistrc` 文件：

```
> 1%
last 2 versions
not dead
ie >= 11
```

### 2. StyleLint 配置

```bash
npm install -D stylelint stylelint-config-standard
```

**stylelint.config.js:**

```javascript
module.exports = {
  extends: ['stylelint-config-standard'],
  rules: {
    'property-no-vendor-prefix': null,
    'value-no-vendor-prefix': null,
  },
}
```

这套方案可以确保你的CSS在各种浏览器中都能正常工作，特别是解决Safari和Chrome之间的兼容性差异。
