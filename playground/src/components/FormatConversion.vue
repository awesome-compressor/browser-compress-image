<template>
  <div class="format-conversion">
    <!-- 预选择格式的对话框 -->
    <el-dialog
      v-model="showFormatSelectDialog"
      :title="`Select Format • ${targetImageName}`"
      width="520px"
      :close-on-click-modal="false"
      :lock-scroll="true"
      append-to-body
      align-center
    >
      <div class="format-select-panel">
        <div class="format-select-header">
          <span class="format-icon">🔄</span>
          <span class="format-title">Convert to format:</span>
        </div>
        <div class="format-options">
          <el-radio-group v-model="selectedTargetFormat">
            <el-radio value="png"> PNG </el-radio>
            <el-radio value="jpeg"> JPEG </el-radio>
            <el-radio value="webp"> WebP </el-radio>
            <el-radio value="ico"> ICO </el-radio>
          </el-radio-group>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="cancelFormatSelection"> Cancel </el-button>
          <el-button type="primary" @click="confirmFormatAndOpenConversion">
            Continue
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 格式转换对比面板 -->
    <el-dialog
      v-model="showConversionPanel"
      :title="`Format Conversion • ${conversionTargetName}`"
      width="1200px"
      :close-on-click-modal="false"
      :lock-scroll="true"
      append-to-body
      modal-class="conversion-modal"
      align-center
      class="conversion-dialog"
      :class="{ 'fullscreen-mode': isFullscreen }"
      @close="closeConversionPanel"
    >
      <div class="conversion-panel">
        <!-- 顶部格式选择区域（仅展示当前选择，修改需返回上一步） -->
        <div class="format-selection readonly">
          <div class="format-header">
            <span class="format-icon">🔄</span>
            <span class="format-title">Convert to format:</span>
          </div>
          <div class="format-selected">
            <el-tag type="info" effect="dark">
              {{ selectedTargetFormat.toUpperCase() }}
            </el-tag>
            <el-button size="small" text type="primary" @click="changeFormat">
              Change
            </el-button>
          </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="conversionLoading" class="conversion-loading">
          <el-icon class="is-loading" size="40px">
            <Loading />
          </el-icon>
          <div class="loading-text">Converting and comparing...</div>
        </div>

        <!-- 转换结果列表 -->
        <div v-else-if="conversionResults.length > 0" class="conversion-list">
          <div
            v-for="r in conversionResults"
            :key="`${r.meta.flow}-${r.meta.tool || 'direct'}`"
            class="conversion-item"
            :class="{
              success: r.success,
              fail: !r.success,
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
              </div>
              <div v-if="r.success" class="conversion-metrics">
                <span class="size">{{ formatFileSize(r.size || 0) }}</span>
                <span
                  class="ratio"
                  :class="{ neg: (r.compressionRatio || 0) < 0 }"
                >
                  {{ (r.compressionRatio || 0) < 0 ? '+' : '-'
                  }}{{ Math.abs(r.compressionRatio || 0).toFixed(1) }}%
                </span>
                <span class="duration"
                  >{{ (r.duration || 0).toFixed(0) }}ms</span
                >
              </div>
            </div>

            <div v-if="r.success && r.url" class="conversion-preview">
              <!-- ICO格式不显示对比slider，因为无法在img标签中正确显示 -->
              <div v-if="selectedTargetFormat === 'ico'" class="ico-result">
                <div class="ico-info">
                  <span class="ico-icon">🔄</span>
                  <span class="ico-text">ICO file converted successfully</span>
                  <span class="ico-size">{{
                    formatFileSize(r.size || 0)
                  }}</span>
                </div>
                <div class="preview-actions">
                  <button
                    class="download-btn"
                    @click="downloadConversionResult(r)"
                  >
                    <span class="btn-icon">⬇️</span>
                    <span class="btn-text">Download</span>
                  </button>
                </div>
              </div>

              <!-- 其他格式显示对比slider -->
              <div v-else>
                <div
                  class="comparison-container"
                  :class="{ 'conversion-fullscreen-container': isFullscreen }"
                  :style="{
                    cursor: imageZoom > 1 ? 'move' : 'default',
                  }"
                  @wheel="handleWheel"
                  @mousedown="handleImageMouseDown"
                  @mousemove="handleImageMouseMove"
                  @mouseup="handleImageMouseUp"
                  @touchstart="handleTouchStart"
                  @touchend="handleTouchEnd"
                >
                  <img-comparison-slider
                    class="conversion-comparison-slider"
                    value="50"
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

                  <!-- 图片信息覆盖层 -->
                  <div
                    class="image-overlay-info"
                    :class="{
                      'mobile-dragging': isMobileDragging,
                      'pc-dragging': isPCDragging,
                    }"
                  >
                    <div class="overlay-header">
                      <div class="image-title">
                        {{ conversionTargetName }} →
                        {{ selectedTargetFormat.toUpperCase() }}
                      </div>
                      <div class="image-controls">
                        <el-button
                          circle
                          size="small"
                          :disabled="imageZoom <= 0.1"
                          title="缩小 (-)"
                          @click="zoomOut"
                        >
                          <el-icon>
                            <ZoomOut />
                          </el-icon>
                        </el-button>
                        <span class="zoom-info"
                          >{{ Math.round(imageZoom * 100) }}%</span
                        >
                        <el-button
                          circle
                          size="small"
                          :disabled="imageZoom >= 5"
                          title="放大 (+)"
                          @click="zoomIn"
                        >
                          <el-icon>
                            <ZoomIn />
                          </el-icon>
                        </el-button>
                        <el-button
                          circle
                          size="small"
                          title="重置缩放 (0)"
                          @click="resetZoom"
                        >
                          <el-icon>
                            <Aim />
                          </el-icon>
                        </el-button>
                        <el-button
                          circle
                          size="small"
                          :title="
                            isFullscreen ? '退出全屏 (Esc)' : '全屏 (Ctrl+F)'
                          "
                          @click="toggleFullscreen"
                        >
                          <el-icon>
                            <FullScreen />
                          </el-icon>
                        </el-button>
                      </div>
                    </div>
                    <div class="image-details">
                      <span>{{
                        r.meta.flow === 'C→T'
                          ? 'Compress → Convert'
                          : r.meta.flow === 'T'
                            ? 'Convert Only'
                            : 'Convert → Compress'
                      }}</span>
                      <span v-if="r.meta.tool">Tool: {{ r.meta.tool }}</span>
                      <span>{{ formatFileSize(r.size || 0) }}</span>
                      <span
                        class="savings"
                        :class="{
                          'savings-negative': (r.compressionRatio || 0) < 0,
                        }"
                      >
                        ({{ (r.compressionRatio || 0) < 0 ? '+' : '-'
                        }}{{ Math.abs(r.compressionRatio || 0).toFixed(1) }}%)
                      </span>
                    </div>
                  </div>
                </div>
                <div class="preview-actions">
                  <button
                    class="download-btn"
                    @click="downloadConversionResult(r)"
                  >
                    <span class="btn-icon">⬇️</span>
                    <span class="btn-text">Download</span>
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

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="closeConversionPanel"> Close </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import type { TargetFormat } from '../../../src/conversion'
import type { ConversionCompareItem } from '../../../src/orchestrators/compareConversion'
import { ElMessage } from 'element-plus'
import { ref, nextTick } from 'vue'
import { buildConversionColumn } from '../../../src/orchestrators/compareConversion'
import {
  // @ts-ignore
  Aim,
  // @ts-ignore
  FullScreen,
  // @ts-ignore
  Loading,
  // @ts-ignore
  ZoomIn,
  // @ts-ignore
  ZoomOut,
} from '@element-plus/icons-vue'
import 'img-comparison-slider/dist/styles.css'

