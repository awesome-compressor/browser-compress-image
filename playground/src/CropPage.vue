<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { ElMessage } from 'element-plus'
// @ts-ignore
import {
  Aim,
  CloseBold,
  Download,
  Refresh,
  ZoomIn,
  ZoomOut,
} from '@element-plus/icons-vue'

interface Props {
  originalUrl: string
  compressedUrl: string
  originalName?: string
  compressedName?: string
  originalSize?: number
  compressedSize?: number
  onClose?: () => void
}

const props = defineProps<Props>()
const emit = defineEmits(['close', 'apply'])

const originalImgRef = ref<HTMLImageElement | null>(null)
const compressedImgRef = ref<HTMLImageElement | null>(null)
const originalCropper = ref<Cropper | null>(null)
const compressedCropper = ref<Cropper | null>(null)

// sync + zoom state
const syncing = ref(false)
const zoomLevel = ref(1)
const originalDims = ref<{ w: number; h: number } | null>(null)
const compressedDims = ref<{ w: number; h: number } | null>(null)
const cropDimensions = ref<{ w: number; h: number } | null>(null)
// Aspect ratio & export settings
const aspectRatio = ref<number | null>(null) // null => free
const exportFormat = ref<'png' | 'jpeg' | 'webp'>('png')
let exportQuality = 0.9
const presets = [
  { label: '自由', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:2', value: 3 / 2 },
]
// Focus mode handling (show only one pane emphasized)
const focusMode = ref<'none' | 'original' | 'compressed'>('none')
let initialCanvasData: Cropper.CanvasData | null = null

// Mobile layout state
const activeMobilePane = ref<'original' | 'compressed'>('original')
const isMobile = ref(false)
const showRatioDropdown = ref(false)

function selectRatio(ratio: number | null) {
  aspectRatio.value = ratio
  showRatioDropdown.value = false
  applyAspectRatio()
}

function getCurrentRatioLabel() {
  const preset = presets.find((p) => p.value === aspectRatio.value)
  return preset?.label || '自由'
}

function updateIsMobile() {
  isMobile.value = window.innerWidth <= 780
}

function formatSize(bytes?: number) {
  if (bytes == null) return ''
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`
}

// prevent wheel native zoom
function preventWheel(e: WheelEvent) {
  e.preventDefault()
  e.stopPropagation()
}

// 存储滚动位置
const savedScrollY = ref(0)

// 阻止弹窗区域的滚动事件传播到背景
function preventBackgroundScroll(e: WheelEvent) {
  // 阻止滚动事件传播到背景页面
  e.preventDefault()
  e.stopPropagation()
}

function initCroppers() {
  const common: Cropper.Options = {
    viewMode: 1,
    dragMode: 'none',
    autoCrop: true,
    zoomable: false, // disable internal zoom; we implement custom
    movable: true,
    rotatable: false,
    scalable: false,
    background: false,
    modal: true,
    guides: true,
    highlight: true,
    responsive: true,
  }

  if (originalImgRef.value && !originalCropper.value) {
    originalCropper.value = new Cropper(originalImgRef.value, {
      ...common,
      ready() {
        if (!initialCanvasData) {
          initialCanvasData = originalCropper.value!.getCanvasData()
          // Ensure compressed canvas matches dimensions BEFORE default crop
          if (compressedCropper.value) {
            compressedCropper.value.setCanvasData(initialCanvasData)
          }
          setDefaultCrop()
        }
        if (originalImgRef.value) {
          originalDims.value = {
            w: originalImgRef.value.naturalWidth,
            h: originalImgRef.value.naturalHeight,
          }
        }
      },
      crop() {
        if (!syncing.value) {
          syncCrop('original')
          updateCropDimensions(originalCropper.value!)
        }
      },
    })
  }
  if (compressedImgRef.value && !compressedCropper.value) {
    compressedCropper.value = new Cropper(compressedImgRef.value, {
      ...common,
      ready() {
        if (!initialCanvasData) {
          initialCanvasData = compressedCropper.value!.getCanvasData()
          if (originalCropper.value) {
            originalCropper.value.setCanvasData(initialCanvasData)
          }
          setDefaultCrop()
        }
        if (compressedImgRef.value) {
          compressedDims.value = {
            w: compressedImgRef.value.naturalWidth,
            h: compressedImgRef.value.naturalHeight,
          }
        }
      },
      crop() {
        if (!syncing.value) {
          syncCrop('compressed')
          updateCropDimensions(compressedCropper.value!)
        }
      },
    })
  }
}

function setDefaultCrop() {
  if (!originalCropper.value || !compressedCropper.value) return
  const canvas = originalCropper.value.getCanvasData()
  const size = Math.min(canvas.width, canvas.height) * 0.8
  const data = {
    left: canvas.left + (canvas.width - size) / 2,
    top: canvas.top + (canvas.height - size) / 2,
    width: size,
    height: size,
  }
  originalCropper.value.setCropBoxData(data)
  compressedCropper.value.setCropBoxData(data)

  // Update crop dimensions after setting default crop
  updateCropDimensions(originalCropper.value)
}

function syncCrop(from: 'original' | 'compressed') {
  const src =
    from === 'original' ? originalCropper.value : compressedCropper.value
  const dst =
    from === 'original' ? compressedCropper.value : originalCropper.value
  if (!src || !dst) return
  syncing.value = true
  const box = src.getCropBoxData()
  dst.setCropBoxData({
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
  })

  // Update crop dimensions
  updateCropDimensions(src)

  syncing.value = false
}

function updateCropDimensions(cropper: Cropper) {
  if (!cropper) return
  const cropData = cropper.getCropBoxData()
  const canvasData = cropper.getCanvasData()
  const imageData = cropper.getImageData()

  // Calculate actual pixel dimensions based on crop box and image scaling
  const scaleX = imageData.naturalWidth / canvasData.width
  const scaleY = imageData.naturalHeight / canvasData.height

  const actualWidth = Math.round(cropData.width * scaleX)
  const actualHeight = Math.round(cropData.height * scaleY)

  cropDimensions.value = { w: actualWidth, h: actualHeight }
}

function applyAspectRatio() {
  const ratio = aspectRatio.value ?? NaN
  originalCropper.value?.setAspectRatio(ratio)
  compressedCropper.value?.setAspectRatio(ratio)
  // Update dimensions after aspect ratio change
  if (originalCropper.value) {
    updateCropDimensions(originalCropper.value)
  }
}

// (reserved) setAspect helper kept for potential external triggers
// function setAspect(r: number | null) {
//   aspectRatio.value = r
//   applyAspectRatio()
// }

function applyZoom() {
  if (!originalCropper.value || !compressedCropper.value || !initialCanvasData)
    return
  const factor = zoomLevel.value
  const base = initialCanvasData
  const centered = (c: Cropper) => {
    const newData: Cropper.CanvasData = {
      ...base,
      width: base.width * factor,
      height: base.height * factor,
      left: base.left - (base.width * factor - base.width) / 2,
      top: base.top - (base.height * factor - base.height) / 2,
    }
    c.setCanvasData(newData)
  }
  centered(originalCropper.value)
  centered(compressedCropper.value)
  // keep crop box inside after zoom
  syncCrop('original')
}

function zoomIn() {
  zoomLevel.value = Math.min(zoomLevel.value * 1.2, 5)
  applyZoom()
}
function zoomOut() {
  zoomLevel.value = Math.max(zoomLevel.value / 1.2, 0.2)
  applyZoom()
}
function resetZoom() {
  zoomLevel.value = 1
  if (initialCanvasData && originalCropper.value && compressedCropper.value) {
    originalCropper.value.setCanvasData(initialCanvasData)
    compressedCropper.value.setCanvasData(initialCanvasData)
  }
  setDefaultCrop()
}

function resetAll() {
  resetZoom()
  ElMessage.success('Reset successful')
}

function download(which: 'original' | 'compressed' | 'both') {
  const doDownload = (c: Cropper | null, label: string) => {
    if (!c) return
    const mime =
      exportFormat.value === 'png'
        ? 'image/png'
        : exportFormat.value === 'jpeg'
          ? 'image/jpeg'
          : 'image/webp'
    const canvas = c.getCroppedCanvas({})
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${label}-cropped.${exportFormat.value === 'jpeg' ? 'jpg' : exportFormat.value}`
        a.click()
        URL.revokeObjectURL(url)
      },
      mime,
      exportFormat.value === 'png' ? undefined : exportQuality,
    )
  }
  if (which === 'both') {
    doDownload(originalCropper.value, 'original')
    doDownload(compressedCropper.value, 'compressed')
    ElMessage.success('Downloaded both cropped images')
  } else {
    doDownload(
      which === 'original' ? originalCropper.value : compressedCropper.value,
      which,
    )
    ElMessage.success(`Downloaded ${which} cropped image`)
  }
}

