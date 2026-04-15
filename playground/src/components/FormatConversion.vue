<template>
  <div class="format-conversion">
    <!-- 预选择格式的对话框 - 自定义设计 -->
    <div
      v-if="showFormatSelectDialog"
      class="format-select-overlay"
      :style="{ top: `${scrollTop}px` }"
      @click="cancelFormatSelection"
    >
      <div class="format-select-dialog" @click.stop>
        <!-- 对话框头部 -->
        <div class="format-dialog-header">
          <div class="format-dialog-title">
            <span class="format-title-icon">🔄</span>
            <div class="format-title-content">
              <h3 class="format-title-main">Convert Image Format</h3>
              <p class="format-title-sub">{{ targetImageName }}</p>
            </div>
          </div>
          <button class="format-close-btn" @click="cancelFormatSelection">
            <span class="format-close-icon">✕</span>
          </button>
        </div>

        <!-- 格式选择区域 -->
        <div class="format-select-content">
          <div class="format-select-description">
            <template
              v-if="
                targetImageItem &&
                (targetImageItem.file.type === 'image/svg+xml' ||
                  targetImageItem.file.name.toLowerCase().endsWith('.svg'))
              "
            >
              Convert your SVG to a raster format:
            </template>
            <template v-else>
              Choose the target format for your image conversion:
            </template>
          </div>

          <div class="format-options-grid">
            <div
              v-for="format in formatOptions"
              :key="format.value"
              class="format-option-card"
              :class="{ active: selectedTargetFormat === format.value }"
              @click="selectedTargetFormat = format.value"
            >
              <div class="format-option-icon">{{ format.icon }}</div>
              <div class="format-option-info">
                <div class="format-option-name">{{ format.name }}</div>
                <div class="format-option-desc">{{ format.description }}</div>
              </div>
              <div class="format-option-check">
                <div class="format-check-circle">
                  <span
                    v-if="selectedTargetFormat === format.value"
                    class="format-check-mark"
                    >✓</span
                  >
                </div>
              </div>
            </div>
          </div>

          <!-- SVG转换选项 -->
          <div
            v-if="
              targetImageItem &&
              (targetImageItem.file.type === 'image/svg+xml' ||
                targetImageItem.file.name.toLowerCase().endsWith('.svg'))
            "
            class="svg-conversion-options"
          >
            <div class="svg-options-title">
              <span>SVG Conversion Settings</span>
              <button
                class="aspect-lock-btn"
                :aria-pressed="svgMaintainAspect"
                :title="svgMaintainAspect ? 'Aspect locked' : 'Aspect unlocked'"
                @click.prevent="svgMaintainAspect = !svgMaintainAspect"
              >
                <span v-if="svgMaintainAspect">🔒</span>
                <span v-else>🔓</span>
              </button>
            </div>
            <div class="svg-options-grid">
              <div class="svg-option-group">
                <label class="svg-option-label">Width (optional)</label>
                <input
                  v-model.number="svgWidth"
                  type="number"
                  class="svg-option-input"
                  placeholder="0 = Auto"
                  min="0"
                  max="4096"
                />
              </div>
              <div class="svg-option-group">
                <label class="svg-option-label">Height (optional)</label>
                <input
                  v-model.number="svgHeight"
                  type="number"
                  class="svg-option-input"
                  placeholder="0 = Auto"
                  min="0"
                  max="4096"
                />
              </div>
            </div>
            <div class="svg-options-hint">
              Use 0 for auto-sizing that dimension. When the lock is enabled,
              changing one dimension will automatically update the other to keep
              the SVG's intrinsic aspect ratio (if available).
            </div>
          </div>
        </div>

        <!-- 对话框底部按钮 -->
        <div class="format-dialog-footer">
          <button
            class="format-btn format-btn-secondary"
            @click="cancelFormatSelection"
          >
            Cancel
          </button>
          <button
            class="format-btn format-btn-primary"
            @click="confirmFormatAndOpenConversion"
          >
            <span class="format-btn-icon">🚀</span>
            Convert Now
          </button>
        </div>
      </div>
    </div>
    <!-- Fullscreen popup modal (separate from dialog fullscreen) -->
    <div
      v-if="popupFullscreen.visible"
      class="popup-fullscreen-overlay"
      :style="{
        top: scrollTop + 'px',
      }"
      @click="closeFullscreenModal"
    >
      <div class="popup-fullscreen-content" @click.stop>
        <div class="popup-header">
          <button class="popup-close" @click="closeFullscreenModal">✕</button>
        </div>
        <div class="popup-body">
          <div v-if="popupFullscreen.item" class="popup-comparison">
            <img-comparison-slider
              :value="sliderValue"
              @input="onSliderInput"
              class="popup-comparison-slider"
            >
              <img
                slot="first"
                :src="originalImageUrl"
                alt="Original"
                class="comparison-image"
                :style="{
                  transform: `translate(${imageTransform.x}px, ${imageTransform.y}px) scale(${imageZoom})`,
                  transformOrigin: 'center center',
                }"
                loading="lazy"
                decoding="sync"
              />
              <img
                slot="second"
                :src="popupFullscreen.item.url"
                alt="Result"
                class="comparison-image"
                :style="{
                  transform: `translate(${imageTransform.x}px, ${imageTransform.y}px) scale(${imageZoom})`,
                  transformOrigin: 'center center',
                }"
                loading="lazy"
                decoding="sync"
              />
            </img-comparison-slider>
          </div>
        </div>
      </div>
    </div>

    <!-- 格式转换对比面板 -->
    <div
      v-if="showConversionPanel"
      class="conversion-modal-overlay"
      :style="{ top: `${scrollTop}px` }"
      @click="closeConversionPanel"
    >
      <div
        class="conversion-dialog"
        :class="{ 'fullscreen-mode': isFullscreen }"
        @click.stop
      >
        <!-- Dialog Header -->
        <div class="conversion-dialog-header">
          <div class="conversion-dialog-title">
            <span class="conversion-title-icon">🔄</span>
            <div class="conversion-title-content">
              <h3 class="conversion-title-main">Format Conversion</h3>
              <p class="conversion-title-sub">{{ conversionTargetName }}</p>
            </div>
          </div>
          <button class="conversion-close-btn" @click="closeConversionPanel">
            <span class="conversion-close-icon">✕</span>
          </button>
        </div>

        <!-- Dialog Body -->
        <div class="conversion-dialog-body">
          <div class="conversion-panel">
            <!-- 顶部格式选择区域（仅展示当前选择，修改需返回上一步） -->
            <div class="format-selection readonly">
              <div class="format-header">
                <span class="format-icon">🔄</span>
                <span class="format-title">Converting to format:</span>
              </div>
              <div class="format-selected">
                <div class="selected-format-tag">
                  {{ selectedTargetFormat.toUpperCase() }}
                </div>
                <button class="change-format-btn" @click="changeFormat">
                  Change
                </button>
              </div>
            </div>

            <!-- 加载状态 -->
            <div v-if="conversionLoading" class="conversion-loading">
              <div class="loading-spinner">
                <div class="spinner-ring"></div>
              </div>
              <div class="loading-text">Converting and comparing...</div>
            </div>

            <!-- 转换结果列表 -->
            <div
              v-else-if="conversionResults.length > 0"
              class="conversion-list"
            >
              <div
                v-for="(r, idx) in conversionResults"
                :key="`${r.meta.flow}-${r.meta.tool || 'direct'}`"
                class="conversion-item"
                :class="{
                  success: r.success,
                  fail: !r.success,
                  best: r.isBest,
                }"
              >
                <div class="conversion-header">
                  <div class="flow-label">
                    <span
                      class="flow-badge"
                      :class="`flow-${r.meta.flow.toLowerCase().replace('→', '-')}`"
                    >
                      {{
                        r.meta.flow === 'C→T'
                          ? 'Compress → Convert'
                          : r.meta.flow === 'T'
                            ? 'Convert Only'
                            : 'Convert → Compress'
                      }}
                    </span>
                    <span v-if="r.meta.tool" class="tool-name">{{
                      r.meta.tool
                    }}</span>
                    <!-- 最佳压缩率标识 -->
                    <span v-if="r.isBest" class="best-compression-badge"
                      >最佳压缩</span
                    >
                  </div>
                  <div v-if="r.success" class="conversion-metrics">
                    <span class="metric size">{{
                      formatFileSize(r.size || 0)
                    }}</span>
                    <span
                      class="metric ratio"
                      :class="{ neg: (r.compressionRatio || 0) < 0 }"
                    >
                      {{ (r.compressionRatio || 0) < 0 ? '+' : '-'
                      }}{{ Math.abs(r.compressionRatio || 0).toFixed(1) }}%
                    </span>
                    <span class="metric duration"
                      >{{ (r.duration || 0).toFixed(0) }}ms</span
                    >
                  </div>
                </div>

                <div v-if="r.success && r.url" class="conversion-preview">
                  <!-- ICO格式不显示对比slider，因为无法在img标签中正确显示 -->
                  <div v-if="selectedTargetFormat === 'ico'" class="ico-result">
                    <div class="ico-info">
                      <span class="ico-icon">🔄</span>
                      <span class="ico-text"
                        >ICO file converted successfully</span
                      >
                      <span class="ico-size">{{
                        formatFileSize(r.size || 0)
                      }}</span>
                    </div>
                    <div class="preview-actions">
                      <button
                        class="conversion-download-btn"
                        @click="downloadConversionResult(r)"
                      >
                        <span class="btn-icon">⬇️</span>
                        <span class="btn-text">Download</span>
                      </button>
                      <button
                        v-if="r.success && r.blob"
                        class="conversion-use-btn"
                        @click="applyConversionResultToParent(r)"
                      >
                        <span class="btn-icon">👆</span>
                        <span class="btn-text">Use this result</span>
                      </button>
                    </div>
                  </div>

                  <!-- 其他格式显示对比slider -->
                  <div v-else>
                    <div
                      class="comparison-container"
                      :class="{
                        'conversion-fullscreen-container': isFullscreen,
                      }"
                      :style="{
                        cursor: imageZoom > 1 ? 'move' : 'default',
                      }"
                      @wheel="handleWheel"
                      @mousedown="handleImageMouseDown"
                      @mousemove="handleImageMouseMove"
                      @mouseup="handleImageMouseUp"
                      @touchstart="handleTouchStart"
                      @touchend="handleTouchEnd"
                      @mouseenter="hoverActiveIdx = idx"
                      @mouseleave="hoverActiveIdx = null"
                    >
                      <img-comparison-slider
                        ref="sliderRef"
                        class="conversion-comparison-slider"
                        :value="sliderValue"
                        @input="onSliderInput"
                        @mousedown="handleMouseDown"
                        @mouseup="handleMouseUp"
                      >
                        <!-- eslint-disable -->
                        <img
                          slot="first"
                          :src="originalImageUrl"
                          alt="Original"
                          class="comparison-image"
                          :style="{
                            transform: `translate(${imageTransform.x}px, ${imageTransform.y}px) scale(${imageZoom})`,
                            transformOrigin: 'center center',
                          }"
                          loading="lazy"
                          decoding="sync"
                          @load="handleImageLoad"
                        />
                        <img
                          slot="second"
                          :src="r.url"
                          :alt="`${r.meta.flow} result`"
                          class="comparison-image"
                          :style="{
                            transform: `translate(${imageTransform.x}px, ${imageTransform.y}px) scale(${imageZoom})`,
                            transformOrigin: 'center center',
                          }"
                          loading="lazy"
                          decoding="sync"
                          @load="handleImageLoad"
                        />
                        <!-- eslint-enable -->
                      </img-comparison-slider>
                      <!-- Hover toolbar (appears on container hover, per-item) -->
                      <div
                        v-if="hoverActiveIdx === idx"
                        class="hover-overlay"
                        @click.stop
                      >
                        <div class="hover-toolbar">
                          <button
                            class="hover-btn"
                            title="Zoom In"
                            @click.stop.prevent="zoomIn"
                          >
                            +
                          </button>
                          <button
                            class="hover-btn"
                            title="Zoom Out"
                            @click.stop.prevent="zoomOut"
                          >
                            −
                          </button>
                          <button
                            class="hover-btn"
                            title="Open Fullscreen Popup"
                            @click.stop.prevent="openFullscreenModal(idx, r)"
                          >
                            ⛶
                          </button>
                        </div>
                      </div>
                      <!-- Crop capture overlay (only when cropping this item) -->
                      <div
                        v-if="isCroppingFor(idx)"
                        class="crop-capture-overlay"
                        @mousedown.prevent.stop="startCrop($event, idx)"
                        @mousemove.prevent.stop="updateCrop($event)"
                        @mouseup.prevent.stop="endCrop($event, idx)"
                        @mouseleave.prevent.stop="endCrop($event, idx)"
                      >
                        <div
                          v-if="cropRect.width > 0 && cropRect.height > 0"
                          class="crop-rect"
                          :style="{
                            left: cropRect.x + 'px',
                            top: cropRect.y + 'px',
                            width: cropRect.width + 'px',
                            height: cropRect.height + 'px',
                          }"
                        />

                        <div class="crop-actions">
                          <button
                            class="control-btn"
                            @click="applyCrop(idx, r)"
                          >
                            Apply Crop
                          </button>
                          <button class="control-btn" @click="resetCrop(idx)">
                            Reset Crop
                          </button>
                          <button class="control-btn" @click="toggleCrop(null)">
                            Close Crop
                          </button>
                        </div>
                      </div>
                    </div>
                    <div class="preview-actions">
                      <button
                        class="conversion-download-btn"
                        @click="downloadConversionResult(r)"
                      >
                        <span class="btn-icon">⬇️</span>
                        <span class="btn-text">Download</span>
                      </button>
                      <button
                        v-if="r.success && r.blob"
                        class="conversion-use-btn"
                        @click="applyConversionResultToParent(r)"
                      >
                        <span class="btn-icon">👆</span>
                        <span class="btn-text">Use this result</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div v-if="!r.success" class="conversion-error">
                  <span class="error-icon">❌</span>
                  <span class="error-message">{{
                    r.error || 'Conversion failed'
                  }}</span>
                </div>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-else-if="!conversionLoading" class="conversion-empty">
              <div class="empty-icon">🔄</div>
              <div class="empty-text">No conversion results available</div>
            </div>
          </div>
        </div>

        <!-- Dialog Footer -->
        <div class="conversion-dialog-footer">
          <button
            class="conversion-btn conversion-btn-secondary"
            @click="closeConversionPanel"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TargetFormat } from '../../../src/conversion'