// 导入 img-comparison-slider
import('img-comparison-slider')

// 扩展转换对比项类型以包含url属性
interface ConversionCompareItemWithUrl extends ConversionCompareItem {
  url?: string
}

// 定义组件属性
interface Props {
  toolConfigs: Array<{
    name: string
    key: string
    enabled: boolean
  }>
  preserveExif: boolean
}

const props = defineProps<Props>()

// 定义事件 (暂时未使用，但保留以备将来扩展)
// const emit = defineEmits<{
//   open: [item: { id: string; file: File; originalUrl: string; quality: number }]
// }>()

// 格式转换对比面板状态
const showConversionPanel = ref(false)
const conversionLoading = ref(false)
const conversionTargetName = ref('')
const conversionResults = ref<ConversionCompareItemWithUrl[]>([])
let conversionObjectUrls: string[] = []
const originalImageUrl = ref('')
const selectedTargetFormat = ref<TargetFormat>('webp')

// 图片缩放和全屏状态
const imageZoom = ref(1) // 图片缩放比例
const isFullscreen = ref(false) // 全屏状态
const imageTransform = ref({ x: 0, y: 0 }) // 图片位移
const isMobileDragging = ref(false)
const isPCDragging = ref(false)

// 预选择格式的对话框状态
const showFormatSelectDialog = ref(false)
const targetImageItem = ref<{
  id: string
  file: File
  originalUrl: string
  quality: number
} | null>(null)
const targetImageName = ref('')

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
  showFormatSelectDialog.value = true
}