function close() {
  // 添加关闭动画
  const cropPage = document.querySelector('.crop-page') as HTMLElement
  const backdrop = document.querySelector('.crop-backdrop') as HTMLElement

  if (cropPage && backdrop) {
    // 关闭动画
    cropPage.style.animation =
      'pageSlideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards'
    backdrop.style.animation = 'backdropFadeOut 0.3s ease forwards'

    // 延迟执行关闭逻辑
    setTimeout(() => {
      // 恢复body滚动和滚动位置
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''

      // 恢复滚动位置
      window.scrollTo(0, savedScrollY.value)

      emit('close')
      props.onClose?.()
    }, 300)
  } else {
    // 回退方案
    document.body.style.overflow = ''
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''

    window.scrollTo(0, savedScrollY.value)

    emit('close')
    props.onClose?.()
  }
}

// 生成预处理配置并提交
function applyAndReturn() {
  if (!originalCropper.value) {
    emit('close')
    return
  }
  const c = originalCropper.value
  const cropData = c.getCropBoxData()
  const canvasData = c.getCanvasData()
  const imageData = c.getImageData()
  // 计算像素坐标
  const scaleX = imageData.naturalWidth / canvasData.width
  const scaleY = imageData.naturalHeight / canvasData.height
  const crop = {
    x: Math.round((cropData.left - canvasData.left) * scaleX),
    y: Math.round((cropData.top - canvasData.top) * scaleY),
    width: Math.round(cropData.width * scaleX),
    height: Math.round(cropData.height * scaleY),
  }
  // 当前实现仅输出裁剪尺寸，缩放由主界面决定；旋转/翻转留空
  emit('apply', {
    crop,
  })
}

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (showRatioDropdown.value) {
      showRatioDropdown.value = false
      return
    }
    close()
  } else if (e.key === '+' || e.key === '=') {
    zoomIn()
    e.preventDefault()
  } else if (e.key === '-') {
    zoomOut()
    e.preventDefault()
  } else if (e.key === '0') {
    resetZoom()
    e.preventDefault()
  } else if (e.key.toLowerCase() === 'r') {
    resetAll()
    e.preventDefault()
  }
}