import type { ConversionCompareItem } from '../../../src/orchestrators/compareConversion'
import { ElMessage } from 'element-plus'
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { buildConversionColumn } from '../../../src/orchestrators/compareConversion'
// Remove unused Element Plus imports
import 'img-comparison-slider/dist/styles.css'

// 导入 img-comparison-slider
import('img-comparison-slider')

// 扩展转换对比项类型以包含url属性
interface ConversionCompareItemWithUrl extends ConversionCompareItem {
  url?: string
  // 标记该结果是否为压缩率最高
  isBest?: boolean
  // 相对于原始文件的压缩率（百分比，正为减小）
  compressionRatio?: number
}

// 定义组件属性
interface Props {
  toolConfigs: Array<{
    name: string
    key: string
    libURL?: string
    enabled: boolean
  }>
  preserveExif: boolean
}

const props = defineProps<Props>()

// 事件：向父组件发出选择的转换结果以便应用到 image-card
// Use simple emits declaration to avoid complex TS template typing issues
const emit = defineEmits(['apply-conversion'])

// 格式转换对比面板状态
const showConversionPanel = ref(false)
const conversionLoading = ref(false)
const conversionTargetName = ref('')
const conversionResults = ref<ConversionCompareItemWithUrl[]>([])
let conversionObjectUrls: string[] = []
const originalImageUrl = ref('')
const selectedTargetFormat = ref<TargetFormat>('webp')

