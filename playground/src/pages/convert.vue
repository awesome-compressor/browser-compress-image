<script setup lang="ts">
import type { ConvertOptions, SupportedConvertFormat } from '../../../src/imageConvert'
import {
  // @ts-expect-error
  CloseBold,
  // @ts-expect-error
  Download,
  // @ts-expect-error
  FolderOpened,
  // @ts-expect-error
  Loading,
  // @ts-expect-error
  Picture,
  // @ts-expect-error
  Refresh,
  // @ts-expect-error
  Upload,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { download } from 'lazy-js-utils'
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  convertImage,

  convertToAllFormats,
  convertWithCompressionComparison,
  getSupportedFormats,
  isSupportedFormat,

} from '../../../src/imageConvert'

// 图片转换项接口
interface ConvertItem {
  id: string
  file: File
  originalUrl: string
  originalSize: number
  convertResults: Array<{
    format: SupportedConvertFormat
    convertedUrl?: string
    convertedSize?: number
    success: boolean
    error?: string
  }>
  isConverting: boolean
  convertError?: string
}

// 响应式状态
const loading = ref(false)
const fileRef = ref()
const isDragOver = ref(false)
const currentImageIndex = ref(0)

// 转换配置
const convertQuality = ref(0.9) // 转换质量
const targetFormat = ref<SupportedConvertFormat>('webp') // 目标格式
const compareStrategies = ref(false) // 是否比较压缩策略

// 图片列表状态
const imageItems = ref<ConvertItem[]>([])

// 支持的格式列表
const supportedFormats: { value: SupportedConvertFormat, label: string }[] = [
  { value: 'webp', label: 'WebP' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
]

// 计算属性
const hasImages = computed(() => imageItems.value.length > 0)
const currentImage = computed(() => imageItems.value[currentImageIndex.value])
const convertedCount = computed(
  () => imageItems.value.filter(item =>
    item.convertResults.some(result => result.success),
  ).length,
)
const totalOriginalSize = computed(() =>
  imageItems.value.reduce((sum, item) => sum + item.originalSize, 0),
)
const totalConvertedSize = computed(() =>
  imageItems.value.reduce((sum, item) => {
    const successfulResults = item.convertResults.filter(r => r.success)
    return sum + (successfulResults.length > 0
      ? Math.min(...successfulResults.map(r => r.convertedSize || 0))
      : 0)
  }, 0),
)

// 检查并过滤不支持的文件
function filterAndNotifyUnsupportedFiles(files: File[]): File[] {
  const imageFiles = files.filter(file => file.type.startsWith('image/'))
  const supportedFiles = imageFiles.filter(file =>
    isSupportedFormat(file.type),
  )
  const unsupportedFiles = imageFiles.filter(
    file => !isSupportedFormat(file.type),
  )

  if (unsupportedFiles.length > 0) {
    ElMessage({
      message: `已过滤 ${unsupportedFiles.length} 个不支持格式转换的图片文件`,
      type: 'warning',
      duration: 3000,
    })
  }

  const nonImageFiles = files.filter(file => !file.type.startsWith('image/'))
  if (nonImageFiles.length > 0) {
    ElMessage({
      message: `检测到 ${nonImageFiles.length} 个非图片文件已被过滤`,
      type: 'info',
      duration: 3000,
    })
  }

  return supportedFiles
}

// 拖拽事件处理
function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

function handleDragEnter(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.items) {
    const hasImageOrFolder = Array.from(e.dataTransfer.items).some(
      item =>
        (item.kind === 'file' && item.type.startsWith('image/'))
        || (item.kind === 'file' && item.type === ''),
    )
    if (hasImageOrFolder) {
      isDragOver.value = true
    }
  }
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  if (
    !e.relatedTarget
    || !document.querySelector('.convert-container')?.contains(e.relatedTarget as Node)
  ) {
    isDragOver.value = false
  }
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false

  const files = Array.from(e.dataTransfer?.files || [])
  if (files.length === 0)
    return

  const imageFiles = filterAndNotifyUnsupportedFiles(files)
  if (imageFiles.length === 0) {
    ElMessage({
      message: '没有找到支持的图片文件',
      type: 'warning',
    })
    return
  }

  await addNewImages(imageFiles)
}

// 文件输入处理
async function handleFileInputChange() {
  const selectedFiles = Array.from(fileRef.value.files || []) as File[]
  if (selectedFiles.length > 0) {
    const imageFiles = filterAndNotifyUnsupportedFiles(selectedFiles)

    if (imageFiles.length === 0) {
      ElMessage({
        message: '没有找到支持的图片文件',
        type: 'warning',
      })
      return
    }

    await addNewImages(imageFiles)
    fileRef.value.value = ''
  }
}