// Close dropdown when clicking outside
function handleClickOutside(e: MouseEvent) {
  const dropdown = document.querySelector('.custom-dropdown')
  if (dropdown && !dropdown.contains(e.target as Node)) {
    showRatioDropdown.value = false
  }
}

onMounted(() => {
  updateIsMobile()
  // 记录当前滚动位置
  savedScrollY.value = window.scrollY

  // 禁用body滚动并固定位置
  document.body.style.overflow = 'hidden'
  document.body.style.position = 'fixed'
  document.body.style.top = `-${savedScrollY.value}px`
  document.body.style.width = '100%'

  // 设置弹窗位置，让它显示在视口中心
  const cropPage = document.querySelector('.crop-page') as HTMLElement
    if (cropPage) {
      // Position the popup at the current page scrollTop so it aligns with
      // the viewport at the moment of opening. Use the previously saved
      // scroll position (savedScrollY) which reflects window.scrollY.
      cropPage.style.top = `${savedScrollY.value}px`

      cropPage.style.height = '100vh'
    }

  initCroppers()
  window.addEventListener('wheel', preventWheel, { passive: false })
  window.addEventListener('keydown', handleKey)
  window.addEventListener('click', handleClickOutside)
  window.addEventListener('resize', updateIsMobile)
})

onBeforeUnmount(() => {
  // 恢复body滚动和滚动位置
  document.body.style.overflow = ''
  document.body.style.position = ''
  document.body.style.top = ''
  document.body.style.width = ''

  // 恢复滚动位置
  window.scrollTo(0, savedScrollY.value)

  window.removeEventListener('wheel', preventWheel)
  window.removeEventListener('keydown', handleKey)
  window.removeEventListener('click', handleClickOutside)
  window.removeEventListener('resize', updateIsMobile)
  originalCropper.value?.destroy()
  compressedCropper.value?.destroy()
})
</script>