function isToolConfigConfigured(config: Props['toolConfigs'][number]) {
  if (config.name === 'tinypng')
    return config.key.trim().length > 0
  if (config.name === 'browser-image-compression')
    return (config.libURL || '').trim().length > 0
  return false
}

// 格式选项配置
const formatOptions = [
  {
    value: 'png' as TargetFormat,
    name: 'PNG',
    icon: '🖼️',
    description: 'Lossless compression with transparency support',
  },
  {
    value: 'jpeg' as TargetFormat,
    name: 'JPEG',
    icon: '📷',
    description: 'Best for photos with smaller file sizes',
  },
  {
    value: 'webp' as TargetFormat,
    name: 'WebP',
    icon: '🚀',
    description: 'Modern format with excellent compression',
  },
  {
    value: 'ico' as TargetFormat,
    name: 'ICO',
    icon: '🔸',
    description: 'Icon format for web and desktop apps',
  },
]

// 图片缩放和全屏状态
const imageZoom = ref(1) // 图片缩放比例
const isFullscreen = ref(false) // 全屏状态
const imageTransform = ref({ x: 0, y: 0 }) // 图片位移
const isMobileDragging = ref(false)
const isPCDragging = ref(false)

// Hover overlay state per conversion item
const hoverActiveIdx = ref<number | null>(null)

// Fullscreen popup modal (separate from dialog's fullscreen mode)
const popupFullscreen = ref<{
  visible: boolean
  idx: number | null
  item: ConversionCompareItemWithUrl | null
}>({ visible: false, idx: null, item: null })

// 比较滑块状态（0-100）
const sliderValue = ref(50)
const sliderRef = ref<HTMLElement | null>(null)

function onSliderInput(e: any) {
  // img-comparison-slider may emit a CustomEvent with detail.value or provide value on target
  const v = Number(e?.detail?.value ?? e?.target?.value ?? e)
  if (!Number.isNaN(v)) sliderValue.value = Math.max(0, Math.min(100, v))
}

// Cropping state (UI-only capture, non-destructive)
const croppingIndex = ref<number | null>(null)
const cropRect = ref({ x: 0, y: 0, width: 0, height: 0 })
let cropStartX = 0
let cropStartY = 0
let croppingActive = false

function toggleCrop(idx: number | null) {
  if (idx === null) {
    croppingIndex.value = null
    cropRect.value = { x: 0, y: 0, width: 0, height: 0 }
    return
  }
  croppingIndex.value = idx
  cropRect.value = { x: 0, y: 0, width: 0, height: 0 }
}

function isCroppingFor(idx: number) {
  return croppingIndex.value === idx
}

function startCrop(e: MouseEvent, idx: number) {
  if (croppingIndex.value !== idx) return
  croppingActive = true
  const container = e.currentTarget as HTMLElement
  const rect = container.getBoundingClientRect()
  cropStartX = e.clientX - rect.left
  cropStartY = e.clientY - rect.top
  cropRect.value = { x: cropStartX, y: cropStartY, width: 0, height: 0 }
}

function updateCrop(e: MouseEvent) {
  if (!croppingActive) return
  const container = e.currentTarget as HTMLElement
  const rect = container.getBoundingClientRect()
  const curX = e.clientX - rect.left
  const curY = e.clientY - rect.top
  const x = Math.min(cropStartX, curX)
  const y = Math.min(cropStartY, curY)
  const width = Math.abs(curX - cropStartX)
  const height = Math.abs(curY - cropStartY)
  cropRect.value = { x, y, width, height }
}

function endCrop(_e: MouseEvent, idx: number) {
  if (croppingIndex.value !== idx) return
  croppingActive = false
}

function applyCrop(idx: number, r: ConversionCompareItemWithUrl) {
  // For safety, we just show a message that crop would be applied.
  // Actual image manipulation is out of scope here.
  ElMessage.info(
    'Apply crop: not implemented - this captures the selection only',
  )
}

function resetCrop(_idx: number) {
  cropRect.value = { x: 0, y: 0, width: 0, height: 0 }
}

// 预选择格式的对话框状态
const showFormatSelectDialog = ref(false)
const targetImageItem = ref<{
  id: string
  file: File
  originalUrl: string
  quality: number
} | null>(null)
const targetImageName = ref('')

// 滚动位置状态
const scrollTop = ref(0)
const appContainer = ref<HTMLElement | null>(null)
const appElement = ref<HTMLElement | null>(null)

// SVG转换选项 - 默认设置为512x512
const svgWidth = ref<number | undefined>(512)
const svgHeight = ref<number | undefined>(512)
// Preserve aspect ratio lock and intrinsic aspect
const svgMaintainAspect = ref(true)
const svgIntrinsicAspect = ref<number | undefined>(undefined)
let _adjustingSvgDim = false

async function detectSvgIntrinsicAspectFromFile(
  file: File,
): Promise<number | undefined> {
  try {
    const text = await file.text()
    if (!text) return undefined
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'image/svg+xml')
    const svg = doc.querySelector('svg')
    if (!svg) return undefined

    // Try width/height attributes first
    const rawW = svg.getAttribute('width')
    const rawH = svg.getAttribute('height')
    if (rawW && rawH) {
      const w = parseFloat(rawW)
      const h = parseFloat(rawH)
      if (w > 0 && h > 0 && !Number.isNaN(w) && !Number.isNaN(h)) {
        return w / h
      }
    }

    // Fallback to viewBox
    const vb = svg.getAttribute('viewBox')
    if (vb) {
      const parts = vb.split(/[,\s]+/).map((s) => parseFloat(s))
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return parts[2] / parts[3]
      }
    }

    return undefined
  } catch (e) {
    return undefined
  }
}