function confirmFormatAndOpenConversion() {
  showFormatSelectDialog.value = false
  if (targetImageItem.value) {
    openConversionPanel(targetImageItem.value)
  }
}

function cancelFormatSelection() {
  showFormatSelectDialog.value = false
  targetImageItem.value = null
  targetImageName.value = ''
}

function changeFormat() {
  showConversionPanel.value = false
  showFormatSelectDialog.value = true
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
  showConversionPanel.value = true
  conversionLoading.value = true
  conversionTargetName.value = item.file.name
  originalImageUrl.value = item.originalUrl

  // 清理旧的对象URL
  cleanupConversionObjectUrls()

  try {
    // 过滤出启用的工具配置
    const enabledToolConfigs = props.toolConfigs.filter(
      (config) => config.enabled && config.key.trim(),
    )

    // 构建转换对比数据
    // ICO格式特殊处理：不支持压缩，只进行格式转换
    const isICO = selectedTargetFormat.value === 'ico'
    const conversionColumn = await buildConversionColumn({
      file: item.file,
      compressOptions: isICO
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
  } catch (err) {
    console.error('Conversion comparison failed:', err)
    ElMessage.error(
      err instanceof Error ? err.message : 'Failed to compare conversions',
    )
  } finally {
    conversionLoading.value = false
  }
}

function closeConversionPanel() {
  showConversionPanel.value = false
  // 关闭时清理生成的对象URL，避免内存泄漏
  cleanupConversionObjectUrls()
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
  if (!showConversionPanel.value || !isFullscreen.value) return

  switch (e.key) {
    case 'Escape':
      if (isFullscreen.value) {
        toggleFullscreen()
      }
      break
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

// 暴露给父组件的方法
defineExpose({
  openFormatSelectDialog,
})
</script>

<style scoped>
.format-conversion {
  position: relative;
}

.format-select-panel {
  padding: 16px 0;
}

.format-select-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.format-icon {
  font-size: 24px;
}

.format-title {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
}

.format-options .el-radio-group {
  display: flex;
  gap: 16px;
}

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

.conversion-panel {
  min-height: 300px;
}

.conversion-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 16px;
}

.conversion-loading .loading-text {
  font-size: 14px;
  color: #6b7280;
}

.conversion-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.conversion-item {
  border-radius: 16px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(102, 126, 234, 0.2);
  transition: all 0.3s ease;
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
  padding: 16px;
  background: linear-gradient(
    135deg,
    rgba(248, 250, 252, 0.8),
    rgba(241, 245, 249, 0.8)
  );
  border-bottom: 1px solid rgba(102, 126, 234, 0.1);
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
  gap: 16px;
  font-size: 13px;
}

.conversion-metrics .size {
  font-weight: 600;
  color: #374151;
}

.conversion-metrics .ratio {
  font-weight: 600;
  color: #10b981;
}

.conversion-metrics .ratio.neg {
  color: #ef4444;
}

.conversion-metrics .duration {
  color: #6b7280;
}

.conversion-preview {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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

/* Download result button */
.download-btn {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  color: white;
  border: none;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(5, 150, 105, 0.3);
  font-size: 12px;
  font-weight: 600;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.download-btn:hover {
  background: linear-gradient(135deg, #047857 0%, #065f46 100%);
  box-shadow: 0 8px 24px rgba(5, 150, 105, 0.4);
  transform: translateY(-1px);
}

.download-btn:active {
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.5);
  transform: translateY(0);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

:global(.conversion-modal .el-dialog) {
  border-radius: 20px;
  overflow: hidden;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid rgba(102, 126, 234, 0.2);
  box-shadow: 0 25px 80px rgba(102, 126, 234, 0.2);
  backdrop-filter: blur(20px);
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

/* 转换对比面板响应式设计 */
@media (max-width: 1024px) {
  :global(.conversion-modal .el-dialog) {
    margin: 20px;
    width: calc(100vw - 40px) !important;
    max-width: none !important;
  }
}
</style>