<template>
  <!-- Background Overlay -->
  <div
    class="crop-backdrop"
    @wheel="preventBackgroundScroll"
    @click="close"
  ></div>

  <div
    class="crop-page"
    @wheel="preventBackgroundScroll"
    @click.stop
    :class="{
      'focus-compressed': focusMode === 'compressed',
      'mobile-layout': isMobile,
    }"
  >
    <!-- Modern Header Section -->
    <div class="crop-header">
      <div class="header-content">
        <div class="title-section">
          <h1 class="main-title">Image Crop</h1>
          <p class="subtitle">同步裁剪工具 - 精确控制裁剪区域</p>
        </div>

        <!-- Toolbar Section -->
        <div class="toolbar-container">
          <div class="toolbar-section zoom-section">
            <div class="section-label">缩放控制</div>
            <div class="toolbar-buttons">
              <el-tooltip content="缩小" placement="bottom">
                <button
                  class="toolbar-btn"
                  :disabled="zoomLevel <= 0.25"
                  @click="zoomOut"
                >
                  <el-icon><ZoomOut /></el-icon>
                </button>
              </el-tooltip>
              <div class="zoom-display">{{ Math.round(zoomLevel * 100) }}%</div>
              <el-tooltip content="放大" placement="bottom">
                <button
                  class="toolbar-btn"
                  :disabled="zoomLevel >= 5"
                  @click="zoomIn"
                >
                  <el-icon><ZoomIn /></el-icon>
                </button>
              </el-tooltip>
              <div class="toolbar-divider"></div>
              <el-tooltip content="重置缩放" placement="bottom">
                <button class="toolbar-btn" @click="resetZoom">
                  <el-icon><Aim /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip content="重置全部" placement="bottom">
                <button class="toolbar-btn" @click="resetAll">
                  <el-icon><Refresh /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>

          <div class="toolbar-section ratio-section">
            <div class="section-label">比例设置</div>
            <div class="ratio-controls">
              <div
                class="custom-dropdown"
                @click="showRatioDropdown = !showRatioDropdown"
              >
                <div class="dropdown-trigger">
                  <span class="selected-value">{{
                    getCurrentRatioLabel()
                  }}</span>
                  <svg
                    class="dropdown-icon"
                    :class="{ rotated: showRatioDropdown }"
                    viewBox="0 0 12 12"
                    fill="currentColor"
                  >
                    <path
                      d="M2.5 4.5L6 8L9.5 4.5"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      fill="none"
                    />
                  </svg>
                </div>
                <div v-if="showRatioDropdown" class="dropdown-menu">
                  <div
                    v-for="preset in presets"
                    :key="preset.label"
                    class="dropdown-item"
                    :class="{ selected: preset.value === aspectRatio }"
                    @click.stop="selectRatio(preset.value)"
                  >
                    <span class="item-label">{{ preset.label }}</span>
                    <span v-if="preset.value" class="item-desc">
                      {{
                        preset.value > 1
                          ? '横向'
                          : preset.value < 1
                            ? '竖向'
                            : '正方形'
                      }}
                    </span>
                  </div>
                </div>
              </div>
              <div v-if="cropDimensions" class="crop-size-display">
                <span class="size-label">裁剪尺寸</span>
                <span class="size-value"
                  >{{ cropDimensions.w }} × {{ cropDimensions.h }}</span
                >
              </div>
            </div>
          </div>

          <div class="toolbar-section actions-section">
            <button class="close-btn" @click="close">
              <el-icon><CloseBold /></el-icon>
              <span>关闭</span>
            </button>
            <button
              class="download-btn"
              title="应用到压缩"
              @click.stop="applyAndReturn"
            >
              <el-icon><Aim /></el-icon>
              <span>应用裁剪</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- Main Content Area -->
    <div class="crop-body">
      <div
        class="pane original-pane"
        :class="{
          'mobile-active': !isMobile || activeMobilePane === 'original',
          'mobile-hidden': isMobile && activeMobilePane !== 'original',
        }"
      >
        <div class="pane-header">
          <div class="pane-badge original">
            <span class="badge-icon">📸</span>
            <span>原图</span>
          </div>
          <div class="pane-stats">
            <span v-if="originalDims" class="stat-item"
              >{{ originalDims.w }}×{{ originalDims.h }}</span
            >
            <span v-if="props.originalSize" class="stat-item">{{
              formatSize(props.originalSize)
            }}</span>
          </div>
        </div>

        <div class="pane-content">
          <img
            ref="originalImgRef"
            :src="props.originalUrl"
            alt="original"
            draggable="false"
          />
        </div>

        <div class="pane-footer">
          <div class="file-info">
            <span class="file-name" :title="props.originalName">{{
              props.originalName || 'Original'
            }}</span>
          </div>
          <div class="pane-actions">
            <button
              class="download-btn"
              title="下载裁剪后的原图"
              @click.stop="download('original')"
            >
              <el-icon><Download /></el-icon>
              <span>下载原图</span>
            </button>
          </div>
        </div>
      </div>

      <div
        class="pane compressed-pane"
        :class="{
          'mobile-active': !isMobile || activeMobilePane === 'compressed',
          'mobile-hidden': isMobile && activeMobilePane !== 'compressed',
        }"
      >
        <div class="pane-header">
          <div class="pane-badge compressed">
            <span class="badge-icon">🗜️</span>
            <span>压缩图</span>
          </div>
          <div class="pane-stats">
            <span v-if="compressedDims" class="stat-item"
              >{{ compressedDims.w }}×{{ compressedDims.h }}</span
            >
            <span v-if="props.compressedSize" class="stat-item">{{
              formatSize(props.compressedSize)
            }}</span>
          </div>
        </div>

        <div class="pane-content">
          <img
            ref="compressedImgRef"
            :src="props.compressedUrl"
            alt="compressed"
            draggable="false"
          />
        </div>

        <div class="pane-footer">
          <div class="file-info">
            <span class="file-name" :title="props.compressedName">{{
              props.compressedName || 'Compressed'
            }}</span>
          </div>
          <div class="pane-actions">
            <button
              class="download-btn"
              title="下载裁剪后的压缩图"
              @click.stop="download('compressed')"
            >
              <el-icon><Download /></el-icon>
              <span>下载压缩图</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Background Overlay */