// 恢复滚动状态的统一函数
function restoreScrollState() {
  // 恢复app-container滚动
  if (appContainer.value) {
    appContainer.value.style.removeProperty('overflow')
    // 恢复之前的滚动位置
    appContainer.value.scrollTop = scrollTop.value
  }
  if (appElement.value) {
    appElement.value.style.removeProperty('overflow')
  }
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

function openFormatSelectDialog(item: {
  id: string
  file: File
  originalUrl: string
  quality: number
}) {
  targetImageItem.value = item
  targetImageName.value = item.file.name

  // Reset SVG dimensions to default 512x512 and detect intrinsic aspect
  svgWidth.value = 512
  svgHeight.value = 512
  svgIntrinsicAspect.value = undefined
  svgMaintainAspect.value = true
  // detect intrinsic aspect ratio from file (async, best-effort)
  ;(async () => {
    const aspect = await detectSvgIntrinsicAspectFromFile(item.file)
    if (aspect && aspect > 0) {
      svgIntrinsicAspect.value = aspect
      // if user hasn't changed dims, recompute height to preserve aspect
      if (!svgWidth.value && !svgHeight.value) {
        svgWidth.value = 512
        svgHeight.value = Math.max(1, Math.round(512 / aspect))
      } else if (svgWidth.value && !svgHeight.value) {
        svgHeight.value = Math.max(1, Math.round(svgWidth.value / aspect))
      } else if (svgHeight.value && !svgWidth.value) {
        svgWidth.value = Math.max(1, Math.round(svgHeight.value * aspect))
      } else if (svgWidth.value && svgHeight.value) {
        // adjust height to match width if maintainAspect is true
        if (svgMaintainAspect.value) {
          svgHeight.value = Math.max(1, Math.round(svgWidth.value / aspect))
        }
      }
    }
  })()

  // Keep dimensions in sync when user wants to preserve aspect ratio
  watch(svgWidth, (newW) => {
    if (!svgMaintainAspect.value || _adjustingSvgDim) return
    const aspect = svgIntrinsicAspect.value
    if (!newW || !aspect) return
    _adjustingSvgDim = true
    svgHeight.value = Math.max(1, Math.round(newW / aspect))
    _adjustingSvgDim = false
  })

  watch(svgHeight, (newH) => {
    if (!svgMaintainAspect.value || _adjustingSvgDim) return
    const aspect = svgIntrinsicAspect.value
    if (!newH || !aspect) return
    _adjustingSvgDim = true
    svgWidth.value = Math.max(1, Math.round(newH * aspect))
    _adjustingSvgDim = false
  })
  // 获取app-container元素
  appContainer.value = document.querySelector('.app-container') as HTMLElement
  appElement.value = document.querySelector('#app') as HTMLElement

  if (appContainer.value) {
    // 获取当前滚动位置
    scrollTop.value = appContainer.value.scrollTop || appElement.value.scrollTop
    // 禁用app-container的滚动
    appContainer.value.style.setProperty('overflow', 'hidden', 'important')
  }
  if (appElement.value) {
    appElement.value.style.setProperty('overflow', 'hidden', 'important')
  }

  showFormatSelectDialog.value = true
}

function confirmFormatAndOpenConversion() {
  showFormatSelectDialog.value = false

  // 使用统一函数恢复滚动状态
  restoreScrollState()

  if (targetImageItem.value) {
    openConversionPanel(targetImageItem.value)
  }
}

function cancelFormatSelection() {
  showFormatSelectDialog.value = false
  targetImageItem.value = null
  targetImageName.value = ''

  // 使用统一函数恢复滚动状态
  restoreScrollState()
}

function changeFormat() {
  showConversionPanel.value = false
  showFormatSelectDialog.value = true

  // 格式选择对话框已经显示，保持滚动条禁用状态
  // 不需要额外的滚动条控制，因为从一个对话框切换到另一个对话框
}

function cleanupConversionObjectUrls() {
  if (conversionObjectUrls.length) {
    conversionObjectUrls.forEach((u) => URL.revokeObjectURL(u))
    conversionObjectUrls = []
  }
}

// 打开格式转换对比面板
async function openConversionPanel(item: {
  id: string
  file: File
  originalUrl: string
  quality: number
}) {
  // 获取app-container元素
  appContainer.value = document.querySelector('.app-container') as HTMLElement
  appElement.value = document.querySelector('#app') as HTMLElement

  if (appContainer.value) {
    // 获取当前滚动位置
    scrollTop.value = appContainer.value.scrollTop || appElement.value.scrollTop
    // 禁用app-container的滚动
    appContainer.value.style.setProperty('overflow', 'hidden', 'important')
  }
  if (appElement.value) {
    appElement.value.style.setProperty('overflow', 'hidden', 'important')
  }
  showConversionPanel.value = true
  conversionLoading.value = true
  conversionTargetName.value = item.file.name
  originalImageUrl.value = item.originalUrl

  // 清理旧的对象URL
  cleanupConversionObjectUrls()

  // pre-declare flags so they are available in catch for nicer error messages
  let isICO = false
  let isSvgSource = false

  try {
    // 过滤出启用的工具配置
    const enabledToolConfigs = props.toolConfigs.filter(
      (config) => config.enabled && isToolConfigConfigured(config),
    )

    // 构建转换对比数据
    // ICO格式和SVG源文件特殊处理：不支持压缩，只进行格式转换
    isICO = selectedTargetFormat.value === 'ico'
    isSvgSource =
      item.file.type === 'image/svg+xml' ||
      item.file.name.toLowerCase().endsWith('.svg')
    const skipCompression = isICO || isSvgSource

    const conversionColumn = await buildConversionColumn({
      file: item.file,
      compressOptions: skipCompression
        ? undefined
        : {
            quality: item.quality,
            preserveExif: props.preserveExif,
            returnAllResults: true,
            toolConfigs: enabledToolConfigs,
          },
      convertOptions: {
        targetFormat: selectedTargetFormat.value,
        quality: 0.8, // 转换质量设置
        ...(isSvgSource && (svgWidth.value || svgHeight.value)
          ? {
              width: svgWidth.value === 0 ? undefined : svgWidth.value,
              height: svgHeight.value === 0 ? undefined : svgHeight.value,
            }
          : {}),
      },
    })

    // 构建 UI 结果并生成预览 URL
    conversionResults.value = conversionColumn.items.map(
      (r: ConversionCompareItem) => {
        let url: string | undefined
        if (r.success && r.blob) {
          url = URL.createObjectURL(r.blob)
          conversionObjectUrls.push(url)
        }

        return {
          ...r,
          url,
        }
      },
    )
    // 计算压缩率并标记最佳，然后按压缩率排序（降序）
    markBestCompression(item.file.size)
    sortConversionResultsByCompression()
  } catch (err) {
    console.error('Conversion comparison failed:', err)

    // SVG-specific error handling
    let errorMessage = 'Failed to compare conversions'
    if (isSvgSource && err instanceof Error) {
      if (err.message.includes('SVG')) {
        errorMessage = `SVG conversion failed: ${err.message}`
      } else if (
        err.message.includes('width') ||
        err.message.includes('height')
      ) {
        errorMessage =
          'Invalid SVG dimensions. Please check your width and height values.'
      } else {
        errorMessage = `SVG conversion failed: ${err.message}`
      }
    } else if (err instanceof Error) {
      errorMessage = err.message
    }

    ElMessage.error(errorMessage)
  } finally {
    conversionLoading.value = false
  }
}

// 计算每个成功结果相对于原始文件的压缩率并标记压缩率最高的项
function markBestCompression(originalSize: number) {
  if (!originalSize || !conversionResults.value.length) return
  // 计算每项的压缩率（以百分比表示），正值表示变小（压缩）
  conversionResults.value.forEach((r) => {
    if (r.success && typeof r.size === 'number') {
      // 压缩率定义为 (原始 - 新) / 原始 * 100
      r.compressionRatio = ((originalSize - r.size) / originalSize) * 100
    } else {
      r.compressionRatio = undefined
    }
    r.isBest = false
  })

  // 找到最大 compressionRatio 的项
  const valid = conversionResults.value.filter(
    (r) => r.success && typeof r.compressionRatio === 'number',
  )
  if (!valid.length) return
  let best = valid[0]
  for (const v of valid) {
    if (
      (v.compressionRatio ?? -Infinity) > (best.compressionRatio ?? -Infinity)
    ) {
      best = v
    }
  }
  best.isBest = true
}

// 按 compressionRatio 从大到小排序，缺失 compressionRatio 的项排在后面
function sortConversionResultsByCompression() {
  if (!conversionResults.value.length) return
  conversionResults.value = conversionResults.value.slice().sort((a, b) => {
    const ra =
      typeof a.compressionRatio === 'number' ? a.compressionRatio : -Infinity
    const rb =
      typeof b.compressionRatio === 'number' ? b.compressionRatio : -Infinity
    // 降序
    return rb - ra
  })
}

function closeConversionPanel() {
  showConversionPanel.value = false
  // 关闭时清理生成的对象URL，避免内存泄漏
  cleanupConversionObjectUrls()

  // 使用统一函数恢复滚动状态
  restoreScrollState()
}

// 下载转换结果
function downloadConversionResult(r: ConversionCompareItemWithUrl) {
  if (!r.success || !r.blob) return
  if (!targetImageItem.value) return

  const item = targetImageItem.value

  // 构建文件名
  const originalName = item.file.name
  const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '')
  const flowSuffix =
    r.meta.flow === 'C→T'
      ? '_compressed'
      : r.meta.flow === 'T'
        ? '_converted'
        : '_converted_compressed'
  const toolSuffix = r.meta.tool ? `_${r.meta.tool}` : ''
  const extension =
    r.meta.convertOptions.targetFormat === 'jpeg'
      ? 'jpg'
      : r.meta.convertOptions.targetFormat

  const fileName = `${nameWithoutExt}${flowSuffix}${toolSuffix}.${extension}`

  // 下载文件
  const url = URL.createObjectURL(r.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  const flowLabel =
    r.meta.flow === 'C→T'
      ? 'Compress→Convert'
      : r.meta.flow === 'T'
        ? 'Convert Only'
        : 'Convert→Compress'
  ElMessage.success(`Downloaded ${flowLabel} result as ${fileName}`)
}

// 将选中的转换结果发送给父组件以替换 image-card 的图片
function applyConversionResultToParent(r: ConversionCompareItemWithUrl) {
  if (!r.success || !r.blob || !targetImageItem.value) return

  emit('apply-conversion', {
    id: targetImageItem.value.id,
    blob: r.blob,
    size: r.size,
    mime: r.meta.convertOptions.targetFormat,
    url: r.url,
  })

  // 关闭转换面板以便查看替换后的卡片
  closeConversionPanel()
}

// 图片缩放控制
function zoomIn() {
  imageZoom.value = Math.min(imageZoom.value * 1.2, 5) // 最大放大5倍
  nextTick(() => {
    constrainImagePosition()
  })
}

function zoomOut() {
  imageZoom.value = Math.max(imageZoom.value / 1.2, 0.1) // 最小缩小到0.1倍
  nextTick(() => {
    constrainImagePosition()
  })
}

function resetZoom() {
  imageZoom.value = 1
  imageTransform.value = { x: 0, y: 0 }
}

// 重置图片变换
function resetImageTransform() {
  imageZoom.value = 1
  imageTransform.value = { x: 0, y: 0 }
}

// 全屏控制
function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  // 无论进入还是退出全屏，都重置缩放到100%和位移
  resetImageTransform()
}