// 添加新图片到列表
async function addNewImages(files: File[]) {
  loading.value = true

  try {
    const newItems: ConvertItem[] = files.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      originalUrl: URL.createObjectURL(file),
      originalSize: file.size,
      convertResults: [],
      isConverting: false,
    }))

    imageItems.value.push(...newItems)

    // 自动开始转换
    for (const item of newItems) {
      await convertImageItem(item)
    }

    ElMessage({
      message: `成功添加并转换了 ${files.length} 张图片`,
      type: 'success',
    })
  }
  catch (error) {
    console.error('添加图片失败:', error)
    ElMessage({
      message: '添加图片失败',
      type: 'error',
    })
  }
  finally {
    loading.value = false
  }
}

// 转换单个图片
async function convertImageItem(item: ConvertItem) {
  if (item.isConverting)
    return

  item.isConverting = true
  item.convertError = undefined
  item.convertResults = []

  try {
    const options: ConvertOptions = {
      quality: convertQuality.value,
      type: 'blob',
    }

    if (compareStrategies.value) {
      // 使用压缩策略比较
      const result = await convertWithCompressionComparison(
        item.file,
        targetFormat.value,
        options,
      )

      item.convertResults = [{
        format: targetFormat.value,
        convertedUrl: URL.createObjectURL(result.bestResult as Blob),
        convertedSize: (result.bestResult as Blob).size,
        success: true,
      }]
    }
    else {
      // 转换为所有支持的格式
      const availableFormats = getSupportedFormats(item.file.type)

      for (const format of availableFormats) {
        try {
          const result = await convertImage(item.file, format, options)

          if (result.success && result.result instanceof Blob) {
            item.convertResults.push({
              format,
              convertedUrl: URL.createObjectURL(result.result),
              convertedSize: result.convertedSize,
              success: true,
            })
          }
          else {
            item.convertResults.push({
              format,
              success: false,
              error: result.error || 'Conversion failed',
            })
          }
        }
        catch (error) {
          item.convertResults.push({
            format,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
    }
  }
  catch (error) {
    console.error('图片转换失败:', error)
    item.convertError = error instanceof Error ? error.message : 'Unknown error'
    ElMessage({
      message: `转换 ${item.file.name} 失败: ${item.convertError}`,
      type: 'error',
    })
  }
  finally {
    item.isConverting = false
  }
}

// 重新转换图片
async function reconvertImage(item: ConvertItem) {
  await convertImageItem(item)
}

// 上传图片
function uploadImages() {
  document.getElementById('file')?.click()
}

// 删除图片
function deleteImage(index: number) {
  const item = imageItems.value[index]
  URL.revokeObjectURL(item.originalUrl)

  // 清理转换结果的URLs
  item.convertResults.forEach((result) => {
    if (result.convertedUrl) {
      URL.revokeObjectURL(result.convertedUrl)
    }
  })

  imageItems.value.splice(index, 1)

  if (currentImageIndex.value >= imageItems.value.length) {
    currentImageIndex.value = Math.max(0, imageItems.value.length - 1)
  }
}

// 清空所有图片
function clearAllImages() {
  imageItems.value.forEach((item) => {
    URL.revokeObjectURL(item.originalUrl)
    item.convertResults.forEach((result) => {
      if (result.convertedUrl) {
        URL.revokeObjectURL(result.convertedUrl)
      }
    })
  })

  imageItems.value = []
  currentImageIndex.value = 0

  ElMessage({
    message: '已清空所有图片',
    type: 'success',
  })
}

// 下载单个转换结果
async function downloadConvertedImage(item: ConvertItem, result: any) {
  if (!result.convertedUrl)
    return

  try {
    const fileName = `${item.file.name.replace(/\.[^/.]+$/, '')}.${result.format}`
    download(result.convertedUrl, fileName)

    ElMessage({
      message: `已下载: ${fileName}`,
      type: 'success',
      duration: 2000,
    })
  }
  catch (error) {
    ElMessage({
      message: '下载失败',
      type: 'error',
    })
  }
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

// 设置当前预览图片
function setCurrentImage(index: number) {
  currentImageIndex.value = index
}

// 生命周期钩子
onMounted(() => {
  console.log('Image convert page mounted')

  // 添加拖拽事件监听
  document.addEventListener('dragover', handleDragOver)
  document.addEventListener('drop', handleDrop)
  document.addEventListener('dragenter', handleDragEnter)
  document.addEventListener('dragleave', handleDragLeave)
})

onBeforeUnmount(() => {
  // 清理事件监听器
  document.removeEventListener('dragover', handleDragOver)
  document.removeEventListener('drop', handleDrop)
  document.removeEventListener('dragenter', handleDragEnter)
  document.removeEventListener('dragleave', handleDragLeave)

  // 清理所有对象URL
  imageItems.value.forEach((item) => {
    URL.revokeObjectURL(item.originalUrl)
    item.convertResults.forEach((result) => {
      if (result.convertedUrl) {
        URL.revokeObjectURL(result.convertedUrl)
      }
    })
  })

  console.log('Image convert page unmounted')
})
</script>

<template>
  <div class="convert-container" :class="{ 'drag-over': isDragOver }">
    <!-- 拖拽覆盖层 -->
    <div v-show="isDragOver" class="drag-overlay">
      <div class="drag-message">
        <el-icon class="drag-icon">
          <FolderOpened />
        </el-icon>
        <div class="drag-text">
          Drop images here to convert
        </div>
        <div class="drag-subtitle">
          Support PNG, JPG, JPEG, WebP formats
        </div>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-show="loading" class="loading-overlay">
      <div class="loading-spinner">
        <el-icon class="is-loading" size="40px">
          <Loading />
        </el-icon>
        <div class="loading-text">
          Processing images...
        </div>
      </div>
    </div>

    <!-- Header -->
    <header class="header-section">
      <div class="title-container">
        <vivid-typing content="Image Format Converter" class="main-title" />
        <p class="subtitle">
          Convert your images between different formats with ease
        </p>
      </div>
    </header>

    <!-- Main Content -->
    <main class="main-content">
      <!-- 转换设置区域 -->
      <section class="settings-section">
        <div class="settings-container">
          <div class="setting-group">
            <label class="setting-label">Target Format:</label>
            <el-select v-model="targetFormat" class="format-select">
              <el-option
                v-for="format in supportedFormats"
                :key="format.value"
                :label="format.label"
                :value="format.value"
              />
            </el-select>
          </div>

          <div class="setting-group">
            <label class="setting-label">Quality:</label>
            <div class="quality-control">
              <el-slider
                v-model="convertQuality"
                :min="0.1"
                :max="1"
                :step="0.1"
                :show-tooltip="false"
                class="quality-slider"
              />
              <span class="quality-value">{{ Math.round(convertQuality * 100) }}%</span>
            </div>
          </div>

          <div class="setting-group">
            <el-checkbox v-model="compareStrategies">
              Compare compression strategies
            </el-checkbox>
          </div>
        </div>
      </section>

      <!-- 初始上传区域 -->
      <section v-if="!hasImages" class="upload-zone">
        <button class="upload-btn-hero" @click="uploadImages">
          <el-icon class="upload-icon">
            <Picture />
          </el-icon>
          <span class="upload-text">Drop, Click to Upload Images</span>
          <span class="upload-hint">
            Support PNG, JPG, JPEG, WebP formats for conversion
          </span>
        </button>
      </section>

      <!-- 工具栏 -->
      <div v-if="hasImages" class="floating-toolbar">
        <div class="toolbar-section files-section">
          <div class="files-info">
            <div class="files-icon">
              🔄
            </div>
            <span class="files-count">{{ imageItems.length }} image(s)</span>
            <span class="converted-count">({{ convertedCount }} converted)</span>
          </div>

          <div class="action-buttons">
            <button class="action-btn add-btn" @click="uploadImages">
              <el-icon><Upload /></el-icon>
              <span class="btn-text">Add More</span>
            </button>
            <button class="action-btn delete-btn" @click="clearAllImages">
              <el-icon><CloseBold /></el-icon>
              <span class="btn-text">Clear All</span>
            </button>
          </div>
        </div>

        <div class="toolbar-divider" />

        <div class="toolbar-section stats-section">
          <div class="stats-info">
            <span class="size-label">
              Total: {{ formatFileSize(totalOriginalSize) }} →
              {{ formatFileSize(totalConvertedSize) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 图片列表和转换结果 -->
      <section v-if="hasImages" class="images-section">
        <!-- 图片列表 -->
        <div class="images-grid">
          <div
            v-for="(item, index) in imageItems"
            :key="item.id"
            class="image-card"
            :class="{ active: index === currentImageIndex }"
            @click="setCurrentImage(index)"
          >
            <div class="image-preview">
              <img
                class="preview-image"
                :src="item.originalUrl"
                :alt="item.file.name"
              >
              <div v-if="item.isConverting" class="converting-overlay">
                <el-icon class="is-loading">
                  <Loading />
                </el-icon>
              </div>
              <div v-if="item.convertError" class="error-overlay">
                <span class="error-text">Error</span>
              </div>
            </div>

            <div class="image-info">
              <div class="image-header">
                <div class="image-name" :title="item.file.name">
                  {{ item.file.name }}
                </div>
                <div class="image-format">
                  {{ item.file.type.split('/')[1].toUpperCase() }}
                </div>
              </div>

              <div class="conversion-results">
                <div class="original-size">
                  Original: {{ formatFileSize(item.originalSize) }}
                </div>

                <div v-if="item.convertResults.length > 0" class="convert-results">
                  <div
                    v-for="result in item.convertResults"
                    :key="result.format"
                    class="result-item"
                    :class="{ success: result.success, error: !result.success }"
                  >
                    <div class="result-format">
                      {{ result.format.toUpperCase() }}
                    </div>
                    <div v-if="result.success" class="result-info">
                      <span class="result-size">{{ formatFileSize(result.convertedSize || 0) }}</span>
                      <button
                        class="download-btn-small"
                        @click.stop="downloadConvertedImage(item, result)"
                      >
                        <el-icon><Download /></el-icon>
                      </button>
                    </div>
                    <div v-else class="result-error">
                      {{ result.error || 'Failed' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="image-actions">
              <button
                class="action-btn-small reconvert-btn"
                title="重新转换"
                :disabled="item.isConverting"
                @click.stop="reconvertImage(item)"
              >
                <el-icon>
                  <Refresh />
                </el-icon>
              </button>
              <button
                class="action-btn-small delete-single"
                title="删除图片"
                @click.stop="deleteImage(index)"
              >
                <el-icon>
                  <CloseBold />
                </el-icon>
              </button>
            </div>
          </div>
        </div>

        <!-- 当前图片预览 -->
        <div v-if="currentImage" class="current-image-preview">
          <div class="preview-container">
            <img
              :src="currentImage.originalUrl"
              :alt="currentImage.file.name"
              class="preview-image-large"
            >
            <div class="preview-info">
              <h3>{{ currentImage.file.name }}</h3>
              <p>Original Size: {{ formatFileSize(currentImage.originalSize) }}</p>
              <p>Format: {{ currentImage.file.type }}</p>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 隐藏的文件输入 -->
    <input
      id="file"
      ref="fileRef"
      type="file"
      accept="image/png,image/jpg,image/jpeg,image/webp"
      multiple
      hidden
      @change="handleFileInputChange"
    >
  </div>
</template>

<style scoped>
.convert-container {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
  overflow-x: hidden;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
}

.convert-container.drag-over {
  background: linear-gradient(135deg, #667eea 20%, #764ba2 80%);
}

/* 拖拽覆盖层 */
.drag-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(102, 126, 234, 0.9);
  backdrop-filter: blur(10px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 103;
  animation: fadeIn 0.2s ease;
}

.drag-message {
  text-align: center;
  color: white;
  padding: 40px;
  border: 3px dashed rgba(255, 255, 255, 0.8);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  max-width: 480px;
}

.drag-icon {
  font-size: 64px;
  opacity: 0.9;
}

.drag-text {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.drag-subtitle {
  font-size: 14px;
  opacity: 0.7;
  font-weight: 400;
  line-height: 1.6;
  margin: 0;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Loading Overlay */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.95), rgba(118, 75, 162, 0.95));
  backdrop-filter: blur(10px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.loading-spinner {
  text-align: center;
  color: white;
}

.loading-text {
  margin-top: 16px;
  font-size: 18px;
  font-weight: 500;
}

/* Header */
.header-section {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 60px 20px 40px;
}

.title-container {
  width: 100%;
  margin: 0 auto;
}

.main-title {
  font-size: 3.5rem;
  font-weight: 800;
  background: linear-gradient(45deg, #fff, #e0e7ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 16px;
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.subtitle {
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.2rem;
  font-weight: 300;
  margin: 0;
}

/* Main Content */
.main-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  max-width: 100vw;
  margin: 0;
  padding: 0;
}

/* 设置区域 */
.settings-section {
  padding: 0 20px 30px;
  display: flex;
  justify-content: center;
}

.settings-container {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  gap: 24px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
}

.setting-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-label {
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.format-select {
  width: 120px;
}

.quality-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.quality-slider {
  width: 100px;
}

.quality-value {
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  min-width: 40px;
}

/* 上传区域 */
.upload-zone {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.upload-btn-hero {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  border: 2px dashed rgba(255, 255, 255, 0.3);
  border-radius: 24px;
  padding: 60px 40px;
  color: white;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  transition: all 0.3s ease;
  min-width: 400px;
  text-align: center;
}

.upload-btn-hero:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.5);
  transform: translateY(-4px);
}

.upload-icon {
  font-size: 48px;
  opacity: 0.8;
}

.upload-text {
  font-size: 20px;
  font-weight: 700;
}

.upload-hint {
  font-size: 14px;
  opacity: 0.7;
  font-weight: 400;
  line-height: 1.4;
}

/* 工具栏 */
.floating-toolbar {
  margin: auto;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 90vw;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.toolbar-divider {
  width: 1px;
  height: 32px;
  background: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.1), transparent);
  margin: 0 6px;
}

.files-section {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 200px;
}

.files-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.files-icon {
  font-size: 16px;
  opacity: 0.8;
}

.files-count {
  font-size: 12px;
  color: #374151;
  font-weight: 500;
}

.converted-count {
  font-size: 12px;
  color: #6b7280;
  font-weight: 400;
}

.action-buttons {
  display: flex;
  gap: 6px;
}

.action-btn {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 6px 10px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.btn-text {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
}

.add-btn:hover {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  border-color: rgba(59, 130, 246, 0.3);
}

.delete-btn:hover {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  border-color: rgba(239, 68, 68, 0.3);
}

.stats-section {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.stats-info {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 45px;
  min-width: 230px;
}

.size-label {
  font-size: 11px;
  color: #374151;
  font-weight: 500;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

/* 图片区域 */
.images-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 20px;
}

.images-grid {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.image-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  flex: 0 0 220px;
  width: 220px;
}

.image-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  border-color: rgba(102, 126, 234, 0.3);
}

.image-card.active {
  border-color: #667eea;
  box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
}

.image-preview {
  position: relative;
  width: 100%;
  height: 120px;
  overflow: hidden;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.image-card:hover .preview-image {
  transform: scale(1.05);
}

.converting-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 16px;
}

.converting-overlay {
  background: rgba(102, 126, 234, 0.8);
}

.error-overlay {
  background: rgba(239, 68, 68, 0.8);
}

.error-text {
  font-size: 12px;
  font-weight: 600;
}

.image-info {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.image-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.image-name {
  font-size: 12px;
  font-weight: 600;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.image-format {
  font-size: 9px;
  font-weight: 700;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.conversion-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.original-size {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
}

.convert-results {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
}

.result-item.success {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.result-item.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.result-format {
  font-weight: 600;
  color: #374151;
}

.result-info {
  display: flex;
  align-items: center;
  gap: 4px;
}

.result-size {
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  color: #059669;
  font-weight: 600;
}

.result-error {
  color: #dc2626;
  font-size: 9px;
}

.download-btn-small {
  background: #10b981;
  border: none;
  border-radius: 4px;
  padding: 2px 4px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  font-size: 10px;
  transition: all 0.2s ease;
}

.download-btn-small:hover {
  background: #059669;
  transform: scale(1.1);
}

.image-actions {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  background: #f8fafc;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.action-btn-small {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  padding: 4px 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn-small:hover {
  background: #f3f4f6;
  transform: translateY(-1px);
}

.action-btn-small:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.reconvert-btn:hover {
  background: #dbeafe;
  border-color: #3b82f6;
}

.delete-single:hover {
  background: #fee2e2;
  border-color: #ef4444;
}

/* 当前图片预览 */
.current-image-preview {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 20px;
}

.preview-container {
  display: flex;
  gap: 20px;
  align-items: center;
}

.preview-image-large {
  max-width: 300px;
  max-height: 200px;
  object-fit: contain;
  border-radius: 8px;
}

.preview-info {
  color: rgba(255, 255, 255, 0.9);
}

.preview-info h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
}

.preview-info p {
  margin: 4px 0;
  font-size: 14px;
  opacity: 0.8;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .main-title {
    font-size: 2.5rem;
  }

  .settings-container {
    flex-direction: column;
    gap: 16px;
  }

  .floating-toolbar {
    flex-direction: column;
    gap: 12px;
    margin: 20px;
    padding: 12px;
  }

  .toolbar-divider {
    width: 100%;
    height: 1px;
    background: linear-gradient(to right, transparent, rgba(0, 0, 0, 0.1), transparent);
    margin: 0;
  }

  .image-card {
    flex: 0 0 180px;
    width: 180px;
  }

  .preview-container {
    flex-direction: column;
    text-align: center;
  }
}
</style>