.crop-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 100vh;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  z-index: 9999;
  animation: backdropFadeIn 0.3s ease;
}

@keyframes backdropFadeIn {
  from {
    opacity: 0;
    backdrop-filter: blur(0px);
  }
  to {
    opacity: 1;
    backdrop-filter: blur(10px);
  }
}

@keyframes backdropFadeOut {
  from {
    opacity: 1;
    backdrop-filter: blur(10px);
  }
  to {
    opacity: 0;
    backdrop-filter: blur(0px);
  }
}

/* Base Layout */
.crop-page {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 100vh;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  overflow: hidden;
  animation: pageSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  /* 确保弹窗相对于视口定位 */
  transform: translateZ(0);
  /* 禁用弹窗整体的滚动 */
  overscroll-behavior: none;
}

@keyframes pageSlideIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes pageSlideOut {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.95) translateY(20px);
  }
}

/* Modern Header Design */
.crop-header {
  position: relative;
  z-index: 10;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  animation: headerSlideDown 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.1s both;
}

@keyframes headerSlideDown {
  from {
    opacity: 0;
    transform: translateY(-30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.header-content {
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.title-section {
  text-align: center;
}

.main-title {
  font-size: 2.5rem;
  font-weight: 800;
  background: linear-gradient(45deg, #fff, #e0e7ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0 0 8px 0;
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.subtitle {
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.1rem;
  font-weight: 300;
  margin: 0;
  opacity: 0.8;
}

/* Toolbar Design */
.toolbar-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.08);
  padding: 12px 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
}

.section-label {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
  white-space: nowrap;
}

.toolbar-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(10px);
}

.toolbar-btn:hover:not(:disabled) {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.25),
    rgba(255, 255, 255, 0.15)
  );
  border-color: rgba(255, 255, 255, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 255, 255, 0.2);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.zoom-display {
  font-size: 0.9rem;
  font-weight: 600;
  color: white;
  background: rgba(255, 255, 255, 0.15);
  padding: 6px 12px;
  border-radius: 8px;
  min-width: 50px;
  text-align: center;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  margin: 0 4px;
}

/* Custom Dropdown Styling */
.ratio-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.custom-dropdown {
  position: relative;
  min-width: 160px;
}

.dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.15),
    rgba(255, 255, 255, 0.05)
  );
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(16px) saturate(180%);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  height: 42px;
  box-sizing: border-box;
}