// 约束图片位置在边界内
function constrainImagePosition() {
  const bounds = calculateImageBounds()
  imageTransform.value.x = Math.max(
    bounds.minX,
    Math.min(bounds.maxX, imageTransform.value.x),
  )
  imageTransform.value.y = Math.max(
    bounds.minY,
    Math.min(bounds.maxY, imageTransform.value.y),
  )
}

// 计算图片拖拽边界
function calculateImageBounds() {
  if (!isFullscreen.value || imageZoom.value <= 1) {
    return { maxX: 0, maxY: 0, minX: 0, minY: 0 }
  }

  // 获取全屏容器的实际尺寸
  const container = document.querySelector(
    '.conversion-fullscreen-container',
  ) as HTMLElement
  if (!container) {
    return { maxX: 0, maxY: 0, minX: 0, minY: 0 }
  }

  const containerRect = container.getBoundingClientRect()
  const containerWidth = containerRect.width
  const containerHeight = containerRect.height

  // 获取图片元素
  const imgElement = container.querySelector(
    '.conversion-comparison-slider img',
  ) as HTMLImageElement
  if (!imgElement) {
    return { maxX: 0, maxY: 0, minX: 0, minY: 0 }
  }

  // 获取图片的自然尺寸
  const naturalWidth = imgElement.naturalWidth
  const naturalHeight = imgElement.naturalHeight

  if (naturalWidth === 0 || naturalHeight === 0) {
    return { maxX: 0, maxY: 0, minX: 0, minY: 0 }
  }

  // 计算图片在容器中的实际显示尺寸（考虑 object-fit: contain）
  const containerAspect = containerWidth / containerHeight
  const imageAspect = naturalWidth / naturalHeight

  let displayWidth: number
  let displayHeight: number

  if (imageAspect > containerAspect) {
    // 图片较宽，以容器宽度为准
    displayWidth = containerWidth
    displayHeight = containerWidth / imageAspect
  } else {
    // 图片较高，以容器高度为准
    displayHeight = containerHeight
    displayWidth = containerHeight * imageAspect
  }

  // 应用缩放
  const scaledWidth = displayWidth * imageZoom.value
  const scaledHeight = displayHeight * imageZoom.value

  // 计算允许的移动范围
  const maxMoveX = Math.max(0, (scaledWidth - containerWidth) / 2)
  const maxMoveY = Math.max(0, (scaledHeight - containerHeight) / 2)

  return {
    maxX: maxMoveX,
    maxY: maxMoveY,
    minX: -maxMoveX,
    minY: -maxMoveY,
  }
}

// 鼠标滚轮缩放
function handleWheel(e: WheelEvent) {
  if (!isFullscreen.value) return

  e.preventDefault()
  if (e.deltaY > 0) {
    zoomOut()
  } else {
    zoomIn()
  }
}

// 图片拖拽移动（全屏模式下）
let isDragging = false
let dragStartX = 0
let dragStartY = 0
let startTransformX = 0
let startTransformY = 0

function handleImageMouseDown(e: MouseEvent) {
  if (!isFullscreen.value) return

  // 如果图片没有放大，不处理拖拽
  if (imageZoom.value <= 1) {
    return // 让比较滑块正常工作
  }

  isDragging = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  startTransformX = imageTransform.value.x
  startTransformY = imageTransform.value.y

  // 阻止事件冒泡，避免触发比较滑块的拖拽
  e.preventDefault()
  e.stopPropagation()
}

function handleImageMouseMove(e: MouseEvent) {
  if (!isDragging) return

  const deltaX = e.clientX - dragStartX
  const deltaY = e.clientY - dragStartY
  const newX = startTransformX + deltaX
  const newY = startTransformY + deltaY

  // 获取边界
  const bounds = calculateImageBounds()

  // 限制移动范围
  const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, newX))
  const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, newY))

  imageTransform.value.x = clampedX
  imageTransform.value.y = clampedY
}

function handleImageMouseUp() {
  isDragging = false
}

// 键盘事件处理
function handleKeydown(e: KeyboardEvent) {
  // 处理格式选择对话框的ESC键
  if (e.key === 'Escape' && showFormatSelectDialog.value) {
    cancelFormatSelection()
    return
  }
  // If popup fullscreen overlay is open, close it first on Escape
  if (
    e.key === 'Escape' &&
    popupFullscreen.value &&
    popupFullscreen.value.visible
  ) {
    closeFullscreenModal()
    return
  }

  // If conversion panel is open, handle Escape specially:
  // - if fullscreen: exit fullscreen
  // - otherwise: close the conversion panel
  if (e.key === 'Escape' && showConversionPanel.value) {
    if (isFullscreen.value) {
      toggleFullscreen()
    } else {
      closeConversionPanel()
    }
    return
  }

  // 处理转换面板的键盘快捷键（其余快捷键仅在全屏时有效）
  if (!showConversionPanel.value || !isFullscreen.value) return

  switch (e.key) {
    case '+':
    case '=':
      e.preventDefault()
      zoomIn()
      break
    case '-':
      e.preventDefault()
      zoomOut()
      break
    case '0':
      e.preventDefault()
      resetZoom()
      break
    case 'f':
    case 'F':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        toggleFullscreen()
      }
      break
  }
}

// 移动端触摸事件处理
function handleTouchStart(e: TouchEvent) {
  // 检查触摸是否在图片比较滑块上
  const target = e.target as HTMLElement
  if (target.closest('.conversion-comparison-slider')) {
    isMobileDragging.value = true
  }
}

function handleTouchEnd() {
  // 触摸结束时恢复显示
  isMobileDragging.value = false
}

function openFullscreenModal(idx: number, item: ConversionCompareItemWithUrl) {
  // show a separate fullscreen popup that overlays the page
  popupFullscreen.value = { visible: true, idx, item }
  debugger
  // reset transform/zoom so image is centered in the popup
  imageTransform.value = { x: 0, y: 0 }
  imageZoom.value = 1
  nextTick(() => {
    constrainImagePosition()
  })
}

function closeFullscreenModal() {
  popupFullscreen.value = { visible: false, idx: null, item: null }
}