.dropdown-trigger:hover {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.25),
    rgba(255, 255, 255, 0.15)
  );
  border-color: rgba(255, 255, 255, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 255, 255, 0.2);
}

.selected-value {
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
  flex: 1;
}

.dropdown-icon {
  width: 14px;
  height: 14px;
  color: rgba(255, 255, 255, 0.8);
  transition: transform 0.3s ease;
  margin-left: 8px;
}

.dropdown-icon.rotated {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  padding: 8px;
  z-index: 1000;
  animation: dropdownSlideIn 0.2s ease;
}

@keyframes dropdownSlideIn {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  margin: 2px 0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: white;
}

.dropdown-item:hover {
  background: linear-gradient(
    135deg,
    rgba(96, 165, 250, 0.2),
    rgba(96, 165, 250, 0.1)
  );
  color: #60a5fa;
}

.dropdown-item.selected {
  background: linear-gradient(
    135deg,
    rgba(96, 165, 250, 0.3),
    rgba(96, 165, 250, 0.2)
  );
  color: #60a5fa;
  font-weight: 600;
}

.item-label {
  font-weight: 600;
  font-size: 0.9rem;
}

.item-desc {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
  margin-left: 8px;
}

.dropdown-item.selected .item-desc {
  color: rgba(96, 165, 250, 0.8);
}

.crop-size-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: linear-gradient(
    135deg,
    rgba(96, 165, 250, 0.25),
    rgba(96, 165, 250, 0.15)
  );
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(96, 165, 250, 0.4);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px rgba(96, 165, 250, 0.2);
}

.size-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.95);
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.size-value {
  font-size: 0.95rem;
  font-weight: 700;
  color: #e0f2fe;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  letter-spacing: 0.5px;
}

.ratio-select {
  --el-select-input-focus-border-color: rgba(255, 255, 255, 0.4);
}

.close-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 500;
}

.close-btn:hover {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
}