// PC端鼠标事件处理
function handleMouseDown(e: MouseEvent) {
  // 检查鼠标按下是否在图片比较滑块上
  const target = e.target as HTMLElement
  if (target.closest('.conversion-comparison-slider')) {
    isPCDragging.value = true
  }
}

function handleMouseUp() {
  // 鼠标松开时恢复显示
  isPCDragging.value = false
}

// 图片加载完成处理
function handleImageLoad() {
  // 重新计算边界，因为图片尺寸可能已经改变
  nextTick(() => {
    constrainImagePosition()
  })
}

// 窗口大小变化处理
function handleWindowResize() {
  if (isFullscreen.value) {
    // 延迟一帧执行，确保DOM更新完成
    nextTick(() => {
      constrainImagePosition()
    })
  }
}

// 组件挂载时添加键盘事件监听
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleWindowResize)
})

// 组件卸载时移除事件监听
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleWindowResize)

  // 组件卸载时确保恢复滚动状态
  restoreScrollState()
})

// 暴露给父组件的方法
defineExpose({
  openFormatSelectDialog,
})
</script>

<style scoped>
.svg-aspect-lock {
  display: flex;
  align-items: center;
  gap: 8px;
}
.aspect-lock-btn {
  background: transparent;
  border: 1px solid transparent;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
}
.aspect-lock-btn[aria-pressed='true'] {
  background-color: rgba(0, 0, 0, 0.06);
}
.aspect-lock-btn:focus {
  outline: 2px solid rgba(0, 120, 212, 0.25);
}

.svg-options-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.svg-options-title button.aspect-lock-btn {
  padding: 4px 6px;
  font-size: 14px;
}
</style>

<style scoped>
.format-conversion {
  position: relative;
}

/* 自定义格式选择对话框样式 */
.format-select-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100vh;
  background:
    radial-gradient(
      circle at 50% 30%,
      rgba(99, 102, 241, 0.08) 0%,
      transparent 50%
    ),
    rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    backdrop-filter: blur(0px);
  }
  to {
    opacity: 1;
    backdrop-filter: blur(12px);
  }
}

.format-select-dialog {
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  width: 620px;
  max-width: 90vw;
  max-height: 90vh;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    0 32px 100px rgba(99, 102, 241, 0.15),
    0 16px 40px rgba(99, 102, 241, 0.08),
    0 4px 12px rgba(0, 0, 0, 0.05);
  animation: slideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  flex-direction: column;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translate3d(0, 20px, 0) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

.format-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px 28px 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
}

.format-dialog-title {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
  width: 100%;
  padding: 0 8px;
  overflow: hidden;
}

.format-title-icon {
  font-size: 32px;
  animation: rotate 3s ease-in-out infinite;
  filter: drop-shadow(0 3px 6px rgba(99, 102, 241, 0.2));
}

@keyframes rotate {
  0% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(90deg) scale(1.05);
  }
  50% {
    transform: rotate(180deg) scale(1.1);
  }
  75% {
    transform: rotate(270deg) scale(1.05);
  }
  100% {
    transform: rotate(360deg) scale(1);
  }
}

.format-title-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  overflow: hidden;
}

/* Hover overlay toolbar inside comparison-container */
.comparison-container {
  position: relative;
}

.hover-overlay {
  position: absolute;
  right: 12px;
  top: 12px;
  z-index: 30;
  pointer-events: auto;
}

.hover-toolbar {
  display: flex;
  gap: 8px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 6px 8px;
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  align-items: center;
}

.hover-btn {
  background: transparent;
  border: none;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
}

/* Popup fullscreen overlay styles */
.popup-fullscreen-overlay {
  position: fixed;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  left: 0;
  width: 100%;
  top: 0;
  padding-top: 15%;
  justify-content: center;
  height: 100%;
  z-index: 10050;
}

.popup-fullscreen-content {
  width: 90vw;
  height: 90vh;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.popup-header {
  display: flex;
  justify-content: flex-end;
  padding: 8px;
}

.popup-close {
  background: rgba(255, 255, 255, 0.06);
  color: white;
  border: none;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.popup-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.popup-comparison {
  width: 100%;
  height: 100%;
}

.popup-comparison-slider {
  width: 100%;
  height: 100%;
}
/* Ensure images inside popup are centered and contained */
.popup-comparison-slider img,
.popup-comparison-slider .comparison-image,
.popup-comparison-slider img {
  /* Ensure both first/second images occupy identical boxes inside the slider
     Use absolute positioning so img-comparison-slider's internal layout places
     both images on top of each other with same size even if natural sizes differ */
  position: absolute;
  inset: 0; /* top:0; right:0; bottom:0; left:0 */
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  margin: 0;
}

.format-title-main {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  letter-spacing: -0.025em;
  background: linear-gradient(135deg, #1f2937 0%, #6366f1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.format-title-sub {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
  opacity: 0.85;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgba(107, 114, 128, 0.08);
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid rgba(107, 114, 128, 0.1);
}

.format-close-btn {
  background: rgba(249, 250, 251, 0.8);
  border: 1px solid rgba(209, 213, 219, 0.3);
  border-radius: 14px;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(10px);
}

.format-close-btn:hover {
  background: rgba(243, 244, 246, 0.9);
  border-color: rgba(209, 213, 219, 0.5);
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.format-close-btn:active {
  transform: scale(0.95);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.format-close-icon {
  font-size: 14px;
  color: #6b7280;
  font-weight: 600;
}

.format-select-content {
  padding: 0 28px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  max-height: calc(90vh - 200px);
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

/* Scrollbar styling for the content area */
.format-select-content::-webkit-scrollbar {
  width: 8px;
}

.format-select-content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  margin: 8px 0;
}

.format-select-content::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.2);
  border-radius: 4px;
  transition: background 0.2s ease;
}

.format-select-content::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.4);
}

.format-select-description {
  font-size: 15px;
  color: #6b7280;
  margin: 28px 0;
  line-height: 1.6;
  font-weight: 500;
}

.format-options-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.format-option-card {
  background: linear-gradient(135deg, #ffffff 0%, #fafbfc 100%);
  border: 2px solid rgba(229, 231, 235, 0.5);
  border-radius: 18px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 20px;
  position: relative;
  overflow: hidden;
}

.format-option-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.08) 0%,
    rgba(139, 92, 246, 0.06) 100%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
}

.format-option-card::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.4),
    transparent
  );
  transition: left 0.5s ease;
}

.format-option-card:hover::after {
  left: 100%;
}

.format-option-card:hover {
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 12px 32px rgba(99, 102, 241, 0.12);
  transform: translateY(-3px);
}

.format-option-card:hover::before {
  opacity: 1;
}

.format-option-card.active {
  border-color: #6366f1;
  background: linear-gradient(135deg, #ffffff 0%, #f1f3ff 100%);
  box-shadow: 0 12px 40px rgba(99, 102, 241, 0.25);
  transform: translateY(-2px);
}

.format-option-card.active::before {
  opacity: 1;
}

.format-option-card.active::after {
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% {
    left: -100%;
  }
  50% {
    left: 100%;
  }
  100% {
    left: 100%;
  }
}

.format-option-icon {
  font-size: 38px;
  flex-shrink: 0;
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.12));
  transition: all 0.3s ease;
}

.format-option-card:hover .format-option-icon {
  transform: scale(1.05);
  filter: drop-shadow(0 4px 8px rgba(99, 102, 241, 0.15));
}

.format-option-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.format-option-name {
  font-size: 17px;
  font-weight: 700;
  color: #1f2937;
  letter-spacing: -0.025em;
}

.format-option-desc {
  font-size: 14px;
  color: #6b7280;
  line-height: 1.5;
  font-weight: 500;
}

.format-option-check {
  flex-shrink: 0;
}

.format-check-circle {
  width: 28px;
  height: 28px;
  border: 2px solid #d1d5db;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.format-option-card.active .format-check-circle {
  border-color: #6366f1;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.format-check-mark {
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  animation: checkPulse 0.4s ease-out;
}

@keyframes checkPulse {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.format-dialog-footer {
  padding: 24px 28px 28px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(248, 250, 252, 0.5) 100%
  );
  flex-shrink: 0;
  backdrop-filter: blur(20px);
}

.format-btn {
  border: none;
  border-radius: 14px;
  padding: 14px 24px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  backdrop-filter: blur(10px);
  min-width: 120px;
}

/* 最佳压缩标识样式 */
.best-compression-badge {
  margin-left: 10px;
  background: linear-gradient(90deg, #10b981 0%, #6366f1 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.12);
  display: inline-block;
  vertical-align: middle;
  animation: pulseBest 1.2s infinite;
}

@keyframes pulseBest {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.28);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.28);
  }
}

.conversion-item.best {
  border-color: #10b981 !important;
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.08);
}

.format-btn-secondary {
  background: rgba(249, 250, 251, 0.8);
  color: #6b7280;
  border: 1px solid rgba(209, 213, 219, 0.4);
}

.format-btn-secondary:hover {
  background: rgba(243, 244, 246, 0.9);
  color: #4b5563;
  border-color: rgba(156, 163, 175, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(156, 163, 175, 0.15);
}

.format-btn-primary {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #ffffff;
  border: 1px solid rgba(99, 102, 241, 0.3);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.35);
}

.format-btn-primary:hover {
  background: linear-gradient(135deg, #5b5bf6 0%, #7c3aed 100%);
  box-shadow: 0 10px 32px rgba(99, 102, 241, 0.45);
  transform: translateY(-3px);
}

.format-btn-primary:active {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.5);
}

.format-btn-secondary:active {
  transform: translateY(0px);
  box-shadow: 0 2px 6px rgba(156, 163, 175, 0.2);
}

.format-btn-icon {
  font-size: 16px;
  transition: transform 0.2s ease;
}

.format-btn-primary:hover .format-btn-icon {
  transform: scale(1.1);
}

/* SVG转换选项样式 */
.svg-conversion-options {
  margin-top: 24px;
  padding: 20px;
  background: linear-gradient(
    135deg,
    rgba(16, 185, 129, 0.08) 0%,
    rgba(5, 150, 105, 0.06) 100%
  );
  border-radius: 16px;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.svg-options-title {
  font-size: 15px;
  font-weight: 600;
  color: #10b981;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.svg-options-title::before {
  content: '⚙️';
  font-size: 16px;
}

.svg-options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 12px;
}

.svg-option-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.svg-option-label {
  font-size: 12px;
  font-weight: 600;
  color: #047857;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.svg-option-input {
  padding: 8px 12px;
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  transition: all 0.2s ease;
}

.svg-option-input:focus {
  outline: none;
  border-color: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

.svg-option-input::placeholder {
  color: #6b7280;
  font-style: italic;
}

.svg-options-hint {
  font-size: 11px;
  color: #059669;
  opacity: 0.8;
  font-style: italic;
  text-align: center;
}

/* 响应式设计 */
@media (max-width: 640px) {
  .format-select-dialog {
    width: 95vw;
    margin: 20px;
    border-radius: 20px;
    max-height: 95vh;
  }

  .format-dialog-header {
    padding: 24px 24px 20px;
  }

  .format-select-content {
    padding: 0 24px;
    max-height: calc(95vh - 180px);
    -webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
  }

  .format-select-description {
    font-size: 14px;
    margin-bottom: 24px;
  }

  .format-options-grid {
    gap: 14px;
  }

  .format-dialog-footer {
    padding: 20px 24px 24px;
    flex-direction: column-reverse;
    margin-top: auto;
  }

  .format-btn {
    width: 100%;
    justify-content: center;
    padding: 16px 24px;
  }

  .format-title-main {
    font-size: 18px;
  }

  .format-option-card {
    padding: 18px;
    gap: 16px;
  }

  .format-option-icon {
    font-size: 34px;
  }

  .format-option-name {
    font-size: 16px;
  }

  .format-option-desc {
    font-size: 13px;
  }

  .format-check-circle {
    width: 26px;
    height: 26px;
  }

  .svg-options-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .svg-conversion-options {
    margin-top: 16px;
    padding: 16px;
  }
}

/* Conversion Modal Overlay */
.conversion-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100vh;
  background:
    radial-gradient(
      circle at 50% 30%,
      rgba(99, 102, 241, 0.08) 0%,
      transparent 50%
    ),
    rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.25s ease-out;
}

/* Conversion Dialog */
.conversion-dialog {
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  width: 1200px;
  max-width: 95vw;
  max-height: 90vh;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    0 32px 100px rgba(99, 102, 241, 0.15),
    0 16px 40px rgba(99, 102, 241, 0.08),
    0 4px 12px rgba(0, 0, 0, 0.05);
  animation: slideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Dialog Header */
.conversion-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px 28px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  margin-bottom: 24px;
}

.conversion-dialog-title {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}

.conversion-title-icon {
  font-size: 32px;
  animation: rotate 3s ease-in-out infinite;
  filter: drop-shadow(0 3px 6px rgba(99, 102, 241, 0.2));
}

.conversion-title-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.conversion-title-main {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  letter-spacing: -0.025em;
  background: linear-gradient(135deg, #1f2937 0%, #6366f1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.conversion-title-sub {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
  opacity: 0.85;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgba(107, 114, 128, 0.08);
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid rgba(107, 114, 128, 0.1);
}

.conversion-close-btn {
  background: rgba(249, 250, 251, 0.8);
  border: 1px solid rgba(209, 213, 219, 0.3);
  border-radius: 14px;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(10px);
}

.conversion-close-btn:hover {
  background: rgba(243, 244, 246, 0.9);
  border-color: rgba(209, 213, 219, 0.5);
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.conversion-close-btn:active {
  transform: scale(0.95);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.conversion-close-icon {
  font-size: 14px;
  color: #6b7280;
  font-weight: 600;
}

/* Dialog Body */
.conversion-dialog-body {
  padding: 0 28px 28px;
  overflow-y: auto;
  flex: 1;
}

/* Format Selection */
.format-selection {
  margin-bottom: 24px;
  padding: 20px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.9),
    rgba(248, 250, 252, 0.9)
  );
  border-radius: 16px;
  border: 1px solid rgba(102, 126, 234, 0.2);
  backdrop-filter: blur(10px);
}

.format-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.format-selected {
  display: flex;
  align-items: center;
  gap: 12px;
}

.selected-format-tag {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  color: white;
  font-size: 14px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
}

.change-format-btn {
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #6366f1;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.change-format-btn:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.5);
  transform: translateY(-1px);
}

.conversion-panel {
  min-height: 300px;
}

.conversion-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 20px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.05),
    rgba(248, 250, 252, 0.05)
  );
  border-radius: 16px;
  border: 1px solid rgba(102, 126, 234, 0.1);
}

.loading-spinner {
  position: relative;
  width: 60px;
  height: 60px;
}

.spinner-ring {
  width: 100%;
  height: 100%;
  border: 4px solid rgba(99, 102, 241, 0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.conversion-loading .loading-text {
  font-size: 16px;
  color: #374151;
  font-weight: 600;
}

.conversion-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.conversion-item {
  border-radius: 18px;
  overflow: hidden;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.95),
    rgba(248, 250, 252, 0.95)
  );
  backdrop-filter: blur(20px);
  border: 2px solid rgba(102, 126, 234, 0.15);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.conversion-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(99, 102, 241, 0.1),
    transparent
  );
  transition: left 0.6s;
}

.conversion-item:hover::before {
  left: 100%;
}

.conversion-item:hover {
  transform: translateY(-4px);
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 16px 40px rgba(99, 102, 241, 0.15);
}