.close-btn:active {
  transform: translateY(0px) scale(0.98);
}

.toolbar-btn:active {
  transform: translateY(0px) scale(0.95);
}

/* Main Content Area */
.crop-body {
  flex: 1;
  display: flex;
  gap: 20px;
  padding: 20px;
  overflow: hidden;
}

/* Pane Design */
.pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  backdrop-filter: blur(20px) saturate(180%);
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  animation: paneSlideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.original-pane {
  animation-delay: 0.2s;
  animation-fill-mode: both;
}

.compressed-pane {
  animation-delay: 0.3s;
  animation-fill-mode: both;
}

@keyframes paneSlideUp {
  from {
    opacity: 0;
    transform: translateY(40px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.pane:hover {
  transform: translateY(-4px);
  box-shadow: 0 32px 64px rgba(0, 0, 0, 0.15);
}

.pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.pane-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 0.9rem;
  color: white;
}

.pane-badge.original {
  color: #60a5fa;
}

.pane-badge.compressed {
  color: #34d399;
}

.badge-icon {
  font-size: 1.1rem;
}

.pane-stats {
  display: flex;
  gap: 12px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.7);
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

.stat-item {
  background: rgba(255, 255, 255, 0.1);
  padding: 4px 8px;
  border-radius: 6px;
}

.pane-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.pane-content img {
  max-width: 100%;
  max-height: 100%;
  user-select: none;
  -webkit-user-drag: none;
}

.pane-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.05);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.file-info {
  flex: 1;
}

.file-name {
  font-size: 0.9rem;
  font-weight: 500;
  color: white;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.download-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.85rem;
  font-weight: 500;
}

.download-btn:hover {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(16, 185, 129, 0.35);
}

.download-btn:active {
  transform: translateY(0px) scale(0.98);
}

/* Cropper Customization */
:deep(.cropper-container) {
  font-size: 0;
  width: 100% !important;
  height: 100% !important;
  max-height: 100% !important;
  z-index: 1;
}

:deep(.cropper-drag-box) {
  cursor: default !important;
}

:deep(.cropper-crop-box) {
  cursor: move;
}

:deep(.cropper-view-box) {
  outline: 2px solid #60a5fa;
  outline-offset: 0;
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.4);
  border-radius: 4px;
}

:deep(.cropper-face) {
  background: rgba(96, 165, 250, 0.1);
}

:deep(.cropper-line) {
  background: rgba(96, 165, 250, 0.8);
}

:deep(.cropper-point) {
  background: #60a5fa;
  width: 10px;
  height: 10px;
  opacity: 0.9;
  border-radius: 50%;
  border: 2px solid white;
}

:deep(.cropper-center) {
  display: none;
}

/* Responsive Design */
@media (max-width: 1100px) {
  .crop-body {
    flex-direction: column;
  }

  .toolbar-container {
    flex-direction: column;
    gap: 16px;
  }
}

@media (max-width: 780px) {
  .header-content {
    padding: 16px 20px;
  }

  .main-title {
    font-size: 2rem;
  }

  .subtitle {
    font-size: 1rem;
  }

  .crop-body {
    padding: 16px;
    gap: 16px;
  }

  .toolbar-section {
    padding: 10px 12px;
  }

  .section-label {
    display: none;
  }

  .ratio-controls {
    flex-direction: column;
    gap: 8px;
  }

  .custom-dropdown {
    min-width: 120px;
  }

  .dropdown-trigger {
    height: 36px;
    padding: 8px 12px;
    font-size: 0.8rem;
  }

  .dropdown-icon {
    width: 12px;
    height: 12px;
  }

  .crop-size-display {
    padding: 6px 8px;
  }

  .size-value {
    font-size: 0.8rem;
  }

  .pane-header,
  .pane-footer {
    padding: 12px 16px;
  }

  .pane-stats {
    gap: 4px;
  }

  .download-btn span {
    display: none;
  }
}
</style>