.conversion-item.success {
  border-color: rgba(16, 185, 129, 0.3);
}

.conversion-item.fail {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(254, 242, 242, 0.95);
}

.conversion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: linear-gradient(
    135deg,
    rgba(248, 250, 252, 0.9),
    rgba(241, 245, 249, 0.9)
  );
  border-bottom: 1px solid rgba(102, 126, 234, 0.15);
  position: relative;
  z-index: 1;
}

.flow-label {
  display: flex;
  align-items: center;
  gap: 12px;
}

.flow-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.flow-badge.flow-c-t {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: white;
}

.flow-badge.flow-t {
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
}

.flow-badge.flow-t-c {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
}

.tool-name {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
}

.conversion-metrics {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

.conversion-metrics .metric {
  background: rgba(255, 255, 255, 0.8);
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  font-weight: 600;
  backdrop-filter: blur(5px);
  transition: all 0.2s ease;
}

.conversion-metrics .metric:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.conversion-metrics .metric.size {
  color: #374151;
}

.conversion-metrics .metric.ratio {
  color: #059669;
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.3);
}

.conversion-metrics .metric.ratio.neg {
  color: #dc2626;
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
}

.conversion-metrics .metric.duration {
  color: #6366f1;
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
}

.conversion-preview {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
  z-index: 1;
}

.comparison-container {
  width: 100%;
  height: 300px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(102, 126, 234, 0.2);
  position: relative;
}

.conversion-fullscreen-container {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 10000 !important;
  background: rgba(0, 0, 0, 0.95) !important;
  border-radius: 0 !important;
  border: none !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
}

.conversion-comparison-slider {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  --divider-width: 3px;
  --divider-color: rgba(255, 255, 255, 0.8);
  --default-handle-width: 48px;
  --default-handle-color: rgba(255, 255, 255, 0.9);
}

.conversion-comparison-slider .comparison-image {
  /* Force images to share the same positioning and sizing inside the slider
     This prevents blob:image (SVG rasterized) from rendering at native pixel
     size and misaligning against the original. */
  position: absolute;
  inset: 0;
  width: 100%;
  height: 300px;
  object-fit: contain;
  display: block;
  transform: translateZ(0);
}

/* ICO格式结果展示样式 */
.ico-result {
  padding: 20px;
  text-align: center;
}

.ico-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 16px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 12px;
  border: 1px solid rgba(14, 165, 233, 0.2);
}

.ico-info .ico-icon {
  font-size: 20px;
}

.ico-info .ico-text {
  font-weight: 600;
  color: #0284c7;
  font-size: 15px;
}

.ico-info .ico-size {
  font-size: 13px;
  color: #0369a1;
  background: rgba(14, 165, 233, 0.1);
  padding: 4px 8px;
  border-radius: 6px;
  font-family: monospace;
}

.preview-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}

.conversion-error {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: #ef4444;
}

.conversion-error .error-icon {
  font-size: 16px;
}

.conversion-error .error-message {
  font-size: 14px;
}

.conversion-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 16px;
}

.conversion-empty .empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.conversion-empty .empty-text {
  font-size: 14px;
  color: #6b7280;
}

/* Control Buttons */
.control-btn {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.35);
  transform: scale(1.05);
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.control-btn:disabled:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: none;
}

/* Download Button */
.conversion-download-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
  font-size: 13px;
  font-weight: 600;
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.conversion-download-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  transition: left 0.6s;
}

.conversion-download-btn:hover::before {
  left: 100%;
}

.conversion-download-btn:hover {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
  transform: translateY(-2px);
}

.conversion-download-btn:active {
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.5);
  transform: translateY(0);
}

.conversion-download-btn .btn-icon {
  font-size: 14px;
  transition: transform 0.2s ease;
}

.conversion-download-btn:hover .btn-icon {
  transform: scale(1.1);
}

/* Use this result button */
.conversion-use-btn {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  border: none;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
  font-size: 13px;
  font-weight: 600;
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}
.conversion-use-btn:hover {
  transform: translateY(-2px);
}

/* Dialog Footer */
.conversion-dialog-footer {
  padding: 24px 28px 28px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(248, 250, 252, 0.5) 100%
  );
}

.conversion-btn {
  border: none;
  border-radius: 14px;
  padding: 14px 24px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  backdrop-filter: blur(10px);
  min-width: 120px;
  justify-content: center;
}

.conversion-btn-secondary {
  background: rgba(249, 250, 251, 0.8);
  color: #6b7280;
  border: 1px solid rgba(209, 213, 219, 0.4);
}

.conversion-btn-secondary:hover {
  background: rgba(243, 244, 246, 0.9);
  color: #4b5563;
  border-color: rgba(156, 163, 175, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(156, 163, 175, 0.15);
}

.conversion-btn-secondary:active {
  transform: translateY(0px);
  box-shadow: 0 2px 6px rgba(156, 163, 175, 0.2);
}

/* Responsive Design */
@media (max-width: 768px) {
  .conversion-dialog {
    width: 95vw;
    margin: 20px;
    border-radius: 20px;
  }

  .conversion-dialog-header {
    padding: 24px 24px 0;
  }

  .conversion-dialog-body {
    padding: 0 24px 24px;
  }

  .conversion-dialog-footer {
    padding: 20px 24px 24px;
    flex-direction: column-reverse;
  }

  .conversion-btn {
    width: 100%;
    justify-content: center;
  }

  .conversion-metrics {
    flex-wrap: wrap;
    gap: 8px;
  }

  .conversion-metrics .metric {
    font-size: 11px;
    padding: 4px 8px;
  }

  .image-controls {
    gap: 4px;
  }

  .control-btn {
    width: 28px;
    height: 28px;
    font-size: 12px;
  }

  .zoom-info {
    font-size: 10px;
    min-width: 28px;
  }
}

/* 全局防闪烁规则 */
img-comparison-slider,
img-comparison-slider *,
.conversion-comparison-slider,
.conversion-comparison-slider * {
  opacity: 1 !important;
  visibility: visible !important;
  transition: none !important;
  animation: none !important;
  filter: none !important;
  -webkit-filter: none !important;
}

/* 防止浏览器默认的图片加载动画 */
img-comparison-slider img,
.conversion-comparison-slider img {
  opacity: 1 !important;
  visibility: visible !important;
  transition: none !important;
  animation: none !important;
  filter: none !important;
  -webkit-filter: none !important;
}

/* 让转换比对滑块复用全屏滑块的视觉样式 */
:deep(.conversion-comparison-slider .handle) {
  background: rgba(255, 255, 255, 0.9);
  border: 3px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

:deep(.conversion-comparison-slider .handle:hover) {
  transform: scale(1.1);
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.3);
}

:deep(.conversion-comparison-slider .divider) {
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
}

/* 新增中等屏幕适配 */
@media (max-width: 768px) {
  .format-select-dialog {
    width: 92vw;
    border-radius: 18px;
  }

  .format-dialog-header {
    padding: 22px 22px 0;
  }

  .format-select-content {
    padding: 0 22px 22px;
  }

  .format-dialog-footer {
    padding: 18px 22px 22px;
  }
}

@media (max-width: 1024px) {
  .conversion-dialog {
    width: 90vw;
    max-width: 900px;
  }

  .conversion-item {
    margin-bottom: 16px;
  }
}

@media (max-width: 650px) {
  .conversion-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}

/* Additional improvements */
.conversion-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 16px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.05),
    rgba(248, 250, 252, 0.05)
  );
  border-radius: 16px;
  border: 1px solid rgba(102, 126, 234, 0.1);
}

.conversion-empty .empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.conversion-empty .empty-text {
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
}

.conversion-error {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 12px;
  border: 1px solid rgba(239, 68, 68, 0.2);
  position: relative;
  z-index: 1;
}

.conversion-error .error-icon {
  font-size: 16px;
}

.conversion-error .error-message {
  font-size: 14px;
  font-weight: 500;
}
</style>
