<script setup lang="ts">
import {
  // @ts-ignore
  Aim,
  // @ts-ignore
  CloseBold,
  // @ts-ignore
  Delete,
  // @ts-ignore
  Download,
  // @ts-ignore
  FolderOpened,
  // @ts-ignore
  FullScreen,
  // @ts-ignore
  Key,
  // @ts-ignore
  Loading,
  // @ts-ignore
  Picture,
  // @ts-ignore
  Plus,
  // @ts-ignore
  Setting,
  // @ts-ignore
  Upload,
  // @ts-ignore
  ZoomIn,
  // @ts-ignore
  ZoomOut,
} from '@element-plus/icons-vue'
import GitForkVue from '@simon_he/git-fork-vue'
import { ElMessage } from 'element-plus'
import JSZip from 'jszip'
import { download } from 'lazy-js-utils'
import { h, onMounted, onUnmounted, ref, triggerRef } from 'vue'
import {
  compress,
  compressDecision,
  compressJob,
  compressionQueue,
  getCompressionStats,
  memoryManager,
  waitForCompressionInitialization,
  detectFileFormat,
} from '../../src'
import type {
  CompressionGoal,
  CompressionJobStage,
  CompressionObjectiveDecision,
  CompressionOutputDecision,
  CompressionOutputFormat,
  MultipleCompressResults,
} from '../../src'

import CropPage from './CropPage.vue'
import FormatConversion from './components/FormatConversion.vue'
import { debounce } from './utils'
import { createSvgFileFromClipboardText } from './utils/svgClipboard'
import 'img-comparison-slider/dist/styles.css'

// 导入 img-comparison-slider
import('img-comparison-slider')

const fps = ref(0)
let frameCount = 0
let lastFpsUpdate = performance.now()

function updateFps() {
  frameCount++
  const now = performance.now()
  if (now - lastFpsUpdate >= 1000) {
    fps.value = frameCount
    frameCount = 0
    lastFpsUpdate = now
  }
  requestAnimationFrame(updateFps)
}

onMounted(() => {
  requestAnimationFrame(updateFps)
})
onUnmounted(() => {
  // nothing needed for fps
})

// 单个图片的状态接口
interface ImageItem {
  id: string
  file: File
  originalUrl: string
  compressedUrl?: string
  // If a conversion result was applied to replace the card image
  replacedUrl?: string
  replacedBlob?: Blob
  replacedMime?: string
  replacedSize?: number
  originalSize: number
  compressedSize?: number
  compressionRatio?: number
  isCompressing: boolean
  isUploading?: boolean
  compressionError?: string
  quality: number // 每张图片独立的质量设置
  isQualityCustomized: boolean // 标记图片质量是否被用户单独修改过
  qualityDragging: number // 拖动过程中的临时质量值
  // 预处理参数（裁剪/旋转/缩放）
  preprocess?: import('../../src').PreprocessOptions
  // SVG-specific properties
  isSvg?: boolean // 标记是否为SVG文件
  sourceFormat?: string // 源文件格式（用于检测SVG）
  bestTool?: string
  compressionDuration?: number
  outputDecision?: CompressionOutputDecision
  objectiveDecision?: CompressionObjectiveDecision
  taskStage?: 'uploading' | CompressionJobStage
  processingUiMode?: 'default' | 'subtle'
}

// FormatConversion组件引用
const formatConversionRef = ref()

// 多工具对比结果类型（仅用于 UI 展示）
interface ToolCompareItem {
  tool: string
  url?: string
  blob?: Blob
  compressedSize: number
  compressionRatio: number
  duration: number
  success: boolean
  error?: string
}

interface CompareFinalResult {
  blob: Blob
  url: string
  size: number
  mime: string
}

// 压缩统计信息接口
interface CompressionStatsInfo {
  queuePending: number
  queueRunning: number
  queueCompleted: number
  memoryUsage: number
  memoryAbsolute: number
  isWorkerSupported: boolean
  currentConcurrency: number
}

// 响应式状态
const loading = ref(false)
const downloading = ref(false)
const fileRef = ref()
const isDragOver = ref(false)
const currentImageIndex = ref(0)
const isCompressingAll = ref(false)
const isMobileDragging = ref(false)
const isPCDragging = ref(false) // PC端拖拽状态 // 移动端拖拽状态
// 裁剪页面状态
const showCropPage = ref(false)
const cropOriginalUrl = ref('')
const cropCompressedUrl = ref('')
const croppingIndex = ref<number | null>(null)
const cropPageParentScrollTop = ref(0)

function openCropPage(item: ImageItem) {
  const effectiveUrl = getEffectiveItemUrl(item)
  if (!effectiveUrl) {
    ElMessage.warning('Please wait for compression to finish before cropping')
    return
  }
  croppingIndex.value = imageItems.value.findIndex((it) => it.id === item.id)
  cropOriginalUrl.value = item.originalUrl
  cropCompressedUrl.value = effectiveUrl
  // compute current scroll position of the app container so the modal can align
  const appContainerEl = document.querySelector(
    '.app-container',
  ) as HTMLElement | null
  const st = appContainerEl ? appContainerEl.scrollTop : window.scrollY || 0
  cropPageParentScrollTop.value = st
  showCropPage.value = true
}

function closeCropPage() {
  showCropPage.value = false
  croppingIndex.value = null
}

// 接收裁剪页面返回的预处理参数并触发重新压缩
function applyCropPreprocess(
  preprocess: import('../../src').PreprocessOptions,
) {
  if (croppingIndex.value == null) return
  const idx = croppingIndex.value
  const item = imageItems.value[idx]
  item.preprocess = preprocess
  showCropPage.value = false
  croppingIndex.value = null
  // 重新压缩（带预处理）
  compressImage(item)
}

// 多工具结果对比面板状态
const showComparePanel = ref(false)
const compareLoading = ref(false)
const compareTargetName = ref('')
const compareBestTool = ref('')
const compareResults = ref<ToolCompareItem[]>([])
const compareOutputDecision = ref<CompressionOutputDecision | undefined>()
const compareObjectiveDecision = ref<CompressionObjectiveDecision | undefined>()
const compareFinalResult = ref<CompareFinalResult | null>(null)
const compareTotalDuration = ref<number>(0)
let compareObjectUrls: string[] = []
const compareTargetIndex = ref<number>(-1)
let compareRequestId = 0
const compareRejectedReasons = computed(() => {
  const reasons = [
    ...(compareOutputDecision.value?.rejectedReasons || []),
    ...(compareObjectiveDecision.value?.rejectedReasons || []),
  ].filter(Boolean)

  return [...new Set(reasons)]
})

let formatDialogRequestId = 0

function openFormatSelectDialog(item: ImageItem) {
  // 使用FormatConversion组件打开格式选择对话框
  if (formatConversionRef.value) {
    const requestId = ++formatDialogRequestId
    ;(async () => {
      try {
        const currentFile = await createDisplayedFileForItem(item)
        if (requestId !== formatDialogRequestId || !formatConversionRef.value) {
          return
        }
        formatConversionRef.value.openFormatSelectDialog({
          id: item.id,
          file: currentFile,
          originalUrl: getEffectiveItemUrl(item) || item.originalUrl,
          quality: item.quality,
        })
      } catch (error) {
        if (requestId !== formatDialogRequestId) {
          return
        }
        ElMessage.error(
          error instanceof Error
            ? error.message
            : 'Failed to open format conversion',
        )
      }
    })()
  }
}

async function openComparePanel(item: ImageItem) {
  const requestId = ++compareRequestId
  // 打开面板并加载数据
  showComparePanel.value = true
  compareLoading.value = true
  compareTargetName.value = item.file.name
  compareTargetIndex.value = imageItems.value.findIndex(
    (it) => it.id === item.id,
  )

  // 清理旧的对象URL
  cleanupCompareObjectUrls()
  compareOutputDecision.value = undefined
  compareObjectiveDecision.value = undefined
  compareFinalResult.value = null
  compareTotalDuration.value = 0

  try {
    // 过滤出启用的工具配置
    const enabledToolConfigs = getEnabledToolConfigs()
    const resolvedSourceFile = await createDisplayedFileForItem(item)
    if (requestId !== compareRequestId) {
      return
    }

    // 使用核心 API 获取所有工具结果
    const all = (await compress(resolvedSourceFile, {
      quality: item.quality,
      preserveExif: preserveExif.value,
      output: outputMode.value,
      objective: buildObjectiveOptions(),
      returnAllResults: true,
      type: 'blob',
      toolConfigs: enabledToolConfigs,
    })) as MultipleCompressResults<'blob'>
    if (requestId !== compareRequestId) {
      return
    }

    compareBestTool.value = all.bestTool || ''
    compareOutputDecision.value = all.outputDecision
    compareObjectiveDecision.value = all.objectiveDecision
    compareTotalDuration.value = all.totalDuration || 0

    if (all.bestResult instanceof Blob) {
      const url = URL.createObjectURL(all.bestResult)
      compareObjectUrls.push(url)
      compareFinalResult.value = {
        blob: all.bestResult,
        url,
        size: all.bestResult.size,
        mime: all.bestResult.type,
      }
    }

    // 构建 UI 结果并生成预览 URL
    compareResults.value = (all.allResults || []).map((r) => {
      let url: string | undefined
      if (r.success && r.result instanceof Blob) {
        url = URL.createObjectURL(r.result)
        compareObjectUrls.push(url)
      }
      return {
        tool: r.tool,
        url,
        blob: r.result as Blob | undefined,
        compressedSize: r.compressedSize,
        compressionRatio: r.compressionRatio,
        duration: r.duration,
        success: r.success,
        error: r.error,
      } as ToolCompareItem
    })
  } catch (err) {
    if (requestId !== compareRequestId) {
      return
    }
    console.error('Compare tools failed:', err)
    compareOutputDecision.value = undefined
    compareObjectiveDecision.value = undefined
    compareFinalResult.value = null
    compareTotalDuration.value = 0
    ElMessage.error(
      err instanceof Error ? err.message : 'Failed to compare tools',
    )
  } finally {
    if (requestId === compareRequestId) {
      compareLoading.value = false
    }
  }
}

function closeComparePanel() {
  compareRequestId++
  showComparePanel.value = false
  compareOutputDecision.value = undefined
  compareObjectiveDecision.value = undefined
  compareFinalResult.value = null
  compareTotalDuration.value = 0
  // 无需手动恢复滚动，交由 el-dialog 的 lock-scroll 处理
  // 关闭时清理生成的对象URL，避免内存泄漏
  cleanupCompareObjectUrls()
}

function cleanupCompareObjectUrls() {
  if (compareObjectUrls.length) {
    compareObjectUrls.forEach((u) => URL.revokeObjectURL(u))
    compareObjectUrls = []
  }
}

function clearAppliedReplacement(item: ImageItem) {
  if (item.replacedUrl) {
    try {
      URL.revokeObjectURL(item.replacedUrl)
    } catch (e) {
      /* ignore */
    }
  }

  item.replacedUrl = undefined
  item.replacedBlob = undefined
  item.replacedMime = undefined
  item.replacedSize = undefined
}

// 应用选中的对比结果到当前图片
function applyCompareResult(r: ToolCompareItem) {
  if (!r.success || !r.blob) return
  const idx = compareTargetIndex.value
  if (idx < 0 || idx >= imageItems.value.length) return
  const item = imageItems.value[idx]

  // 释放旧的压缩 URL
  if (item.compressedUrl) {
    URL.revokeObjectURL(item.compressedUrl)
  }

  const newUrl = URL.createObjectURL(r.blob)
  clearAppliedReplacement(item)
  updateImageItem(item, {
    compressedUrl: newUrl,
    compressedSize: r.compressedSize,
    compressionRatio:
      ((item.originalSize - r.compressedSize) / item.originalSize) * 100,
    bestTool: r.tool,
    compressionDuration: r.duration,
    outputDecision: undefined,
    objectiveDecision: undefined,
  })

  ElMessage.success(`Applied result from ${r.tool}`)
}

function applyCompareFinalDecision() {
  const idx = compareTargetIndex.value
  if (idx < 0 || idx >= imageItems.value.length || !compareFinalResult.value) {
    return
  }

  const item = imageItems.value[idx]
  if (item.compressedUrl) {
    URL.revokeObjectURL(item.compressedUrl)
  }

  const newUrl = URL.createObjectURL(compareFinalResult.value.blob)
  clearAppliedReplacement(item)
  updateImageItem(item, {
    compressedUrl: newUrl,
    compressedSize: compareFinalResult.value.size,
    compressionRatio:
      ((item.originalSize - compareFinalResult.value.size) /
        item.originalSize) *
      100,
    bestTool: compareBestTool.value,
    compressionDuration: compareTotalDuration.value,
    outputDecision: compareOutputDecision.value,
    objectiveDecision: compareObjectiveDecision.value,
  })

  ElMessage.success('Applied final decision result')
}

// 压缩进度状态
const compressionProgress = ref({
  current: 0,
  total: 0,
  isActive: false,
})

// 图片查看相关状态
const imageZoom = ref(1) // 图片缩放比例
const isFullscreen = ref(false) // 全屏状态
const imageTransform = ref({ x: 0, y: 0 }) // 图片位移

// 全局配置
const preserveExif = ref(false) // EXIF 信息保留选项
const globalQuality = ref(0.6) // 全局质量设置
const globalQualityDragging = ref(0.6) // 拖动过程中的临时质量值
const outputMode = ref<CompressionOutputFormat>('auto')
const objectiveEnabled = ref(false)
const objectiveTargetKb = ref(300)
const objectiveGoal = ref<CompressionGoal>('balanced')
const outputOptions: CompressionOutputFormat[] = [
  'preserve',
  'auto',
  'jpeg',
  'png',
  'webp',
]
const objectiveGoalOptions: CompressionGoal[] = [
  'fastest',
  'balanced',
  'visually-lossless',
]

// 设置面板相关状态
const showSettingsPanel = ref(false)

// 性能统计信息
const compressionStats = ref<CompressionStatsInfo>({
  queuePending: 0,
  queueRunning: 0,
  queueCompleted: 0,
  memoryUsage: 0,
  memoryAbsolute: 0,
  isWorkerSupported: false,
  currentConcurrency: 0,
})

const itemTaskHandles = new Map<string, { cancel: () => void }>()
const cancelledQueuedItems = new Set<string>()

function setTaskHandle(itemId: string, handle: { cancel: () => void }) {
  itemTaskHandles.set(itemId, handle)
  return handle
}

function clearTaskHandle(itemId: string) {
  itemTaskHandles.delete(itemId)
}

function revokeImageItemUrls(item: ImageItem) {
  try {
    if (item.originalUrl) URL.revokeObjectURL(item.originalUrl)
    if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl)
    if (item.replacedUrl) URL.revokeObjectURL(item.replacedUrl)
  } catch (e) {
    /* ignore */
  }
}

function removeImageItem(itemId: string) {
  const idx = imageItems.value.findIndex((it) => it.id === itemId)
  if (idx === -1) {
    return false
  }

  const removed = imageItems.value.splice(idx, 1)[0]
  revokeImageItemUrls(removed)

  if (currentImageIndex.value >= imageItems.value.length) {
    currentImageIndex.value = Math.max(0, imageItems.value.length - 1)
  }

  return true
}

function isCompressionCancellation(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  return (
    error.name === 'AbortError' ||
    error.message === 'Canceled by user' ||
    error.message.includes('Task cancelled')
  )
}

function getItemTaskLabel(item: ImageItem) {
  switch (item.taskStage) {
    case 'uploading':
    case 'queued':
      return 'Queued...'
    case 'preprocessing':
      return 'Preprocessing...'
    case 'compressing':
      return 'Compressing...'
    case 'converting':
      return 'Converting...'
    case 'cancelled':
      return 'Cancelled'
    case 'failed':
      return 'Failed'
    case 'done':
      return 'Done'
    default:
      return item.isUploading ? 'Queued...' : 'Compressing...'
  }
}

function cancelCompression(item: ImageItem) {
  const task = itemTaskHandles.get(item.id)

  if (item.isUploading) {
    cancelledQueuedItems.add(item.id)
    clearTaskHandle(item.id)
    removeImageItem(item.id)

    if (compressionProgress.value.total > 0) {
      compressionProgress.value.total = Math.max(
        0,
        compressionProgress.value.total - 1,
      )
    }
    ElMessage({
      message: `Removed queued image: ${item.file.name}`,
      type: 'info',
    })
    return
  }

  if (task) {
    task.cancel()
    clearTaskHandle(item.id)
  }

  if (item.isCompressing) {
    updateImageItem(item, {
      isCompressing: false,
      compressionError: 'Canceled by user',
      isUploading: false,
      taskStage: 'cancelled',
    })
    ElMessage({
      message: `Canceled compression: ${item.file.name}`,
      type: 'info',
    })
    return
  }

  // Fallback
  updateImageItem(item, {
    compressionError: 'Canceled by user',
    isUploading: false,
    isCompressing: false,
    taskStage: 'cancelled',
  })
  ElMessage({ message: `Canceled: ${item.file.name}`, type: 'info' })
}

// Cancel all items that are currently in uploading state
function cancelAllUploads() {
  const uploading = imageItems.value.filter((it) => it.isUploading)
  if (uploading.length === 0) {
    console.log('cancelAllUploads: no uploading items')
    return
  }

  console.log('cancelAllUploads: canceling', uploading.length, 'items')
  for (const item of [...uploading]) {
    cancelledQueuedItems.add(item.id)
    clearTaskHandle(item.id)
    removeImageItem(item.id)
  }

  // adjust total
  compressionProgress.value.total = Math.max(
    0,
    compressionProgress.value.total - uploading.length,
  )

  ElMessage({ message: `Canceled ${uploading.length} upload(s)`, type: 'info' })
}

// 工具配置接口
interface ToolConfig {
  name: string
  key: string
  libURL?: string
  enabled: boolean
}

// 可用的工具选项
const availableTools = ['tinypng', 'browser-image-compression']

// 工具配置数组
const toolConfigs = ref<ToolConfig[]>([])

// 临时工具配置（用于设置面板编辑）
const tempToolConfigs = ref<ToolConfig[]>([])

// 打开设置面板时，复制当前配置到临时配置
function openSettingsPanel() {
  tempToolConfigs.value = JSON.parse(JSON.stringify(toolConfigs.value))
  showSettingsPanel.value = true

  const appContainer = document.querySelector('.app-container') as HTMLElement
  if (appContainer) {
    appContainer.style.overflow = 'hidden' // 禁用页面滚动
  }
}

function isToolConfigConfigured(config: ToolConfig) {
  if (config.name === 'tinypng') return config.key.trim().length > 0
  if (config.name === 'browser-image-compression')
    return (config.libURL || '').trim().length > 0
  return false
}

function getEnabledToolConfigs() {
  return toolConfigs.value.filter(
    (config) => config.enabled && isToolConfigConfigured(config),
  )
}

// 关闭设置面板时，不保存临时配置的更改
function closeSettingsPanel() {
  showSettingsPanel.value = false
  const appContainer = document.querySelector('.app-container') as HTMLElement
  if (appContainer) {
    appContainer.style.overflow = '' // 恢复页面滚动
  }
  // 不更新 toolConfigs，保持原有配置
}

// 从 localStorage 恢复设置
function loadSettings() {
  try {
    const savedConfigs = localStorage.getItem('toolConfigs')
    if (savedConfigs) {
      toolConfigs.value = JSON.parse(savedConfigs)
    } else {
      // 默认配置
      toolConfigs.value = [
        {
          name: 'tinypng',
          key: '',
          libURL: '',
          enabled: false,
        },
      ]
    }
  } catch (error) {
    console.warn('Failed to load settings from localStorage:', error)
    // 使用默认配置
    toolConfigs.value = [
      {
        name: 'tinypng',
        key: '',
        libURL: '',
        enabled: false,
      },
    ]
  }

  // 同步初始化拖动状态
  globalQualityDragging.value = globalQuality.value
}

// 保存临时配置到实际配置并保存到 localStorage（显示成功提示）
function saveSettings() {
  try {
    // 将临时配置复制到实际配置
    toolConfigs.value = JSON.parse(JSON.stringify(tempToolConfigs.value))
    // 保存到 localStorage
    localStorage.setItem('toolConfigs', JSON.stringify(toolConfigs.value))
    ElMessage.success('Settings saved successfully!')
    // 关闭设置面板
    showSettingsPanel.value = false
  } catch (error) {
    console.error('Failed to save settings:', error)
    ElMessage.error('Failed to save settings')
  }
}

// 添加新的工具配置（操作临时配置）
function addToolConfig() {
  // 获取已使用的工具名称
  const usedTools = tempToolConfigs.value.map((config) => config.name)
  // 找到第一个未使用的工具
  const availableTool = availableTools.find((tool) => !usedTools.includes(tool))

  if (availableTool) {
    tempToolConfigs.value.push({
      name: availableTool,
      key: '',
      libURL: '',
      enabled: false,
    })
  }
}

// 删除工具配置（操作临时配置）
function removeToolConfig(index: number) {
  tempToolConfigs.value.splice(index, 1)
}

// 全局质量百分比计算属性 - 显示拖动中的值
const globalQualityPercent = computed(() =>
  Math.round(globalQualityDragging.value * 100),
)

// 全局质量拖动输入处理 - 只更新显示，不触发重压缩
function handleGlobalQualityInput(value: number) {
  globalQualityDragging.value = value / 100
}

const debouncedHandleImageQualitySliderChange = debounce(
  handleGlobalQualityChange,
  300,
)
// 全局质量拖动结束处理 - 触发重压缩
async function handleGlobalQualitySliderChange(value: number) {
  const newGlobalQuality = value / 100
  globalQualityDragging.value = newGlobalQuality
  await debouncedHandleImageQualitySliderChange(newGlobalQuality)
}

// 图片列表状态
const imageItems = ref<ImageItem[]>([])

// 辅助函数：更新图片项属性并触发响应式更新
function updateImageItem(item: ImageItem, updates: Partial<ImageItem>) {
  Object.assign(item, updates)
  triggerRef(imageItems)
}

// 修改全局质量变化处理函数 - 只更新未被单独修改过的图片
async function handleGlobalQualityChange(newGlobalQuality: number) {
  globalQuality.value = newGlobalQuality
  globalQualityDragging.value = newGlobalQuality // 同步拖动状态

  // 只更新未被单独修改过的图片质量
  const recompressPromises = imageItems.value
    .filter((item) => !item.isQualityCustomized) // 只处理未被单独修改过的图片
    .map(async (item) => {
      item.quality = newGlobalQuality
      item.qualityDragging = newGlobalQuality // 同步单个图片的拖动状态
      // 如果图片没有在压缩中，自动重新压缩
      if (!item.isCompressing) {
        await compressImage(item, { uiMode: 'subtle' })
      }
    })

  // 并行处理所有图片的重新压缩
  await Promise.all(recompressPromises)
}

// 单个图片质量拖动输入处理 - 只更新显示，不触发重压缩
function handleImageQualityInput(item: ImageItem, value: number) {
  item.qualityDragging = value / 100
}

const debouncedHandleImageQualityChange = debounce(
  handleImageQualityChange,
  300,
)

// 单个图片质量拖动结束处理 - 触发重压缩
async function handleImageQualitySliderChange(item: ImageItem, value: number) {
  const newQuality = value / 100
  item.qualityDragging = newQuality
  await debouncedHandleImageQualityChange(item, value)
}

// 重置单个图片质量到全局质量
async function resetImageQualityToGlobal(item: ImageItem) {
  item.quality = globalQuality.value
  item.qualityDragging = globalQuality.value
  item.isQualityCustomized = false

  // 如果图片没有在压缩中，自动重新压缩
  if (!item.isCompressing) {
    await compressImage(item, { uiMode: 'subtle' })
  }
}

// 单个图片质量变化处理
async function handleImageQualityChange(
  item: ImageItem,
  newQualityPercent: number,
) {
  // 更新质量值 (转换为0-1范围)
  const newQuality = newQualityPercent / 100
  item.quality = newQuality
  item.qualityDragging = newQuality // 同步拖动状态

  // 标记该图片质量已被单独修改
  // 如果修改后的质量与全局质量一致，则取消自定义标记，重新允许全局控制
  if (Math.abs(newQuality - globalQuality.value) < 0.01) {
    item.isQualityCustomized = false
  } else {
    item.isQualityCustomized = true
  }

  // 如果图片没有在压缩中，自动重新压缩
  if (!item.isCompressing) {
    await compressImage(item, { uiMode: 'subtle' })
  }
}

const supportType = [
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]

// 检查并过滤不支持的文件，显示提示信息
function filterAndNotifyUnsupportedFiles(files: File[]): File[] {
  const imageFiles = files.filter((file) => file.type.startsWith('image/'))
  const supportedFiles = imageFiles.filter((file) =>
    supportType.includes(file.type),
  )
  const unsupportedFiles = imageFiles.filter(
    (file) => !supportType.includes(file.type),
  )

  // 如果有不支持的图片格式，显示详细提示
  if (unsupportedFiles.length > 0) {
    const unsupportedDetails = unsupportedFiles.map((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'unknown'
      return {
        name: file.name,
        extension: extension.toUpperCase(),
        type: file.type || 'unknown',
      }
    })

    const unsupportedFormats = [
      ...new Set(unsupportedDetails.map((detail) => detail.extension)),
    ]

    ElMessage({
      message: h('div', [
        h(
          'div',
          { style: 'font-weight: 600; margin-bottom: 6px' },
          `已过滤 ${unsupportedFiles.length} 个不支持的图片文件:`,
        ),
        h(
          'div',
          { style: 'font-size: 13px; margin-bottom: 4px; color: #f56565' },
          `不支持的格式: ${unsupportedFormats.join(', ')}`,
        ),
        unsupportedFiles.length <= 3
          ? h(
              'div',
              { style: 'font-size: 12px; margin-bottom: 6px; opacity: 0.8' },
              unsupportedFiles.map((f) => f.name).join(', '),
            )
          : h(
              'div',
              { style: 'font-size: 12px; margin-bottom: 6px; opacity: 0.8' },
              `${unsupportedFiles
                .slice(0, 2)
                .map((f) => f.name)
                .join(', ')} 等 ${unsupportedFiles.length} 个文件`,
            ),
        h(
          'div',
          {
            style:
              'font-size: 12px; opacity: 0.7; border-top: 1px solid #e2e8f0; padding-top: 4px',
          },
          '✅ 支持的格式: PNG, JPG, JPEG, GIF, WebP, SVG',
        ),
      ]),
      type: 'warning',
      duration: 5000,
    })
  }

  // 如果有非图片文件，也提示
  const nonImageFiles = files.filter((file) => !file.type.startsWith('image/'))
  if (nonImageFiles.length > 0) {
    ElMessage({
      message: h('div', [
        h('div', `📁 检测到 ${nonImageFiles.length} 个非图片文件已被过滤`),
        nonImageFiles.length <= 3
          ? h(
              'div',
              { style: 'font-size: 12px; margin-top: 4px; opacity: 0.8' },
              nonImageFiles.map((f) => f.name).join(', '),
            )
          : h(
              'div',
              { style: 'font-size: 12px; margin-top: 4px; opacity: 0.8' },
              `${nonImageFiles
                .slice(0, 2)
                .map((f) => f.name)
                .join(', ')} 等文件`,
            ),
      ]),
      type: 'info',
      duration: 3000,
    })
  }

  return supportedFiles
}

// 计算属性
const hasImages = computed(() => imageItems.value.length > 0)
const currentImage = computed(() => imageItems.value[currentImageIndex.value])

function getEffectiveItemSize(item: ImageItem) {
  return item.replacedSize ?? item.compressedSize ?? item.originalSize
}

function getEffectiveItemUrl(item: ImageItem) {
  return item.replacedUrl || item.compressedUrl
}

function getEffectiveCompressionRatio(item: ImageItem) {
  if (item.originalSize === 0) {
    return 0
  }

  return (
    ((item.originalSize - getEffectiveItemSize(item)) / item.originalSize) * 100
  )
}

function getFileNameForMime(fileName: string, mime?: string) {
  if (!mime) {
    return fileName
  }

  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '')
  const ext = mime.replace('image/', '').replace('+xml', '')
  const normalizedExt = ext === 'jpeg' ? 'jpg' : ext
  return `${nameWithoutExt}.${normalizedExt}`
}

async function createDisplayedFileForItem(item: ImageItem) {
  if (item.replacedBlob instanceof Blob) {
    const mime = item.replacedBlob.type || item.replacedMime || item.file.type
    return new File(
      [item.replacedBlob],
      getFileNameForMime(item.file.name, mime),
      { type: mime },
    )
  }

  const effectiveUrl = getEffectiveItemUrl(item)
  if (effectiveUrl && effectiveUrl !== item.originalUrl) {
    const response = await fetch(effectiveUrl)
    const blob = await response.blob()
    const mime = blob.type || item.file.type
    return new File([blob], getFileNameForMime(item.file.name, mime), {
      type: mime,
    })
  }

  return item.file
}

const totalOriginalSize = computed(() =>
  imageItems.value.reduce((sum, item) => sum + item.originalSize, 0),
)
const totalEffectiveSize = computed(() =>
  imageItems.value.reduce((sum, item) => sum + getEffectiveItemSize(item), 0),
)

const totalCompressionRatio = computed(() => {
  if (totalOriginalSize.value === 0) return 0
  return (
    ((totalOriginalSize.value - totalEffectiveSize.value) /
      totalOriginalSize.value) *
    100
  )
})
const compressedCount = computed(
  () =>
    imageItems.value.filter(
      (item) => item.compressedUrl && !item.compressionError,
    ).length,
)
const downloadableCount = computed(
  () =>
    imageItems.value.filter(
      (item) => getEffectiveItemUrl(item) && !item.compressionError,
    ).length,
)
const failedCount = computed(
  () => imageItems.value.filter((item) => item.compressionError).length,
)
const activeCount = computed(
  () =>
    imageItems.value.filter((item) => item.isCompressing || item.isUploading)
      .length,
)
const allCompressed = computed(
  () =>
    imageItems.value.length > 0 &&
    downloadableCount.value === imageItems.value.length &&
    failedCount.value === 0 &&
    activeCount.value === 0,
)
const downloadButtonLabel = computed(() =>
  allCompressed.value
    ? `Download All (${downloadableCount.value})`
    : `Download Ready (${downloadableCount.value})`,
)

// 检查是否可以添加新的工具配置
const canAddToolConfig = computed(() => {
  // 获取已使用的工具名称
  const usedTools = tempToolConfigs.value.map((config) => config.name)
  // 检查是否还有未使用的工具
  return availableTools.some((tool) => !usedTools.includes(tool))
})

// 监听 loading 状态变化，控制页面滚动
watch(
  () => loading.value || isCompressingAll.value,
  (isLoading) => {
    if (isLoading) {
      // 禁用页面滚动
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    } else {
      // 恢复页面滚动
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
  },
  { immediate: true },
)

// 注册事件监听器
onMounted(async () => {
  console.log('Image compression playground mounted')

  // 启动性能监控
  startPerformanceMonitoring()

  // 加载保存的设置
  loadSettings()

  // 添加键盘事件监听
  document.addEventListener('keydown', handleKeydown)

  // 添加拖拽事件监听
  document.addEventListener('dragover', handleDragOver)
  document.addEventListener('drop', handleDrop)
  document.addEventListener('dragenter', handleDragEnter)
  document.addEventListener('dragleave', handleDragLeave)
  // 添加移动端触摸事件监听
  document.addEventListener('touchstart', handleTouchStart, { passive: true })
  document.addEventListener('touchend', handleTouchEnd, { passive: true })
  document.addEventListener('touchcancel', handleTouchEnd, { passive: true })
  // 添加PC端鼠标事件监听
  document.addEventListener('mousedown', handleMouseDown)
  document.addEventListener('mouseup', handleMouseUp)
  // 添加键盘事件监听
  document.addEventListener('keydown', handleKeydown)
  // 添加鼠标事件监听（用于图片拖拽）
  document.addEventListener('mousemove', handleImageMouseMove)
  document.addEventListener('mouseup', handleImageMouseUp)
  // 添加粘贴事件监听
  document.addEventListener('paste', handlePaste)
  window.addEventListener('resize', handleWindowResize)
  // 等待压缩系统初始化完成
  try {
    await waitForCompressionInitialization()
    console.log('Compression system initialization completed')

    // 初始化完成后检查设备性能并显示提示
    checkDevicePerformance()
  } catch (error) {
    console.warn('Compression system initialization failed:', error)
    // 即使初始化失败也继续检查设备性能（可能是降级模式）
    checkDevicePerformance()
  }

  console.log(
    'Compression system initialized with enhanced performance features',
  )
})

onBeforeUnmount(() => {
  // 恢复页面滚动设置
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''

  // 清理事件监听器
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('dragover', handleDragOver)
  document.removeEventListener('drop', handleDrop)
  document.removeEventListener('dragleave', handleDragLeave)
  document.removeEventListener('paste', handlePaste)

  // 清理所有对象URL
  imageItems.value.forEach((item) => {
    if (item.originalUrl) {
      URL.revokeObjectURL(item.originalUrl)
    }
    if (item.compressedUrl) {
      URL.revokeObjectURL(item.compressedUrl)
    }
  })

  console.log('Image compression playground unmounted')
})

// 检查设备性能并显示相应提示
function checkDevicePerformance() {
  try {
    const stats = getCompressionStats()

    if (stats.worker.supported) {
      console.log('⚠️  Experimental worker compression is available')
    } else {
      console.log(
        'ℹ️  Using queue-managed main thread compression (worker path is experimental)',
      )
    }

    // 显示设备适配信息
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      )
    const concurrency = stats.queue.maxConcurrency
    console.log(
      `${isMobile ? '📱 Mobile' : '🖥️  Desktop'} mode detected - Max ${concurrency} concurrent compressions${stats.worker.supported ? ' with experimental worker path' : ''}`,
    )
    // ElMessage({
    //   message: `${isMobile ? '📱 Mobile' : '🖥️  Desktop'} mode detected - Max ${concurrency} concurrent compressions${stats.worker.supported ? ' with Worker support' : ''}`,
    //   type: 'info',
    //   duration: 3000,
    // })
  } catch (error) {
    console.warn('Failed to check device performance:', error)
  }
}

// 清空压缩队列
function clearQueue() {
  try {
    // 这里需要从库中导入clearCompressionQueue函数
    // clearCompressionQueue()
    compressionQueue.clearQueue()
    ElMessage({
      message: 'Compression queue cleared',
      type: 'info',
    })
    updateCompressionStats()
  } catch (error) {
    console.error('Failed to clear queue:', error)
  }
}

// 格式化性能统计信息 - 重新设计以确保队列数字准确
const performanceInfo = computed(() => {
  const stats = compressionStats.value

  // 计算实际的队列状态，基于本地图片状态验证
  const actualRunning = imageItems.value.filter(
    (item) => item.isCompressing,
  ).length
  const actualTotal = imageItems.value.length
  const actualCompleted = imageItems.value.filter(
    (item) =>
      !item.isCompressing && item.compressedUrl && !item.compressionError,
  ).length

  // 使用本地状态作为主要数据源，stats作为备用
  const queueRunning = actualRunning > 0 ? actualRunning : stats.queueRunning
  const queuePending = Math.max(0, actualTotal - actualCompleted - queueRunning)

  return {
    queueStatus:
      queueRunning > 0 || queuePending > 0
        ? `${queueRunning}/${queuePending + queueRunning}`
        : '',
    memoryStatus:
      stats.memoryUsage > 0 ? `${Math.round(stats.memoryUsage)}%` : '',
    memoryAbsolute: stats.memoryAbsolute || 0, // 绝对内存值 (MB)
    workerStatus: stats.isWorkerSupported ? 'Enabled' : 'Disabled',
    hasActiveQueue: queueRunning > 0 || queuePending > 0,
    actualRunning: queueRunning,
    actualPending: queuePending,
  }
})

// 移动端触摸事件处理
function handleTouchStart(e: TouchEvent) {
  // 检查触摸是否在图片比较滑块上
  const target = e.target as HTMLElement
  if (
    target.closest('img-comparison-slider') ||
    target.closest('.comparison-slider-fullscreen') ||
    target.closest('.conversion-comparison-slider')
  ) {
    isMobileDragging.value = true
    console.log('touch start')
  }
}

function handleTouchEnd(e: TouchEvent) {
  // 触摸结束时恢复显示
  isMobileDragging.value = false
  console.log('touch end')
}

// PC端鼠标事件处理
function handleMouseDown(e: MouseEvent) {
  // 检查鼠标按下是否在图片比较滑块上
  const target = e.target as HTMLElement
  if (
    target.closest('img-comparison-slider') ||
    target.closest('.comparison-slider-fullscreen') ||
    target.closest('.conversion-comparison-slider')
  ) {
    isPCDragging.value = true
    console.log('mouse down on slider')
  }
}

function handleMouseUp(e: MouseEvent) {
  // 鼠标松开时恢复显示
  isPCDragging.value = false
}

// 拖拽事件处理
function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

function handleDragEnter(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.items) {
    // 检查是否包含图片文件或文件夹
    const hasImageOrFolder = Array.from(e.dataTransfer.items).some(
      (item) =>
        (item.kind === 'file' && item.type.startsWith('image/')) ||
        (item.kind === 'file' && item.type === ''),
    )
    if (hasImageOrFolder) {
      isDragOver.value = true
    }
  }
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  // 只有当离开整个应用区域时才设置为false
  if (
    !e.relatedTarget ||
    !document.querySelector('.app-container')?.contains(e.relatedTarget as Node)
  ) {
    isDragOver.value = false
  }
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false

  loading.value = true

  try {
    let files: File[] = []

    console.log('=== Drop Event Debug ===')
    console.log('dataTransfer.items:', e.dataTransfer?.items)
    console.log('dataTransfer.files:', e.dataTransfer?.files)
    console.log('items length:', e.dataTransfer?.items?.length)
    console.log('files length:', e.dataTransfer?.files?.length)

    // 首先尝试使用 DataTransferItemList API（支持文件夹）
    const items = e.dataTransfer?.items
    if (items && items.length > 0) {
      console.log('使用 DataTransferItemList API')
      files = await extractFilesFromDataTransfer(items)
      console.log(
        'extractFilesFromDataTransfer 结果:',
        files.length,
        files.map((f) => f.name),
      )
    }

    // 如果上面的方法没有获取到文件，回退到传统的 files API
    if (files.length === 0 && e.dataTransfer?.files) {
      console.log('回退到传统 files API')
      files = Array.from(e.dataTransfer.files)
      console.log(
        '传统 API 结果:',
        files.length,
        files.map((f) => f.name),
      )
    }

    if (files.length === 0) {
      console.warn('没有找到任何文件')
      ElMessage({
        message: 'No files found. Please try again.',
        type: 'warning',
      })
      return
    }

    const imageFiles = filterAndNotifyUnsupportedFiles(files)
    console.log(
      '过滤后的图片文件:',
      imageFiles.length,
      imageFiles.map((f) => f.name),
    )

    if (imageFiles.length === 0) {
      ElMessage({
        message: '没有找到支持的图片文件',
        type: 'warning',
      })
      return
    }

    await addNewImages(imageFiles)

    // ElMessage({
    //   message: `Successfully loaded ${imageFiles.length} image(s)`,
    //   type: 'success',
    // })
  } catch (error) {
    console.error('Error processing dropped files:', error)
    ElMessage({
      message: 'Error processing files. Please try again.',
      type: 'error',
    })
  } finally {
    loading.value = false
  }
}

// 粘贴事件处理
async function handlePaste(e: ClipboardEvent) {
  // 检查当前焦点元素是否是输入框或可编辑元素
  const activeElement = document.activeElement
  if (
    activeElement &&
    (activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      (activeElement as HTMLElement).contentEditable === 'true' ||
      activeElement.closest('.el-input__inner') ||
      activeElement.closest('.el-textarea__inner'))
  ) {
    // 如果焦点在输入框中，不阻止默认粘贴行为
    return
  }

  e.preventDefault()

  const items = e.clipboardData?.items
  if (!items || items.length === 0) {
    return
  }

  console.log('=== Paste Event Debug ===')
  console.log('clipboardData.items:', items)
  console.log('items length:', items.length)

  loading.value = true

  try {
    const files: File[] = []

    // 方法1: 首先尝试使用 webkitGetAsEntry API（支持文件夹）
    await Promise.all(
      Array.from(items).map(async (item, i) => {
        console.log(`处理剪贴板 Item ${i}:`, {
          kind: item.kind,
          type: item.type,
          webkitGetAsEntry: !!item.webkitGetAsEntry,
        })

        if (item.kind === 'file') {
          // 尝试使用 webkitGetAsEntry 获取文件系统入口
          const entry = item.webkitGetAsEntry?.()
          console.log(`Item ${i} webkitGetAsEntry:`, entry)

          if (entry) {
            console.log(`Item ${i} 使用 processEntry`)
            const itemFiles: File[] = []
            await processEntry(entry, itemFiles)
            console.log(
              `Item ${i} processEntry 完成，文件数:`,
              itemFiles.length,
              itemFiles.map((f) => f.name),
            )
            files.push(...itemFiles)
          } else {
            // 回退到传统文件API
            console.log(`Item ${i} 回退到 getAsFile`)
            const file = item.getAsFile()
            if (file) {
              console.log(`剪贴板文件 ${i}:`, file.name, file.type, file.size)
              files.push(file)
            } else {
              console.log(`Item ${i} getAsFile 返回 null`)
            }
          }
        } else {
          console.log(`Item ${i} 不是文件类型, kind: ${item.kind}`)
        }
      }),
    )

    console.log(
      `总共收集到 ${files.length} 个文件:`,
      files.map((f) => f.name),
    )

    // 过滤图片文件
    const imageFiles = filterAndNotifyUnsupportedFiles(files)
    console.log(
      '剪贴板过滤后的图片文件:',
      imageFiles.length,
      imageFiles.map((f) => f.name),
    )

    if (imageFiles.length === 0) {
      const svgFile =
        createSvgFileFromClipboardText(
          e.clipboardData?.getData('text/plain') || '',
        ) ||
        createSvgFileFromClipboardText(
          e.clipboardData?.getData('text/html') || '',
        )

      if (!svgFile) {
        console.log('剪贴板中没有找到支持的图片文件或 SVG 代码')
        return // 静默处理，不显示错误消息
      }

      await addNewImages([svgFile])

      ElMessage({
        message: 'Successfully pasted SVG code',
        type: 'success',
      })
      return
    }

    await addNewImages(imageFiles)

    ElMessage({
      message: `Successfully pasted ${imageFiles.length} image(s)`,
      type: 'success',
    })
  } catch (error) {
    console.error('Error processing pasted files:', error)
    ElMessage({
      message: 'Error processing pasted files. Please try again.',
      type: 'error',
    })
  } finally {
    loading.value = false
  }
}

// 从DataTransfer中提取所有文件（包括文件夹中的文件）
async function extractFilesFromDataTransfer(
  items: DataTransferItemList,
): Promise<File[]> {
  console.log('extractFilesFromDataTransfer 开始处理', items.length, '个 items')
  return await extractFilesFromItems(items)
}

// 通用的文件提取函数，支持拖拽和粘贴
async function extractFilesFromItems(
  items: DataTransferItemList,
): Promise<File[]> {
  console.log('extractFilesFromItems 开始处理', items.length, '个 items')

  const promises: Promise<File[]>[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    console.log(`处理 Item ${i}:`, { kind: item.kind, type: item.type })

    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry?.()
      console.log(`Item ${i} webkitGetAsEntry:`, entry)

      if (entry) {
        console.log(`Item ${i} 使用 processEntry`)
        const itemFiles: File[] = []
        promises.push(
          processEntry(entry, itemFiles).then(() => {
            console.log(
              `Item ${i} processEntry 完成，文件数:`,
              itemFiles.length,
              itemFiles.map((f) => f.name),
            )
            return itemFiles
          }),
        )
      } else {
        // 回退到传统文件API - 当webkitGetAsEntry返回null时
        console.log(`Item ${i} 回退到 getAsFile`)
        const file = item.getAsFile()
        if (file) {
          console.log(`Item ${i} getAsFile 成功:`, file.name)
          promises.push(Promise.resolve([file]))
        } else {
          console.log(`Item ${i} getAsFile 失败`)
          promises.push(Promise.resolve([]))
        }
      }
    }
  }

  // 等待所有文件处理完成
  const allFileArrays = await Promise.all(promises)
  const files = allFileArrays.flat()

  console.log(
    'extractFilesFromItems 完成，总共',
    files.length,
    '个文件:',
    files.map((f) => f.name),
  )
  return files
}

// 递归处理文件和文件夹
async function processEntry(
  entry: FileSystemEntry,
  files: File[],
): Promise<void> {
  console.log(
    'processEntry 开始处理:',
    entry.name,
    entry.isFile,
    entry.isDirectory,
  )

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    console.log('处理文件:', fileEntry.name)

    try {
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject)
      })
      console.log('成功获取文件:', file.name, file.size, file.type)
      files.push(file)
      console.log('当前文件数组长度:', files.length)
    } catch (error) {
      console.error('获取文件失败:', fileEntry.name, error)
    }
  } else if (entry.isDirectory) {
    console.log('处理目录:', entry.name)
    const dirEntry = entry as FileSystemDirectoryEntry
    const reader = dirEntry.createReader()
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })

    console.log('目录中的条目数:', entries.length)
    for (const childEntry of entries) {
      await processEntry(childEntry, files)
    }
  }

  console.log('processEntry 完成:', entry.name, '当前总文件数:', files.length)
}

// 文件输入框变化处理
async function handleFileInputChange() {
  const selectedFiles = Array.from(fileRef.value.files || []) as File[]
  if (selectedFiles.length > 0) {
    loading.value = true

    try {
      const imageFiles = filterAndNotifyUnsupportedFiles(selectedFiles)

      if (imageFiles.length === 0) {
        ElMessage({
          message: '没有找到支持的图片文件',
          type: 'warning',
        })
        return
      }

      await addNewImages(imageFiles)

      // ElMessage({
      //   message: `Successfully loaded ${imageFiles.length} image(s)`,
      //   type: 'success',
      // })
    } finally {
      loading.value = false
      // 清空文件输入框的值，确保可以重复选择同一文件
      fileRef.value.value = ''
    }
  }
}

// 添加新图片到列表 - 优化版本使用增强批量压缩
async function addNewImages(files: File[]) {
  if (!files || files.length === 0) return

  console.log(`Adding ${files.length} new images with enhanced compression`)

  // 设置压缩进度
  compressionProgress.value = {
    current: 0,
    total: files.length,
    isActive: true,
  }

  // 创建图片项目
  const newItems: ImageItem[] = files.map((file) => {
    const sourceFormat = detectFileFormat(file)
    const isSvg = sourceFormat === 'svg'

    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      originalUrl: URL.createObjectURL(file),
      originalSize: file.size,
      isCompressing: false,
      isUploading: true,
      quality: globalQuality.value,
      isQualityCustomized: false,
      qualityDragging: globalQuality.value,
      isSvg,
      sourceFormat,
      taskStage: 'uploading',
    }
  })

  // 先添加到列表中显示加载/上传状态
  imageItems.value.push(...newItems)

  try {
    // 检查内存状态
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (!memoryManager.isTotalSizeAcceptable(totalSize)) {
      ElMessage({
        message:
          'Total file size is too large. Consider processing fewer images at once.',
        type: 'warning',
      })
    }

    // 过滤出启用的工具配置
    const enabledToolConfigs = getEnabledToolConfigs()

    // 计算动态超时时间，移动端增加5倍
    const baseTimeout = Math.max(30000, files.length * 10000)
    const deviceTimeout = getDeviceBasedTimeout(baseTimeout)

    // 逐个处理以实现实时进度更新
    let successfulCount = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const item = newItems[i]

      if (
        cancelledQueuedItems.has(item.id) ||
        !imageItems.value.some((it) => it.id === item.id)
      ) {
        cancelledQueuedItems.delete(item.id)
        continue
      }

      try {
        updateImageItem(item, {
          isUploading: false,
          isCompressing: true,
          compressionError: undefined,
          taskStage: 'compressing',
        })

        let result: Blob

        if (item.isSvg) {
          // SVG files skip compression and are ready for conversion
          console.log(`📄 SVG detected: ${file.name}, skipping compression`)

          // For SVG, we just use the original file as the "compressed" result
          // This allows the user to see the SVG and access format conversion
          result = file

          // Mark as successfully processed
          updateImageItem(item, {
            compressedUrl: item.originalUrl, // Use original URL since no compression needed
            compressedSize: item.originalSize, // Original size
            compressionRatio: 0, // No compression for SVG
            bestTool: undefined,
            compressionDuration: undefined,
            outputDecision: undefined,
            objectiveDecision: undefined,
            isCompressing: false,
            taskStage: 'done',
          })

          console.log(`✅ SVG processed ${i + 1}/${files.length}: ${file.name}`)

          // Auto-trigger format conversion dialog for SVG files
          nextTick(() => {
            if (formatConversionRef.value) {
              formatConversionRef.value.openFormatSelectDialog({
                id: item.id,
                file: item.file,
                originalUrl: item.originalUrl,
                quality: item.quality,
              })
            }
          })
        } else {
          const controller = new AbortController()
          setTaskHandle(item.id, {
            cancel: () => controller.abort(),
          })

          const decision = await compressDecision(file, {
            quality: globalQuality.value,
            preserveExif: preserveExif.value,
            toolConfigs: enabledToolConfigs,
            output: outputMode.value,
            objective: buildObjectiveOptions(),
            timeoutMs: deviceTimeout,
            signal: controller.signal,
            type: 'blob',
          })
          if (controller.signal.aborted) {
            throw new Error('Canceled by user')
          }

          result = decision.result

          // 更新单个图片的压缩结果
          updateImageItem(item, {
            compressedUrl: URL.createObjectURL(result),
            compressedSize: result.size,
            compressionRatio:
              ((item.originalSize - result.size) / item.originalSize) * 100,
            bestTool: decision.bestTool,
            compressionDuration: decision.totalDuration,
            outputDecision: decision.outputDecision,
            objectiveDecision: decision.objectiveDecision,
            isCompressing: false,
            taskStage: 'done',
          })

          console.log(`✅ Compressed ${i + 1}/${files.length}: ${file.name}`)
        }

        successfulCount++

        // 实时更新进度
        compressionProgress.value.current = i + 1

        clearTaskHandle(item.id)
      } catch (error) {
        console.error(`❌ Failed to process ${file.name}:`, error)
        clearTaskHandle(item.id)
        updateImageItem(item, {
          isCompressing: false,
          isUploading: false,
          taskStage: isCompressionCancellation(error) ? 'cancelled' : 'failed',
          compressionError: isCompressionCancellation(error)
            ? 'Canceled by user'
            : error instanceof Error
              ? error.message
              : 'Processing failed',
        })

        // 即使失败也要更新进度
        compressionProgress.value.current = i + 1
      }
    }

    console.log(
      `✅ Successfully compressed ${successfulCount}/${files.length} images using enhanced batch processing`,
    )

    // 显示成功消息
    ElMessage({
      message: `Successfully added and compressed ${successfulCount} image(s)`,
      type: 'success',
      duration: 2000,
    })
  } catch (error) {
    console.error('Enhanced batch compression failed:', error)

    // 设置错误状态
    newItems.forEach((item) => {
      updateImageItem(item, {
        isCompressing: false,
        compressionError:
          error instanceof Error ? error.message : 'Batch compression failed',
      })
    })

    ElMessage({
      message: `Failed to compress images: ${error instanceof Error ? error.message : 'Unknown error'}`,
      type: 'error',
    })
  } finally {
    // 重置进度状态
    // 重置进度状态
    compressionProgress.value.isActive = false
  }
}

// 压缩单个图片 - 使用增强的压缩API
async function compressImage(
  item: ImageItem,
  options?: { uiMode?: 'default' | 'subtle' },
): Promise<void> {
  if (item.isCompressing) return

  item.isCompressing = true
  item.compressionError = undefined
  item.taskStage = 'compressing'
  item.processingUiMode = options?.uiMode || 'default'

  try {
    // Handle SVG files differently
    if (item.isSvg) {
      // SVG files don't need compression, just mark as processed
      console.log(`📄 SVG reprocessing skipped: ${item.file.name}`)

      // Keep the original as the "compressed" version
      clearAppliedReplacement(item)
      updateImageItem(item, {
        compressedUrl: item.originalUrl,
        compressedSize: item.originalSize,
        compressionRatio: 0, // No compression for SVG
        bestTool: undefined,
        compressionDuration: undefined,
        outputDecision: undefined,
        objectiveDecision: undefined,
        taskStage: 'done',
      })

      // 强制触发响应式更新
      triggerRef(imageItems)
      return
    }

    // 过滤出启用的工具配置
    const enabledToolConfigs = getEnabledToolConfigs()

    let compressedBlob: Blob
    let bestTool: string | undefined
    let compressionDuration: number | undefined
    let outputDecision: CompressionOutputDecision | undefined
    let objectiveDecision: CompressionObjectiveDecision | undefined

    if (item.preprocess) {
      updateImageItem(item, {
        bestTool: undefined,
        compressionDuration: undefined,
        outputDecision: undefined,
        objectiveDecision: undefined,
      })

      const job = compressJob(item.file, {
        quality: item.quality, // 直接使用图片的质量设置（已经是0-1范围）
        preserveExif: preserveExif.value, // 使用全局 EXIF 保留设置
        toolConfigs: enabledToolConfigs, // 传入工具配置
        output: outputMode.value,
        objective: buildObjectiveOptions(),
        preprocess: item.preprocess, // 预处理：裁剪/旋转/缩放
        useWorker: false, // Worker 路径仍在完善，当前默认走主线程
        useQueue: true, // 启用队列管理
        timeout: getDeviceBasedTimeout(30000), // 设备适配的超时时间
        type: 'blob', // 确保返回Blob类型
      })
      const stopStage = job.onStageChange((stage) => {
        item.taskStage = stage
        triggerRef(imageItems)
      })
      const stopMetrics = job.onMetrics((metrics) => {
        if (metrics.durationMs !== undefined) {
          compressionDuration = metrics.durationMs
          item.compressionDuration = metrics.durationMs
          triggerRef(imageItems)
        }
      })
      setTaskHandle(item.id, job)
      try {
        compressedBlob = await job.promise
      } finally {
        stopStage()
        stopMetrics()
      }
    } else {
      const controller = new AbortController()
      setTaskHandle(item.id, {
        cancel: () => controller.abort(),
      })

      const decision = await compressDecision(item.file, {
        quality: item.quality,
        preserveExif: preserveExif.value,
        toolConfigs: enabledToolConfigs,
        output: outputMode.value,
        objective: buildObjectiveOptions(),
        timeoutMs: getDeviceBasedTimeout(30000),
        signal: controller.signal,
        type: 'blob',
      })

      compressedBlob = decision.result
      bestTool = decision.bestTool
      compressionDuration = decision.totalDuration
      outputDecision = decision.outputDecision
      objectiveDecision = decision.objectiveDecision
    }

    if (!compressedBlob) {
      ElMessage({
        message: 'Compression failed: size is too large',
        type: 'error',
      })
      return
    }

    if (item.compressedUrl && item.compressedUrl !== item.originalUrl) {
      URL.revokeObjectURL(item.compressedUrl)
    }

    clearAppliedReplacement(item)
    updateImageItem(item, {
      compressedUrl: URL.createObjectURL(compressedBlob),
      compressedSize: compressedBlob.size,
      compressionRatio:
        ((item.originalSize - compressedBlob.size) / item.originalSize) * 100,
      bestTool,
      compressionDuration,
      outputDecision,
      objectiveDecision,
      taskStage: 'done',
    })

    // 强制触发响应式更新
    triggerRef(imageItems)
  } catch (error) {
    console.error('Enhanced processing error:', error)
    if (isCompressionCancellation(error)) {
      item.taskStage = 'cancelled'
      item.compressionError = 'Canceled by user'
      return
    }
    item.taskStage = 'failed'
    item.compressionError =
      error instanceof Error ? error.message : 'Processing failed'

    // 显示具体错误信息
    ElMessage({
      message: `Processing failed for ${item.file.name}: ${item.compressionError}`,
      type: 'error',
    })
  } finally {
    item.isCompressing = false
    item.processingUiMode = undefined
    clearTaskHandle(item.id)
  }
}

// 更新性能统计信息
function updateCompressionStats() {
  try {
    const stats = getCompressionStats()
    const memoryStats = memoryManager.getMemoryStats()

    // 获取绝对内存使用量 (MB)
    let memoryAbsolute = 0
    if ((performance as any).memory) {
      memoryAbsolute = Math.round(
        (performance as any).memory.usedJSHeapSize / 1024 / 1024,
      )
    }

    compressionStats.value = {
      queuePending: stats.queue.pending,
      queueRunning: stats.queue.running,
      queueCompleted: stats.queue.completed,
      memoryUsage: memoryStats.memoryUsagePercentage,
      memoryAbsolute, // 绝对内存值 (MB)
      isWorkerSupported: stats.worker.supported,
      currentConcurrency: stats.queue.maxConcurrency,
    }
  } catch (error) {
    console.warn('Failed to update compression stats:', error)
  }
}

// 启动性能监控
function startPerformanceMonitoring() {
  // 每10秒更新一次统计信息
  setInterval(updateCompressionStats, 10000)

  // 单独的内存监控，每5秒更新一次，确保压缩时实时显示
  setInterval(() => {
    if ((performance as any).memory) {
      const memoryAbsolute = Math.round(
        (performance as any).memory.usedJSHeapSize / 1024 / 1024,
      )
      compressionStats.value.memoryAbsolute = memoryAbsolute
    }
  }, 5000)

  // 初始更新
  updateCompressionStats()

  console.log('Performance monitoring started for image compression')
}

// 处理 EXIF 保留选项变化
async function handlePreserveExifChange() {
  await recompressAllImages()
}

async function recompressAllImages() {
  // 重新压缩所有已存在的图片，使用新的 EXIF 设置
  for (const item of imageItems.value) {
    if (!item.isCompressing) {
      await compressImage(item)
    }
  }
}

async function retryFailedImages() {
  const failedItems = imageItems.value.filter(
    (item) => item.compressionError && !item.isCompressing,
  )

  for (const item of failedItems) {
    await compressImage(item)
  }
}

async function handleDecisionSettingsChange() {
  objectiveTargetKb.value = Math.max(
    1,
    Math.round(objectiveTargetKb.value || 1),
  )
  await recompressAllImages()
}

function buildObjectiveOptions() {
  if (!objectiveEnabled.value) {
    return undefined
  }

  return {
    targetBytes: Math.max(1, Math.round(objectiveTargetKb.value || 1)) * 1024,
    goal: objectiveGoal.value,
    output: outputMode.value,
  }
}

function formatOutputModeLabel(mode: CompressionOutputFormat) {
  switch (mode) {
    case 'preserve':
      return 'Preserve'
    case 'auto':
      return 'Auto'
    default:
      return mode.toUpperCase()
  }
}

function formatDecisionOutput(
  selected?: CompressionOutputDecision['selected'],
) {
  if (!selected) {
    return ''
  }

  return selected === 'preserve' ? 'Preserve' : selected.toUpperCase()
}

function formatObjectiveGoalLabel(goal: CompressionGoal) {
  switch (goal) {
    case 'visually-lossless':
      return 'Lossless'
    case 'balanced':
      return 'Balanced'
    case 'fastest':
      return 'Fastest'
    default:
      return goal
  }
}

function hasDecisionFallback(item: ImageItem) {
  return Boolean(
    item.outputDecision?.usedFallback || item.objectiveDecision?.usedFallback,
  )
}

// 删除单个图片
function deleteImage(index: number) {
  const item = imageItems.value[index]
  const task = itemTaskHandles.get(item.id)
  if (item.isUploading) {
    cancelledQueuedItems.add(item.id)
    compressionProgress.value.total = Math.max(
      0,
      compressionProgress.value.total - 1,
    )
  }
  if (task) {
    task.cancel()
  }
  clearTaskHandle(item.id)
  revokeImageItemUrls(item)

  imageItems.value.splice(index, 1)

  // 调整当前图片索引
  if (currentImageIndex.value >= imageItems.value.length) {
    currentImageIndex.value = Math.max(0, imageItems.value.length - 1)
  }
}

// 清空所有图片 - 增强版本包含队列清理和内存管理
function clearAllImages() {
  console.log('Clearing all images with enhanced cleanup')

  try {
    itemTaskHandles.forEach((task) => task.cancel())
    itemTaskHandles.clear()
    cancelledQueuedItems.clear()

    // 1. 清空压缩队列中的待处理任务
    clearQueue()

    // 2. 释放所有对象URL
    imageItems.value.forEach((item) => {
      revokeImageItemUrls(item)
    })

    // 3. 清空图片列表
    imageItems.value = []
    currentImageIndex.value = 0

    // 4. 重置压缩状态
    isCompressingAll.value = false

    // 5. 执行内存清理
    memoryManager.performCleanup()

    // 6. 更新统计信息
    updateCompressionStats()

    console.log('✅ All images cleared successfully')

    ElMessage({
      message: 'All images cleared and memory optimized',
      type: 'success',
      duration: 2000,
    })
  } catch (error) {
    console.error('Error clearing images:', error)
    ElMessage({
      message: 'Error occurred while clearing images',
      type: 'error',
    })
  }
}

// 上传图片
function uploadImages() {
  document.getElementById('file')?.click()
}

// 生成带时间戳的文件夹名称
function generateFolderName(): string {
  const now = new Date()
  const timestamp = now
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '-')
    .replace('T', '_')
    .slice(0, 19) // 取到秒级别: YYYY-MM-DD_HH-MM-SS
  return `browser-compress-image_${timestamp}`
}

// 下载单个图片（保持原始文件名）
async function downloadImage(item: ImageItem) {
  const sourceUrl = getEffectiveItemUrl(item)
  if (!sourceUrl) return

  try {
    // choose filename based on replacedMime if present
    let fileName = item.file.name
    if (item.replacedMime) {
      const nameWithoutExt = item.file.name.replace(/\.[^/.]+$/, '')
      const ext = String(item.replacedMime).replace('image/', '')
      const extension = ext === 'jpeg' ? 'jpg' : ext
      fileName = `${nameWithoutExt}.${extension}`
    }

    download(sourceUrl, fileName)

    ElMessage({
      message: `Downloaded: ${fileName}`,
      type: 'success',
      duration: 2000,
    })
  } catch (error) {
    ElMessage({
      message: 'Download failed. Please try again.',
      type: 'error',
    })
  }
}

// 接收来自 FormatConversion 组件的应用事件，将转换结果应用到对应的 image item
function applyConversionToItem(payload: {
  id: string
  blob: Blob
  size?: number
  mime?: string
  url?: string
}) {
  const idx = imageItems.value.findIndex((it) => it.id === payload.id)
  if (idx === -1) return
  const item = imageItems.value[idx]

  // 清理旧的 replacedUrl
  if (item.replacedUrl) {
    try {
      URL.revokeObjectURL(item.replacedUrl)
    } catch (e) {
      /* ignore */
    }
  }

  // Prefer to create our own object URL from the blob (if provided).
  // The conversion panel creates temporary URLs for preview and will revoke
  // them when it closes — if we reuse that URL the parent may end up
  // holding a revoked URL. Creating our own URL from the blob avoids this.
  const newUrl = payload.blob ? URL.createObjectURL(payload.blob) : payload.url
  item.replacedUrl = newUrl
  item.replacedBlob = payload.blob
  item.replacedMime = payload.mime
  item.replacedSize = payload.size

  // 更新视图
  triggerRef(imageItems)

  ElMessage.success('Applied converted image to card')
}

// 恢复被替换的图片（还原到上传时的原始图片）
function restoreReplacedImage(item: ImageItem) {
  if (!item.replacedUrl) return

  clearAppliedReplacement(item)

  triggerRef(imageItems)
  ElMessage.info('Restored original uploaded image')
}

// 批量下载所有图片（创建 ZIP 压缩包）
async function downloadAllImages() {
  if (downloading.value) return

  // Prefer items that have either a replacedUrl (user-applied conversion) or compressedUrl
  const downloadableItems = imageItems.value.filter(
    (item) => getEffectiveItemUrl(item) && !item.compressionError,
  )
  if (downloadableItems.length === 0) {
    ElMessage({
      message: 'No compressed images to download',
      type: 'warning',
    })
    return
  }

  const downloadedOriginalSize = downloadableItems.reduce(
    (sum, item) => sum + item.originalSize,
    0,
  )
  const downloadedFinalSize = downloadableItems.reduce(
    (sum, item) => sum + getEffectiveItemSize(item),
    0,
  )
  const downloadedCompressionRatio =
    downloadedOriginalSize === 0
      ? 0
      : ((downloadedOriginalSize - downloadedFinalSize) /
          downloadedOriginalSize) *
        100

  downloading.value = true

  try {
    // 生成带时间戳的文件夹名称
    const folderName = generateFolderName()

    // 创建 JSZip 实例
    const zip = new JSZip()
    const folder = zip.folder(folderName)

    if (!folder) {
      throw new Error('Failed to create folder in ZIP')
    }

    // 添加延迟显示加载状态
    await new Promise((resolve) => setTimeout(resolve, 300))

    // 将所有压缩图片添加到 ZIP 中
    for (const item of downloadableItems) {
      // Prefer replacedUrl (applied conversion) over compressedUrl
      const sourceUrl = getEffectiveItemUrl(item)
      if (!sourceUrl) continue

      const response = await fetch(sourceUrl)
      const blob = await response.blob()

      // If we have mime for replaced or can infer extension, adjust filename
      let fileName = item.file.name
      if (item.replacedMime) {
        // try to swap extension to replacedMime
        const nameWithoutExt = item.file.name.replace(/\.[^/.]+$/, '')
        const ext = String(item.replacedMime).replace('image/', '')
        const extension = ext === 'jpeg' ? 'jpg' : ext
        fileName = `${nameWithoutExt}.${extension}`
      }

      folder.file(fileName, blob)
    }

    // 生成 ZIP 文件
    const zipBlob = await zip.generateAsync({ type: 'blob' })

    // 下载 ZIP 文件
    const zipFileName = `${folderName}.zip`
    download(URL.createObjectURL(zipBlob), zipFileName)

    ElMessage({
      message: h('div', { style: 'line-height: 1.5;' }, [
        h(
          'div',
          { style: 'color: #16a34a; font-weight: 500; margin-bottom: 4px;' },
          `Successfully downloaded ${downloadableItems.length} images in ${zipFileName}`,
        ),
        h(
          'div',
          {
            style: `color: ${downloadedCompressionRatio < 0 ? '#dc2626' : '#059669'}; font-size: 13px; font-family: monospace; background: ${downloadedCompressionRatio < 0 ? 'rgba(220, 38, 38, 0.1)' : 'rgba(5, 150, 105, 0.1)'}; padding: 2px 6px; border-radius: 4px;`,
          },
          `Downloaded set ${downloadedCompressionRatio < 0 ? 'increased' : 'saved'}: ${downloadedCompressionRatio < 0 ? '+' : ''}${Math.abs(downloadedCompressionRatio).toFixed(1)}%`,
        ),
      ]),
      type: 'success',
      duration: 4000,
    })
  } catch (error) {
    console.error('Batch download error:', error)
    ElMessage({
      message: 'Batch download failed. Please try again.',
      type: 'error',
    })
  } finally {
    downloading.value = false
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

// 切换当前预览图片
function setCurrentImage(index: number) {
  currentImageIndex.value = index

  if (isFullscreen.value) {
    // 全屏模式下切换图片时，保持当前缩放比例和所有位移不变
    // 只是切换图片索引，不改变任何变换状态
    nextTick(() => {
      // 重新计算边界约束，确保当前位移在新图片的有效范围内
      constrainImagePosition()
    })
  } else {
    // 非全屏模式下切换图片时，重置缩放和位移
    resetImageTransform()
  }
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

// 图片加载完成处理
function handleImageLoad(type: 'original' | 'compressed') {
  console.log(`${type}图加载完成`)
  console.log(imageItems.value)
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

// 键盘事件处理
function handleKeydown(e: KeyboardEvent) {
  if (!hasImages.value) return

  // Shift+Escape: cancel all uploads
  if (e.key === 'Escape' && e.shiftKey) {
    e.preventDefault()
    cancelAllUploads()
    return
  }

  switch (e.key) {
    case 'Escape':
      // If there are uploading items, prefer cancelling upload instead of toggling fullscreen
      const uploadingItems = imageItems.value.filter((it) => it.isUploading)
      if (uploadingItems.length > 0) {
        // If current image is uploading, cancel it; otherwise cancel the first uploading
        const cur = currentImage.value
        if (cur && cur.isUploading) {
          cancelCompression(cur)
        } else {
          cancelCompression(uploadingItems[0])
        }
        // prevent other escape handlers
        e.preventDefault()
        return
      }

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

// 计算图片拖拽边界
function calculateImageBounds() {
  if (!isFullscreen.value || imageZoom.value <= 1) {
    return { maxX: 0, maxY: 0, minX: 0, minY: 0 }
  }

  // 获取全屏容器的实际尺寸
  const container = document.querySelector(
    '.comparison-container-fullscreen',
  ) as HTMLElement
  if (!container) {
    return { maxX: 0, maxY: 0, minX: 0, minY: 0 }
  }

  const containerRect = container.getBoundingClientRect()
  const containerWidth = containerRect.width
  const containerHeight = containerRect.height

  // 获取图片元素
  const imgElement = container.querySelector(
    '.comparison-image-fullscreen, .single-image',
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

  console.log('边界计算:', {
    zoom: imageZoom.value,
    container: { width: containerWidth, height: containerHeight },
    natural: { width: naturalWidth, height: naturalHeight },
    display: { width: displayWidth, height: displayHeight },
    scaled: { width: scaledWidth, height: scaledHeight },
    bounds: {
      maxX: maxMoveX,
      maxY: maxMoveY,
      minX: -maxMoveX,
      minY: -maxMoveY,
    },
  })

  return {
    maxX: maxMoveX,
    maxY: maxMoveY,
    minX: -maxMoveX,
    minY: -maxMoveY,
  }
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

// 检测是否为移动设备
function isMobileDevice(): boolean {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ) || window.innerWidth <= 768
  )
}

// 获取基于设备的timeout时间
function getDeviceBasedTimeout(baseTimeout: number): number {
  return isMobileDevice() ? baseTimeout * 5 : baseTimeout
}
</script>

<template>
  <div class="app-container" :class="{ 'drag-over': isDragOver }">
    <!-- 左上角内存和状态显示 -->
    <div class="fps-style-info">
      <div
        v-if="performanceInfo.memoryAbsolute > 0"
        class="memory-indicator"
        :class="{ 'memory-high': compressionStats.memoryUsage > 80 }"
      >
        RAM: {{ performanceInfo.memoryAbsolute }}MB
        <br />
        FPS: {{ fps }}
      </div>
      <div v-if="compressionStats.isWorkerSupported" class="worker-indicator">
        ⚡ Worker
      </div>
    </div>

    <!-- 拖拽覆盖层 -->
    <div v-show="isDragOver" class="drag-overlay">
      <div class="drag-message">
        <el-icon class="drag-icon">
          <FolderOpened />
        </el-icon>
        <div class="drag-text">Drop images or folders here</div>
        <div class="drag-subtitle">
          Support multiple images and folder drag & drop • Or use Ctrl+V to
          paste images or SVG code
        </div>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-show="loading || isCompressingAll" class="loading-overlay">
      <div class="loading-spinner">
        <el-icon class="is-loading" size="40px">
          <Loading />
        </el-icon>
        <div class="loading-text">
          {{ loading ? 'Loading images...' : 'Compressing images...' }}
        </div>
        <div
          v-if="compressionProgress.isActive && compressionProgress.total > 0"
          class="loading-progress"
        >
          {{ compressionProgress.current }}/{{ compressionProgress.total }}
        </div>
      </div>
    </div>

    <GitForkVue
      link="https://github.com/awesome-compressor/browser-compress-image"
      position="right"
      type="corners"
      content="Star on GitHub"
      color="#667eea"
    />

    <!-- Header -->
    <header class="header-section">
      <div class="title-container">
        <vivid-typing content="Browser Compress Image" class="main-title" />
        <p class="subtitle">
          Compress your images with ease, right in your browser • Support batch
          processing
        </p>
      </div>
    </header>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Settings Section - Always visible -->
      <section class="settings-section-main">
        <div class="settings-container">
          <el-button
            type="primary"
            class="settings-btn-main"
            :icon="Setting"
            plain
            @click="openSettingsPanel"
          >
            Configure Compression Tools
          </el-button>
          <p class="settings-hint">
            Configure API keys and enable compression tools before uploading
            images
          </p>
        </div>
      </section>

      <!-- 初始上传区域 - 仅在没有图片时显示 -->
      <section v-if="!hasImages" class="upload-zone">
        <button class="upload-btn-hero" @click="uploadImages">
          <el-icon class="upload-icon">
            <Picture />
          </el-icon>
          <span class="upload-text">Drop, Paste or Click to Upload Images</span>
          <span class="upload-hint">
            Support PNG, JPG, JPEG, GIF, WebP, SVG formats • Multiple files &
            folders supported • Use Ctrl+V to paste images or raw SVG code
          </span>
        </button>
      </section>

      <!-- 简化的工具栏 - 仅在有图片时显示 -->
      <div v-if="hasImages" class="floating-toolbar">
        <div class="toolbar-section files-section">
          <div class="files-info">
            <div class="files-icon">📷</div>
            <span class="files-count">{{ imageItems.length }} image(s)</span>
            <span class="compressed-count"
              >({{ compressedCount }} compressed)</span
            >
          </div>

          <div class="action-buttons">
            <button
              class="action-btn add-btn"
              title="Add More Images"
              @click="uploadImages"
            >
              <div class="btn-icon">
                <el-icon>
                  <Upload />
                </el-icon>
              </div>
              <span class="btn-text">Add More</span>
            </button>
            <button
              v-if="failedCount > 0"
              class="action-btn retry-btn"
              :title="`Retry ${failedCount} failed image(s)`"
              @click="retryFailedImages"
            >
              <div class="btn-icon">↻</div>
              <span class="btn-text">Retry Failed</span>
            </button>
            <button
              class="action-btn delete-btn"
              title="Clear All Images"
              @click="clearAllImages"
            >
              <div class="btn-icon">
                <el-icon>
                  <CloseBold />
                </el-icon>
              </div>
              <span class="btn-text">Clear All</span>
            </button>
          </div>
        </div>

        <div class="toolbar-divider" />

        <div class="toolbar-section stats-section">
          <div class="stats-info">
            <span class="size-label"
              >Total: {{ formatFileSize(totalOriginalSize) }} →
              {{ formatFileSize(totalEffectiveSize) }}</span
            >
            <span
              class="saved-mini"
              :class="{ 'saved-negative': totalCompressionRatio < 0 }"
            >
              {{ totalCompressionRatio < 0 ? '+' : '-'
              }}{{ Math.abs(totalCompressionRatio).toFixed(1) }}%
            </span>
          </div>
          <div class="stats-pills">
            <span v-if="activeCount > 0" class="stats-pill working-pill">
              {{ activeCount }} working
            </span>
            <span v-if="failedCount > 0" class="stats-pill failed-pill">
              {{ failedCount }} failed
            </span>
            <span v-if="downloadableCount > 0" class="stats-pill ready-pill">
              {{ downloadableCount }} ready
            </span>
          </div>
        </div>

        <div class="toolbar-divider" />

        <!-- 性能监控信息 -->
        <!-- 简洁的队列状态和控制 -->
        <!-- <div
          v-if="performanceInfo.hasActiveQueue"
          class="toolbar-section queue-section"
        >
          <div class="queue-info">
            <span class="queue-status">
              Queue: {{ performanceInfo.queueStatus }}
            </span>
            <button
              class="queue-clear-btn"
              title="Clear Queue"
              @click="clearQueue"
            >
              ✕
            </button>
          </div>
        </div> -->

        <!-- <div v-if="performanceInfo.hasActiveQueue" class="toolbar-divider" /> -->

        <div class="toolbar-section options-section">
          <div class="exif-option">
            <el-checkbox
              v-model="preserveExif"
              @change="handlePreserveExifChange"
            >
              <span class="exif-label"><span>Preserve</span> EXIF</span>
            </el-checkbox>
          </div>

          <div class="quality-control">
            <div class="global-quality-header">
              <div class="quality-info-global">
                <span class="quality-label-global">Global Quality</span>
                <span class="quality-value-global"
                  >{{ globalQualityPercent }}%</span
                >
              </div>
              <div class="quality-indicator">
                <div class="quality-bar-bg">
                  <div
                    class="quality-bar-fill"
                    :style="{ width: `${globalQualityPercent}%` }"
                  />
                </div>
              </div>
            </div>
            <el-slider
              :model-value="globalQualityPercent"
              :max="100"
              :step="1"
              :min="1"
              class="global-quality-slider"
              :show-tooltip="false"
              size="small"
              @input="handleGlobalQualityInput"
              @change="handleGlobalQualitySliderChange"
            />
          </div>

          <div class="decision-control">
            <div class="decision-toolbar-row">
              <div class="decision-summary-inline">
                <span class="decision-label-global">Output Strategy</span>
                <span class="decision-summary-main">
                  {{ formatOutputModeLabel(outputMode) }}
                </span>
                <span class="decision-summary-detail">
                  {{
                    objectiveEnabled
                      ? `≤ ${objectiveTargetKb} KB · ${formatObjectiveGoalLabel(objectiveGoal)}`
                      : 'No target size'
                  }}
                </span>
              </div>

              <el-popover
                trigger="click"
                placement="bottom-end"
                :width="320"
                popper-class="decision-popover-panel"
              >
                <template #reference>
                  <button class="decision-trigger" type="button">
                    {{ objectiveEnabled ? 'Edit' : 'Set' }}
                  </button>
                </template>

                <div class="decision-popover-content">
                  <div class="decision-popover-header">
                    <span class="decision-popover-title">Output Strategy</span>
                    <span class="decision-popover-subtitle">
                      Set output format and optional target size.
                    </span>
                  </div>

                  <div class="decision-field">
                    <span class="decision-field-label">Output</span>
                    <select
                      v-model="outputMode"
                      class="decision-select decision-select-full"
                      @change="handleDecisionSettingsChange"
                    >
                      <option
                        v-for="option in outputOptions"
                        :key="option"
                        :value="option"
                      >
                        {{ formatOutputModeLabel(option) }}
                      </option>
                    </select>
                  </div>

                  <label class="decision-toggle decision-toggle-row">
                    <span class="decision-toggle-copy">
                      <span class="decision-field-label">Target Size</span>
                      <span class="decision-toggle-help">
                        Search for the best result under a size budget
                      </span>
                    </span>
                    <input
                      v-model="objectiveEnabled"
                      type="checkbox"
                      @change="handleDecisionSettingsChange"
                    />
                  </label>

                  <div v-if="objectiveEnabled" class="objective-row objective-row-stack">
                    <div class="decision-field">
                      <span class="decision-field-label">Target</span>
                      <div class="objective-input-wrapper">
                        <input
                          v-model.number="objectiveTargetKb"
                          type="number"
                          min="1"
                          step="10"
                          class="decision-input"
                          @change="handleDecisionSettingsChange"
                        />
                        <span class="objective-unit">KB</span>
                      </div>
                    </div>

                    <div class="decision-field">
                      <span class="decision-field-label">Goal</span>
                      <select
                        v-model="objectiveGoal"
                        class="decision-select decision-select-full"
                        @change="handleDecisionSettingsChange"
                      >
                        <option
                          v-for="goal in objectiveGoalOptions"
                          :key="goal"
                          :value="goal"
                        >
                          {{ formatObjectiveGoalLabel(goal) }}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
              </el-popover>
            </div>
          </div>
        </div>

        <div v-if="downloadableCount > 0" class="toolbar-divider" />

        <div
          v-if="downloadableCount > 0"
          class="toolbar-section download-section"
        >
          <button
            class="download-btn-new"
            :class="[{ downloading }]"
            :disabled="downloading"
            :title="downloadButtonLabel"
            @click="downloadAllImages"
          >
            <div class="download-btn-content">
              <div class="download-icon">
                <el-icon v-if="!downloading">
                  <Download />
                </el-icon>
                <el-icon v-else class="is-loading">
                  <Loading />
                </el-icon>
              </div>
              <span class="download-text">
                {{ downloading ? 'Downloading...' : downloadButtonLabel }}
              </span>
            </div>
          </button>
        </div>
      </div>

      <!-- 图片列表和预览区域 -->
      <section v-if="hasImages" class="images-section">
        <!-- 图片列表缩略图 -->
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
                :src="
                  item.replacedUrl || item.compressedUrl || item.originalUrl
                "
                :alt="item.file.name"
              />
              <div
                v-if="item.compressedUrl && !item.compressionError"
                class="crop-hover-btn"
                title="Crop image"
                @click.stop="openCropPage(item)"
              >
                ✂️
              </div>
              <!-- Restore button shown on hover when image was replaced by a conversion result -->
              <div
                v-if="item.replacedUrl"
                class="restore-hover-btn"
                title="Restore original upload"
                @click.stop="restoreReplacedImage(item)"
              >
                ↺
              </div>
              <div
                v-if="item.isCompressing || item.isUploading"
                :class="
                  item.processingUiMode === 'subtle'
                    ? 'processing-badge'
                    : 'compressing-overlay'
                "
              >
                <el-icon class="is-loading">
                  <Loading />
                </el-icon>
                <template v-if="item.processingUiMode === 'subtle'">
                  <span class="processing-badge-label">Updating</span>
                </template>
                <template v-else>
                  <button
                    class="cancel-btn"
                    @click.stop="cancelCompression(item)"
                  >
                    Cancel
                  </button>
                  <div class="overlay-label">
                    {{ getItemTaskLabel(item) }}
                  </div>
                </template>
              </div>
              <div v-if="item.compressionError" class="error-overlay">
                <span class="error-text">Error</span>
              </div>
            </div>
            <div class="image-info">
              <div class="image-header">
                <div class="image-name" :title="item.file.name">
                  {{ item.file.name }}
                </div>
                <div class="image-format" :class="{ 'svg-format': item.isSvg }">
                  {{
                    item.replacedMime
                      ? String(item.replacedMime).toUpperCase()
                      : item.isSvg
                        ? 'SVG'
                        : item.file.type.split('/')[1].toUpperCase()
                  }}
                </div>
              </div>

              <!-- Replaced details removed — keep hover restore button only -->

              <div class="image-stats">
                <!-- SVG files show simple size info -->
                <div v-if="item.isSvg" class="svg-info">
                  <div class="svg-size-info">
                    <span class="size-label">SVG File Size</span>
                    <span class="size-value">{{
                      formatFileSize(item.originalSize)
                    }}</span>
                  </div>
                  <div class="svg-conversion-hint">
                    Ready for format conversion
                  </div>

                  <!-- Additional SVG information to fill space -->
                  <div class="svg-description">
                    <div class="svg-feature">
                      <span class="feature-icon"></span>
                      <span class="feature-text"
                        >Quality control not supported</span
                      >
                    </div>
                  </div>
                </div>
                <!-- Regular images show compression results -->
                <div v-else class="compression-result">
                  <div class="size-comparison">
                    <div class="size-item">
                      <span class="size-label">Original</span>
                      <span class="size-value original">{{
                        formatFileSize(item.originalSize)
                      }}</span>
                    </div>
                    <div class="size-arrow">
                      <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                        <path
                          d="M1 4H11M11 4L8 1M11 4L8 7"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </div>
                    <div class="size-item">
                      <span class="size-label">Compressed</span>
                      <span class="size-value compressed">{{
                        formatFileSize(getEffectiveItemSize(item))
                      }}</span>
                    </div>
                  </div>
                  <div class="result-summary">
                    <span
                      class="ratio-badge"
                      :class="{
                        'ratio-negative':
                          getEffectiveCompressionRatio(item) < 0,
                      }"
                    >
                      {{ getEffectiveCompressionRatio(item) < 0 ? '+' : '-'
                      }}{{
                        Math.abs(getEffectiveCompressionRatio(item)).toFixed(1)
                      }}%
                    </span>
                    <span
                      v-if="hasDecisionFallback(item)"
                      class="decision-chip fallback-chip"
                    >
                      Fallback
                    </span>
                  </div>
                </div>
              </div>

              <!-- 独立的质量控制 - 仅对非SVG文件显示 -->
              <div v-if="!item.isSvg" class="image-quality-control">
                <div class="quality-header">
                  <div class="quality-info">
                    <span class="quality-label">Quality</span>
                    <span class="quality-value"
                      >{{ Math.round(item.qualityDragging * 100) }}%</span
                    >
                  </div>
                  <button
                    v-if="item.isQualityCustomized"
                    class="reset-quality-btn"
                    title="Reset to global quality"
                    @click.stop="resetImageQualityToGlobal(item)"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6C2 3.79 3.79 2 6 2C7.5 2 8.78 2.88 9.41 4.12M10 6C10 8.21 8.21 10 6 10C4.5 10 3.22 9.12 2.59 7.88M9.5 3.5L9.41 4.12L8.79 4.03"
                        stroke="currentColor"
                        stroke-width="1.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </div>
                <el-slider
                  :model-value="Math.round(item.qualityDragging * 100)"
                  :max="100"
                  :step="1"
                  :min="1"
                  class="image-quality-slider"
                  :show-tooltip="false"
                  size="small"
                  @input="(val: number) => handleImageQualityInput(item, val)"
                  @change="
                    (val: number) => handleImageQualitySliderChange(item, val)
                  "
                />
              </div>
            </div>
            <div class="image-actions">
              <button
                v-if="item.compressionError"
                class="action-btn-small retry-single"
                title="Retry compression"
                @click.stop="compressImage(item)"
              >
                ↻
              </button>
              <button
                v-if="getEffectiveItemUrl(item) && !item.compressionError"
                class="action-btn-small download-single"
                title="Download this image"
                @click.stop="downloadImage(item)"
              >
                <el-icon>
                  <Download />
                </el-icon>
              </button>
              <button
                v-if="getEffectiveItemUrl(item) && !item.compressionError"
                class="action-btn-small compare-single"
                title="Compare tools on this image"
                @click.stop="openComparePanel(item)"
              >
                ⚖️
              </button>
              <button
                v-if="getEffectiveItemUrl(item) && !item.compressionError"
                class="action-btn-small crop-single"
                title="Crop this image"
                @click.stop="openCropPage(item)"
              >
                ✂️
              </button>
              <button
                v-if="getEffectiveItemUrl(item) && !item.compressionError"
                class="action-btn-small convert-single"
                title="Convert image format"
                @click.stop="openFormatSelectDialog(item)"
              >
                🔄
              </button>
              <button
                class="action-btn-small delete-single"
                title="Remove this image"
                @click.stop="deleteImage(index)"
              >
                <el-icon>
                  <CloseBold />
                </el-icon>
              </button>
            </div>
          </div>
        </div>

        <!-- 全屏图片对比预览 -->
        <div
          v-if="currentImage"
          class="fullscreen-comparison"
          :class="{ 'fullscreen-mode': isFullscreen }"
        >
          <div
            class="comparison-container-fullscreen"
            :style="{
              cursor: imageZoom > 1 ? 'move' : 'default',
            }"
            @wheel="handleWheel"
            @mousedown="handleImageMouseDown"
          >
            <!-- 调试信息 -->
            <div
              v-if="!currentImage.originalUrl || !currentImage.compressedUrl"
              class="debug-info"
            >
              <p>调试信息:</p>
              <p>
                originalUrl:
                {{ currentImage.originalUrl ? '已加载' : '未加载' }}
              </p>
              <p>
                compressedUrl:
                {{ currentImage.compressedUrl ? '已加载' : '未加载' }}
              </p>
              <p>
                originalSize: {{ formatFileSize(currentImage.originalSize) }}
              </p>
              <p>
                compressedSize:
                {{
                  getEffectiveItemUrl(currentImage)
                    ? formatFileSize(getEffectiveItemSize(currentImage))
                    : '未压缩'
                }}
              </p>
              <p>isCompressing: {{ currentImage.isCompressing }}</p>
              <p>
                compressionError:
                {{ currentImage.compressionError || '无错误' }}
              </p>
            </div>

            <!-- 主要的图片对比组件 -->
            <img-comparison-slider
              v-if="
                currentImage.originalUrl && getEffectiveItemUrl(currentImage)
              "
              class="comparison-slider-fullscreen"
              value="50"
            >
              <!-- eslint-disable -->
              <img
                slot="first"
                :src="currentImage.originalUrl"
                alt="Original Image"
                class="comparison-image-fullscreen"
                :style="{
                  transform: `translate(${imageTransform.x}px, ${imageTransform.y}px) scale(${imageZoom})`,
                  transformOrigin: 'center center',
                }"
                loading="eager"
                decoding="sync"
                @load="handleImageLoad('original')"
                @error="console.error('原图加载失败')"
              />
              <img
                slot="second"
                :src="getEffectiveItemUrl(currentImage)"
                alt="Compressed Image"
                class="comparison-image-fullscreen"
                :style="{
                  transform: `translate(${imageTransform.x}px, ${imageTransform.y}px) scale(${imageZoom})`,
                  transformOrigin: 'center center',
                }"
                loading="eager"
                decoding="sync"
                @load="handleImageLoad('compressed')"
                @error="console.error('压缩图加载失败')"
              />
              <!-- eslint-enable -->
            </img-comparison-slider>

            <!-- 仅显示原图（压缩中或出错时） -->
            <div
              v-else-if="currentImage.originalUrl"
              class="single-image-preview"
            >
              <img
                :src="currentImage.originalUrl"
                :alt="currentImage.file.name"
                class="single-image"
                :style="{
                  transform: `translate(${imageTransform.x}px, ${imageTransform.y}px) scale(${imageZoom})`,
                  transformOrigin: 'center center',
                }"
                @load="handleImageLoad('original')"
              />
              <div v-if="currentImage.isCompressing" class="preview-overlay">
                <el-icon class="is-loading" size="30px">
                  <Loading />
                </el-icon>
                <div class="overlay-text">
                  {{ getItemTaskLabel(currentImage) }}
                </div>
              </div>
              <div
                v-if="currentImage.compressionError"
                class="preview-overlay error"
              >
                <div class="overlay-text">Compression Error</div>
                <div class="overlay-subtext">
                  {{ currentImage.compressionError }}
                </div>
              </div>
            </div>

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
                  {{ currentImage.file.name }}
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
                    :title="isFullscreen ? '退出全屏 (Esc)' : '全屏 (Ctrl+F)'"
                    @click="toggleFullscreen"
                  >
                    <el-icon>
                      <FullScreen />
                    </el-icon>
                  </el-button>
                </div>
              </div>
              <div class="image-details">
                <span
                  >{{ currentImageIndex + 1 }} / {{ imageItems.length }}</span
                >
                <span
                  >Quality: {{ Math.round(currentImage.quality * 100) }}%</span
                >
                <span>{{ formatFileSize(currentImage.originalSize) }}</span>
                <span v-if="getEffectiveItemUrl(currentImage)">
                  → {{ formatFileSize(getEffectiveItemSize(currentImage)) }}
                </span>
                <span v-if="currentImage.bestTool">
                  Tool: {{ currentImage.bestTool }}
                </span>
                <span v-if="currentImage.outputDecision">
                  Output:
                  {{
                    formatDecisionOutput(currentImage.outputDecision.selected)
                  }}
                </span>
                <span v-if="currentImage.objectiveDecision">
                  Target: ≤
                  {{
                    formatFileSize(currentImage.objectiveDecision.targetBytes)
                  }}
                  ·
                  {{
                    formatObjectiveGoalLabel(
                      currentImage.objectiveDecision.goal,
                    )
                  }}
                </span>
                <span v-if="currentImage.compressionDuration">
                  {{ Math.round(currentImage.compressionDuration) }}ms
                </span>
                <span
                  v-if="getEffectiveItemUrl(currentImage)"
                  class="savings"
                  :class="{
                    'savings-negative':
                      getEffectiveCompressionRatio(currentImage) < 0,
                  }"
                >
                  ({{
                    getEffectiveCompressionRatio(currentImage) < 0 ? '+' : '-'
                  }}{{
                    Math.abs(
                      getEffectiveCompressionRatio(currentImage),
                    ).toFixed(1)
                  }}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <input
      id="file"
      ref="fileRef"
      type="file"
      accept="image/png,image/jpg,image/jpeg,image/gif,image/webp,image/svg+xml,.svg"
      multiple
      hidden
      @change="handleFileInputChange"
    />

    <!-- 设置面板 -->
    <el-dialog
      v-model="showSettingsPanel"
      title="Settings"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="settings-content">
        <div class="settings-section">
          <h3 class="settings-title">
            <el-icon>
              <Key />
            </el-icon>
            Tool Configurations
          </h3>
          <p class="settings-description">
            Configure API keys and settings for different compression tools.
          </p>

          <div class="tool-config-list">
            <div
              v-for="(config, index) in tempToolConfigs"
              :key="index"
              class="tool-config-item"
            >
              <div class="tool-header">
                <div class="tool-info">
                  <el-icon class="tool-icon">
                    <Picture />
                  </el-icon>
                  <span class="tool-name">{{ config.name.toUpperCase() }}</span>
                  <el-tag
                    :type="
                      config.enabled && isToolConfigConfigured(config)
                        ? 'success'
                        : 'info'
                    "
                    size="small"
                  >
                    {{
                      config.enabled && isToolConfigConfigured(config)
                        ? 'Enabled'
                        : 'Disabled'
                    }}
                  </el-tag>
                </div>
                <div class="tool-actions">
                  <el-switch
                    v-model="config.enabled"
                    :disabled="!isToolConfigConfigured(config)"
                  />
                  <el-button
                    v-if="tempToolConfigs.length > 1"
                    type="danger"
                    size="small"
                    :icon="Delete"
                    circle
                    @click="removeToolConfig(index)"
                  />
                </div>
              </div>

              <div class="tool-config">
                <el-form-item label="Tool">
                  <el-select v-model="config.name" placeholder="Select a tool">
                    <el-option
                      v-for="tool in availableTools"
                      :key="tool"
                      :label="tool.toUpperCase()"
                      :value="tool"
                    />
                  </el-select>
                </el-form-item>

                <el-form-item v-if="config.name === 'tinypng'" label="API Key">
                  <el-input
                    v-model="config.key"
                    type="password"
                    placeholder="Enter your API key"
                    show-password
                    clearable
                  >
                    <template #prepend>
                      <el-icon>
                        <Key />
                      </el-icon>
                    </template>
                  </el-input>
                </el-form-item>

                <el-form-item
                  v-if="config.name === 'browser-image-compression'"
                  label="Library URL"
                >
                  <el-input
                    v-model="config.libURL"
                    placeholder="Enter a self-hosted browser-image-compression URL"
                    clearable
                  />
                </el-form-item>

                <div v-if="config.name === 'tinypng'" class="tool-help">
                  <p class="help-text">
                    <strong>TinyPNG API Key:</strong>
                    Get your free API key from
                    <a
                      href="https://tinypng.com/developers"
                      target="_blank"
                      class="help-link"
                    >
                      TinyPNG Developer Portal
                    </a>
                  </p>
                  <p class="help-note">
                    💡 Free tier: 500 compressions per month
                  </p>
                </div>

                <div
                  v-if="config.name === 'browser-image-compression'"
                  class="tool-help"
                >
                  <p class="help-text">
                    <strong>Library URL:</strong>
                    Use a self-hosted
                    <code>browser-image-compression.js</code>
                    file for offline or air-gapped environments.
                  </p>
                  <p class="help-note">
                    Example:
                    <code>/vendor/browser-image-compression.js</code>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="canAddToolConfig" class="add-tool-section">
            <el-button type="primary" :icon="Plus" @click="addToolConfig">
              Add Tool Configuration
            </el-button>
          </div>
        </div>

        <div class="settings-section">
          <h3 class="settings-title">
            <el-icon>
              <Setting />
            </el-icon>
            Usage Information
          </h3>
          <div class="usage-info">
            <p>
              • <strong>TinyPNG:</strong> Online service with excellent
              compression for PNG, JPEG, and WebP files
            </p>
            <p>
              • <strong>Browser Image Compression:</strong> Optional self-hosted
              worker script URL for offline or internal deployments
            </p>
            <p>
              • When enabled, configured tools will be included in the
              compression process
            </p>
            <p>
              • Settings are automatically saved to your browser's local storage
            </p>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="closeSettingsPanel"> Cancel </el-button>
          <el-button type="primary" @click="saveSettings"> Save </el-button>
        </div>
      </template>
    </el-dialog>
    <CropPage
      v-if="showCropPage"
      :original-url="cropOriginalUrl"
      :compressed-url="cropCompressedUrl"
      :original-name="currentImage?.file.name"
      :compressed-name="currentImage?.file.name"
      :original-size="currentImage?.originalSize"
      :compressed-size="
        currentImage ? getEffectiveItemSize(currentImage) : undefined
      "
      :parentScrollTop="cropPageParentScrollTop"
      @close="closeCropPage"
      @apply="applyCropPreprocess"
    />

    <!-- 多工具结果对比面板 -->
    <el-dialog
      v-model="showComparePanel"
      :title="`Compare Tools • ${compareTargetName}`"
      width="720px"
      :close-on-click-modal="false"
      :lock-scroll="true"
      append-to-body
      modal-class="compare-modal"
      align-center
      class="compare-dialog"
      @close="closeComparePanel"
    >
      <div class="compare-panel">
        <div v-if="compareLoading" class="compare-loading">
          <div class="loading-content">
            <el-icon class="is-loading" size="32px">
              <Loading />
            </el-icon>
            <div class="loading-text">Comparing compression tools...</div>
            <div class="loading-subtitle">This may take a few seconds</div>
          </div>
        </div>

        <template v-else>
          <div class="compare-summary">
            <div class="summary-header">
              <div class="summary-title">
                <span class="file-icon">🧠</span>
                <div class="summary-title-content">
                  <div class="file-name">{{ compareTargetName }}</div>
                  <div class="summary-subtitle">
                    Decision inspector for the current output and target rules
                  </div>
                </div>
              </div>
              <div class="summary-best">
                <span class="best-label">Winner</span>
                <span class="best-tool">{{
                  compareBestTool || 'original'
                }}</span>
              </div>
            </div>

            <div class="summary-metrics">
              <span class="metric">
                Requested · {{ formatOutputModeLabel(outputMode) }}
              </span>
              <span v-if="compareOutputDecision" class="metric">
                Final ·
                {{ formatDecisionOutput(compareOutputDecision.selected) }}
              </span>
              <span v-if="compareObjectiveDecision" class="metric">
                Target · ≤
                {{ formatFileSize(compareObjectiveDecision.targetBytes) }}
              </span>
              <span v-if="compareObjectiveDecision" class="metric">
                Goal ·
                {{ formatObjectiveGoalLabel(compareObjectiveDecision.goal) }}
              </span>
              <span v-if="compareObjectiveDecision" class="metric">
                Quality ·
                {{
                  Math.round(compareObjectiveDecision.selectedQuality * 100)
                }}%
              </span>
              <span class="metric time">
                {{ Math.round(compareTotalDuration) }}ms
              </span>
            </div>

            <div
              v-if="
                compareOutputDecision ||
                compareObjectiveDecision ||
                compareRejectedReasons.length
              "
              class="decision-summary compare-decision-summary"
            >
              <span
                v-if="compareOutputDecision"
                class="decision-chip output-chip"
              >
                Output ·
                {{ formatDecisionOutput(compareOutputDecision.selected) }}
              </span>
              <span
                v-if="compareObjectiveDecision"
                class="decision-chip objective-chip"
              >
                {{ compareObjectiveDecision.candidatesEvaluated }} candidates
              </span>
              <span
                v-if="
                  compareOutputDecision?.usedFallback ||
                  compareObjectiveDecision?.usedFallback
                "
                class="decision-chip fallback-chip"
              >
                Fallback
              </span>
            </div>

            <div
              v-if="compareFinalResult || compareRejectedReasons.length"
              class="summary-footer"
            >
              <div v-if="compareRejectedReasons.length" class="summary-reasons">
                <span class="summary-reasons-label">Rejected</span>
                <span
                  v-for="reason in compareRejectedReasons"
                  :key="reason"
                  class="reason-pill"
                >
                  {{ reason }}
                </span>
              </div>

              <div class="summary-actions">
                <button
                  v-if="compareFinalResult"
                  class="custom-btn use-btn"
                  @click="applyCompareFinalDecision"
                >
                  <span class="btn-icon">✨</span>
                  <span class="btn-text">Use final decision</span>
                </button>
              </div>
            </div>
          </div>

          <div class="compare-list">
            <div
              v-for="r in compareResults"
              :key="r.tool"
              class="compare-item"
              :class="{
                best: r.tool === compareBestTool,
                fail: !r.success,
              }"
            >
              <div class="compare-head">
                <div class="tool-name">
                  <span class="badge">{{ r.tool }}</span>
                  <el-tag
                    v-if="r.tool === compareBestTool && r.success"
                    type="success"
                    size="small"
                    effect="dark"
                  >
                    Best
                  </el-tag>
                  <el-tag
                    v-else-if="!r.success"
                    type="danger"
                    size="small"
                    effect="plain"
                  >
                    Failed
                  </el-tag>
                </div>
                <div class="metrics">
                  <span class="metric">
                    {{ formatFileSize(r.compressedSize) }}
                  </span>
                  <span
                    class="metric ratio"
                    :class="{ neg: r.compressionRatio < 0 }"
                  >
                    {{ r.compressionRatio < 0 ? '+' : '-'
                    }}{{ Math.abs(r.compressionRatio).toFixed(1) }}%
                  </span>
                  <span class="metric time">{{ r.duration }}ms</span>
                </div>
              </div>

              <div class="compare-body">
                <div v-if="r.success && r.url" class="preview">
                  <img :src="r.url" alt="preview" />
                </div>
                <div v-else class="error-msg">
                  {{ r.error || 'Failed' }}
                </div>
              </div>

              <div class="compare-actions">
                <button
                  v-if="r.success && r.url"
                  class="custom-btn use-btn"
                  @click="applyCompareResult(r)"
                >
                  <span class="btn-icon">👆</span>
                  <span class="btn-text">Use this result</span>
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="closeComparePanel"> Close </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Format Conversion Component -->
    <FormatConversion
      ref="formatConversionRef"
      :tool-configs="toolConfigs"
      :preserve-exif="preserveExif"
      @apply-conversion="(p) => applyConversionToItem(p)"
    />
  </div>
</template>

<style scoped>
.app-container {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
  overflow-x: hidden;
  height: 100%;
  /* 优化滚动性能 */
  -webkit-overflow-scrolling: touch;
  /* 减少重绘 */
  transform: translateZ(0);
  will-change: scroll-position;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
}

.app-container.drag-over {
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
  margin: 0 auto;
}

.drag-icon {
  font-size: 64px;
  opacity: 0.9;
  display: block;
}

.drag-text {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
}

.drag-subtitle {
  font-size: 14px;
  opacity: 0.7;
  font-weight: 400;
  line-height: 1.6;
  margin: 0;
  text-align: center;
  max-width: 320px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* Background Decoration */
.bg-decoration {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  background: linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.1),
    rgba(255, 255, 255, 0.05)
  );
  animation: float 6s ease-in-out infinite;
}

.bg-circle-1 {
  width: 300px;
  height: 300px;
  top: 10%;
  left: -5%;
  animation-delay: 0s;
}

.bg-circle-2 {
  width: 200px;
  height: 200px;
  top: 60%;
  right: -5%;
  animation-delay: 2s;
}

.bg-circle-3 {
  width: 150px;
  height: 150px;
  top: 80%;
  left: 20%;
  animation-delay: 4s;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0px) rotate(0deg);
  }

  33% {
    transform: translateY(-20px) rotate(120deg);
  }

  66% {
    transform: translateY(10px) rotate(240deg);
  }
}

/* Loading Overlay */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: linear-gradient(
    135deg,
    rgba(102, 126, 234, 0.95),
    rgba(118, 75, 162, 0.95)
  );
  backdrop-filter: blur(10px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  /* 确保覆盖层不受页面内容影响 */
  box-sizing: border-box;
  overflow: hidden;
  /* 防止滚动和交互 */
  touch-action: none;
  -webkit-overflow-scrolling: touch;
  /* 确保在最顶层，完全覆盖 */
  pointer-events: auto;
  /* 强制使用视口单位，不受内容影响 */
  min-width: 100vw;
  min-height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  /* 确保定位不受影响 */
  margin: 0;
  padding: 0;
  border: none;
  /* 防止任何变换影响 */
  transform: none;
  will-change: auto;
}

/* Compare Tools dialog overlay adjustments
   Keep Element Plus default flex centering; only offset from top by saved scroll.
   Use :global because overlay is teleported to body. */
:global(.compare-modal .el-overlay-dialog) {
  padding-top: 0px;
}

/* Compare Tools dialog styling improvements */
:global(.compare-modal .el-dialog) {
  border-radius: 20px;
  overflow: hidden;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid rgba(102, 126, 234, 0.2);
  box-shadow: 0 25px 80px rgba(102, 126, 234, 0.2);
  backdrop-filter: blur(20px);
}

:global(.compare-modal .el-dialog__header) {
  padding: 20px 24px 16px;
  background: linear-gradient(
    135deg,
    rgba(102, 126, 234, 0.1),
    rgba(118, 75, 162, 0.1)
  );
  border-bottom: 1px solid rgba(102, 126, 234, 0.15);
  position: relative;
}

:global(.compare-modal .el-dialog__header::before) {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #667eea, #764ba2);
}

:global(.compare-modal .el-dialog__title) {
  font-weight: 700;
  font-size: 18px;
  background: linear-gradient(45deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  display: flex;
  align-items: center;
  gap: 8px;
}

:global(.compare-modal .el-dialog__title::before) {
  content: '⚖️';
  font-size: 20px;
  filter: none;
  -webkit-text-fill-color: initial;
}

:global(.compare-modal .el-dialog__body) {
  padding: 20px 24px;
  background: transparent;
}

:global(.compare-modal .el-dialog__footer) {
  padding: 16px 24px 20px;
  background: linear-gradient(
    135deg,
    rgba(248, 250, 252, 0.8),
    rgba(241, 245, 249, 0.8)
  );
  border-top: 1px solid rgba(102, 126, 234, 0.1);
}

/* Compare Tools responsive design */
@media (max-width: 1024px) {
  :global(.compare-modal .el-dialog) {
    margin: 20px;
    width: calc(100vw - 40px) !important;
    max-width: none !important;
  }

  :global(.compare-modal .el-dialog__header),
  :global(.compare-modal .el-dialog__body),
  :global(.compare-modal .el-dialog__footer) {
    padding-left: 16px;
    padding-right: 16px;
  }

  .compare-list {
    grid-template-columns: 1fr !important;
    gap: 12px;
  }

  .file-name {
    max-width: 150px;
  }

  .summary-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .metrics {
    display: flex;
    gap: 6px;
    white-space: nowrap;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .metric {
    font-size: 10px;
    padding: 3px 8px;
  }
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

.loading-progress {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 400;
  opacity: 0.9;
  color: rgba(255, 255, 255, 0.8);
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
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

/* Settings Section */
.settings-section-main {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 0 20px 30px;
}

.settings-container {
  max-width: 600px;
  margin: 0 auto;
}

.settings-btn-main {
  font-size: 16px !important;
  font-weight: 500 !important;
  padding: 12px 24px !important;
  border-radius: 12px !important;
  background: rgba(255, 255, 255, 0.1) !important;
  border: 1px solid rgba(255, 255, 255, 0.3) !important;
  color: rgba(255, 255, 255, 0.95) !important;
  transition: all 0.3s ease !important;
  backdrop-filter: blur(10px) !important;
}

.settings-btn-main:hover {
  background: rgba(255, 255, 255, 0.2) !important;
  border-color: rgba(255, 255, 255, 0.5) !important;
  transform: translateY(-2px);
  color: white !important;
}

.settings-hint {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  margin: 12px 0 0 0;
  font-weight: 300;
}

/* 英雄上传区域 */
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

/* 悬浮工具栏 */
.floating-toolbar {
  margin: auto;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.08);
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
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(0, 0, 0, 0.1),
    transparent
  );
  margin: 0 6px;
}

/* 图片列表和预览区域 */
.images-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 20px;
  overflow: visible;
}

/* 文件信息区域 */
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

.compressed-count {
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
  position: relative;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.action-btn::before {
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
  transition: left 0.5s;
}

.action-btn:hover::before {
  left: 100%;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #374151;
  transition: transform 0.2s ease;
}

.btn-text {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
}

.add-btn {
  border-color: rgba(59, 130, 246, 0.2);
}

.add-btn:hover {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  border-color: rgba(59, 130, 246, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
}

.add-btn:hover .btn-icon {
  transform: scale(1.1);
  color: #2563eb;
}

.add-btn:hover .btn-text {
  color: #2563eb;
}

.retry-btn {
  border-color: rgba(37, 99, 235, 0.2);
}

.retry-btn:hover {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  border-color: rgba(37, 99, 235, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
}

.retry-btn:hover .btn-icon {
  transform: scale(1.1);
  color: #1d4ed8;
}

.retry-btn:hover .btn-text {
  color: #1d4ed8;
}

.delete-btn {
  border-color: rgba(239, 68, 68, 0.2);
}

.delete-btn:hover {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  border-color: rgba(239, 68, 68, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);
}

.delete-btn:hover .btn-icon {
  transform: scale(1.1);
  color: #dc2626;
}

.delete-btn:hover .btn-text {
  color: #dc2626;
}

.action-btn:active {
  transform: translateY(0px) scale(0.98);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

/* 质量控制区域 */
.quality-section {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 100px;
}

.quality-label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.quality-value {
  font-size: 14px;
  color: #374151;
  font-weight: 700;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.quality-slider-wrapper {
  width: 90px;
}

.mini-slider {
  --el-slider-height: 5px;
  --el-slider-button-size: 16px;
  --el-slider-main-bg-color: linear-gradient(135deg, #4f46e5, #7c3aed);
  --el-slider-runway-bg-color: rgba(0, 0, 0, 0.1);
}

/* 确保 mini-slider 滑轨可点击 */
.mini-slider :deep(.el-slider__runway) {
  height: 8px;
  /* 增加点击区域高度 */
  cursor: pointer;
  position: relative;
  z-index: 1;
}

/* 确保整个 mini-slider 容器都可交互 */
.mini-slider :deep(.el-slider) {
  position: relative;
  z-index: 1;
  padding: 10px 0;
  /* 增加上下padding，扩大点击区域 */
}

/* 工具栏滑块按钮样式 */
.mini-slider :deep(.el-slider__button) {
  background: #4f46e5;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25);
  cursor: pointer;
  z-index: 2;
}

.mini-slider :deep(.el-slider__button:hover) {
  background: #6366f1;
  border-color: #ffffff;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);
  transform: scale(1.1);
}

/* 确保 mini-slider 按钮包装器也有足够的点击区域 */
.mini-slider :deep(.el-slider__button-wrapper) {
  cursor: pointer;
  z-index: 2;
}

/* 统计信息区域 */
.stats-section {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.stats-info {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 45px;
  min-width: 230px;
  /* 防止数字变化时工具栏抖动 */
}

.size-label {
  font-size: 11px;
  color: #374151;
  font-weight: 500;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

.saved-mini {
  font-size: 11px;
  color: #16a34a;
  font-weight: 700;
  background: linear-gradient(
    135deg,
    rgba(34, 197, 94, 0.1),
    rgba(34, 197, 94, 0.2)
  );
  padding: 4px 8px;
  border-radius: 12px;
  border: 1px solid rgba(34, 197, 94, 0.2);
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  box-shadow: 0 2px 4px rgba(34, 197, 94, 0.1);
  transition: all 0.2s ease;
}

.saved-mini.saved-negative {
  color: #dc2626;
  background: linear-gradient(
    135deg,
    rgba(220, 38, 38, 0.1),
    rgba(220, 38, 38, 0.2)
  );
  border: 1px solid rgba(220, 38, 38, 0.2);
  box-shadow: 0 2px 4px rgba(220, 38, 38, 0.1);
}

.stats-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stats-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  border: 1px solid transparent;
}

.working-pill {
  color: #4338ca;
  background: rgba(99, 102, 241, 0.12);
  border-color: rgba(99, 102, 241, 0.18);
}

.failed-pill {
  color: #b91c1c;
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.18);
}

.ready-pill {
  color: #047857;
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.18);
}

/* 选项区域 */
.options-section {
  justify-content: center;
  align-items: flex-start;
  min-width: 360px;
  flex-wrap: wrap;
  gap: 16px;
}

.exif-option {
  display: flex;
  align-items: center;
  height: 45px;
}

.exif-label {
  font-size: 12px;
  color: #374151;
  font-weight: 500;
  margin-left: 6px;
}

.quality-control {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 20px;
  min-width: 180px;
}

.decision-control {
  display: flex;
  min-width: 220px;
}

.decision-toolbar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.decision-summary-inline {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.decision-header-global {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.decision-label-global {
  font-size: 11px;
  color: #4b5563;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.decision-summary-main {
  font-size: 14px;
  color: #111827;
  font-weight: 700;
  line-height: 1.1;
}

.decision-summary-detail {
  min-width: 0;
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.decision-trigger {
  border: 1px solid rgba(79, 70, 229, 0.18);
  background: linear-gradient(135deg, #eef2ff 0%, #ede9fe 100%);
  color: #4338ca;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.decision-trigger:hover {
  transform: translateY(-1px);
  border-color: rgba(79, 70, 229, 0.28);
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.12);
}

.decision-mode-pill {
  font-size: 10px;
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.1);
  border: 1px solid rgba(124, 58, 237, 0.15);
  border-radius: 999px;
  padding: 3px 8px;
  font-weight: 700;
}

.decision-row,
.objective-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.decision-select,
.decision-input {
  appearance: none;
  box-sizing: border-box;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.92);
  color: #1f2937;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.decision-select {
  min-width: 108px;
}

.decision-select-compact {
  min-width: 120px;
}

.decision-select:focus,
.decision-input:focus {
  outline: none;
  border-color: rgba(79, 70, 229, 0.45);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
}

.decision-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  user-select: none;
}

.decision-toggle input {
  accent-color: #4f46e5;
}

.decision-toggle-row {
  box-sizing: border-box;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.8);
}

.decision-toggle-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.decision-toggle-help {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
  line-height: 1.25;
}

.decision-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.decision-field-label {
  font-size: 11px;
  color: #4b5563;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.objective-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
}

.decision-input {
  width: 100%;
  padding-right: 34px;
}

.objective-unit {
  position: absolute;
  right: 10px;
  font-size: 11px;
  color: #6b7280;
  font-weight: 700;
  pointer-events: none;
}

.decision-select-full {
  width: 100%;
}

.objective-row-stack {
  flex-direction: column;
  align-items: stretch;
}

.decision-popover-content {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.decision-popover-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.decision-popover-title {
  font-size: 14px;
  color: #111827;
  font-weight: 700;
  line-height: 1.2;
}

.decision-popover-subtitle {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
  line-height: 1.3;
}

:deep(.decision-popover-panel) {
  max-width: calc(100vw - 24px);
  padding: 0 !important;
  border-radius: 16px !important;
  border: 1px solid rgba(148, 163, 184, 0.18) !important;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.18) !important;
}

.global-quality-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.quality-info-global {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.quality-label-global {
  font-size: 11px;
  color: #4b5563;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.quality-value-global {
  font-size: 13px;
  color: #1f2937;
  font-weight: 700;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  min-width: 35px;
  text-align: right;
}

.quality-indicator {
  flex: 1;
  max-width: 80px;
}

.quality-bar-bg {
  height: 6px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.quality-bar-fill {
  height: 100%;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  border-radius: 3px;
  transition: width 0.3s ease;
  position: relative;
}

.quality-bar-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.3) 50%,
    transparent 100%
  );
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(100%);
  }
}

/* 全局质量滑块样式 */
.global-quality-slider {
  --el-slider-height: 8px;
  --el-slider-button-size: 16px;
  --el-slider-main-bg-color: linear-gradient(135deg, #4f46e5, #7c3aed);
  --el-slider-runway-bg-color: rgba(0, 0, 0, 0.08);
  width: 100%;
}

.global-quality-slider :deep(.el-slider__runway) {
  height: 8px;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
}

.global-quality-slider :deep(.el-slider__bar) {
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);
}

.global-quality-slider :deep(.el-slider__button) {
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  border: 3px solid #ffffff;
  box-shadow: 0 3px 12px rgba(79, 70, 229, 0.4);
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 2;
}

.global-quality-slider :deep(.el-slider__button:hover) {
  background: linear-gradient(135deg, #6366f1, #7c3aed);
  border-color: #ffffff;
  box-shadow: 0 4px 16px rgba(79, 70, 229, 0.5);
  transform: scale(1.2);
}

.global-quality-slider :deep(.el-slider__button:active) {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.6);
}

.global-quality-slider :deep(.el-slider) {
  padding: 10px 0;
}

/* 单个图片质量控制 */
.image-quality-control {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
}

.quality-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  gap: 4px;
  min-height: 14px;
}

.image-quality-slider .el-slider__button {
  width: 12px;
  height: 12px;
}

/* 下载按钮区域 */
.download-section {
  justify-content: center;
}

.download-btn-new {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  color: white;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.25);
}

.download-btn-new::before {
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
  transition: left 0.6s;
}

.download-btn-new:hover::before {
  left: 100%;
}

.download-btn-new:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(16, 185, 129, 0.35);
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
}

.download-btn-new:active {
  transform: translateY(0px) scale(0.98);
}

.download-btn-new.downloading {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
  cursor: not-allowed;
  transform: none;
  box-shadow: 0 2px 8px rgba(107, 114, 128, 0.2);
}

.download-btn-new.downloading:hover {
  transform: none;
  box-shadow: 0 2px 8px rgba(107, 114, 128, 0.2);
}

.download-btn-content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.download-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.download-text {
  font-size: 13px;
  font-weight: 600;
}

/* 对比面板 */
.compare-panel {
  min-height: 200px;
}

/* 对比摘要区域 */
.compare-summary {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.9),
    rgba(248, 250, 252, 0.9)
  );
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 20px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.1);
}

.summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.summary-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.summary-title-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-subtitle {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.file-icon {
  font-size: 20px;
  opacity: 0.8;
}

.file-name {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  background: linear-gradient(45deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary-best {
  display: flex;
  align-items: center;
  gap: 8px;
}

.best-label {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.best-tool {
  font-size: 14px;
  font-weight: 700;
  color: #047857;
  background: rgba(16, 185, 129, 0.12);
  padding: 4px 12px;
  border-radius: 12px;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.best-metrics {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  font-size: 12px;
  color: #374151;
  white-space: nowrap;
}

.best-metrics .ratio {
  color: #059669;
  font-weight: 600;
}

.best-metrics .ratio.neg {
  color: #dc2626;
}

.summary-actions {
  display: flex;
  align-items: center;
}

.summary-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.compare-decision-summary {
  justify-content: flex-start;
  margin-bottom: 12px;
}

.summary-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.summary-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  flex: 1;
}

.summary-reasons-label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.reason-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 10px;
  font-weight: 700;
  color: #92400e;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.16);
}

/* 加载状态 */
.compare-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.05),
    rgba(248, 250, 252, 0.05)
  );
  border-radius: 16px;
  border: 1px solid rgba(102, 126, 234, 0.1);
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #667eea;
}

.loading-text {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
}

.loading-subtitle {
  font-size: 14px;
  color: #6b7280;
  opacity: 0.8;
}

.compare-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.compare-item {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.95),
    rgba(248, 250, 252, 0.95)
  );
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  padding: 16px;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.compare-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(102, 126, 234, 0.1),
    transparent
  );
  transition: left 0.6s;
}

.compare-item:hover::before {
  left: 100%;
}

.compare-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(102, 126, 234, 0.15);
  border-color: rgba(102, 126, 234, 0.3);
}

.compare-item.best {
  border-color: rgba(16, 185, 129, 0.4);
  box-shadow: 0 8px 32px rgba(16, 185, 129, 0.2);
  background: linear-gradient(
    135deg,
    rgba(16, 185, 129, 0.05),
    rgba(5, 150, 105, 0.05)
  );
}

.compare-item.best:hover {
  box-shadow: 0 16px 48px rgba(16, 185, 129, 0.25);
}

.compare-item.fail {
  opacity: 0.7;
  border-color: rgba(239, 68, 68, 0.3);
  background: linear-gradient(
    135deg,
    rgba(239, 68, 68, 0.03),
    rgba(220, 38, 38, 0.03)
  );
}

.compare-head {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 12px;
  position: relative;
  z-index: 1;
}

.tool-name {
  display: flex;
  gap: 10px;
  align-items: center;
}

.tool-name .badge {
  font-weight: 700;
  font-size: 14px;
  color: #111827;
  background: linear-gradient(45deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metrics {
  display: flex;
  gap: 8px;
  align-items: center;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.metric {
  font-size: 11px;
  color: #374151;
  background: rgba(255, 255, 255, 0.7);
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  font-weight: 600;
  backdrop-filter: blur(5px);
  transition: all 0.2s ease;
}

.metric:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.metric.ratio {
  color: #059669;
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.3);
}

.metric.ratio.neg {
  color: #dc2626;
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
}

.metric.time {
  color: #6366f1;
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
}

.compare-body {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 140px;
  background: linear-gradient(
    135deg,
    rgba(248, 250, 252, 0.8),
    rgba(241, 245, 249, 0.8)
  );
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 12px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(5px);
  position: relative;
  z-index: 1;
}

.compare-body .preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 8px;
}

.compare-body img {
  max-width: 100%;
  max-height: 120px;
  display: block;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
}

.compare-body img:hover {
  transform: scale(1.05);
}

.compare-body .error-msg {
  color: #dc2626;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  padding: 20px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.compare-actions {
  text-align: center;
  position: relative;
  z-index: 1;
}

/* Custom button styles */
.custom-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 12px;
  padding: 10px 18px;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
  position: relative;
  overflow: hidden;
  text-decoration: none;
  font-family: inherit;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.custom-btn::before {
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

.custom-btn:hover::before {
  left: 100%;
}

.custom-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
  background: linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%);
}

.custom-btn:active {
  transform: translateY(0px) scale(0.98);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
}

.custom-btn .btn-icon {
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
}

.custom-btn:hover .btn-icon {
  transform: scale(1.1) rotate(5deg);
}

.custom-btn .btn-text {
  font-weight: 600;
  letter-spacing: 0.3px;
}

/* Best result button special styling */
.best-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
}

.best-btn:hover {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
}

.best-btn:active {
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.5);
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

/* 全屏图片对比区域 */
.fullscreen-comparison {
  flex: 1;
  display: flex;
  justify-content: center;
  overflow: visible;
}

.comparison-container-fullscreen {
  width: 100%;
  min-height: 450px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  position: relative;
}

.comparison-slider-fullscreen {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  --divider-width: 3px;
  --divider-color: rgba(255, 255, 255, 0.8);
  --default-handle-width: 48px;
  --default-handle-color: rgba(255, 255, 255, 0.9);
}

.comparison-image-fullscreen {
  width: 100%;
  display: block;
  height: 450px;
  /* Safari 兼容性 - object-fit 支持 */
  -o-object-fit: contain;
  object-fit: contain;
  /* 渲染优化 */
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* PC端样式优化 */
@media (min-width: 769px) {
  .header-section {
    flex-shrink: 0;
    /* 确保header不会被压缩 */
    height: auto;
    min-height: 120px;
  }

  /* 当有图片时，进一步优化布局 */
  .image-display-section {
    max-height: calc(100vh - 200px);
    overflow-y: auto;
  }
}

/* 中等屏幕下隐藏下载按钮文字 - 仅PC端 */
@media (max-width: 1300px) and (min-width: 769px) {
  .download-btn-new .download-text {
    display: none;
  }

  .download-btn-new {
    min-width: 48px;
    justify-content: center;
    display: flex;
  }
}

/* 小屏幕下隐藏操作按钮文字 - 仅PC端 */
@media (max-width: 1180px) and (min-width: 769px) {
  .add-btn .btn-text,
  .retry-btn .btn-text,
  .delete-btn .btn-text {
    display: none;
  }

  .add-btn,
  .retry-btn,
  .delete-btn {
    min-width: 36px;
    justify-content: center;
  }
}

/* 小屏幕下隐藏操作按钮文字 - 仅PC端 */
@media (max-width: 1030px) and (min-width: 769px) {
  .exif-label > span {
    display: none;
  }
}

/* 响应式设计 */
@media (max-width: 950px) {
  .app-container {
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 100vh;
    height: auto;
  }

  .drag-overlay {
    padding: 20px;
  }

  .drag-message {
    padding: 30px;
  }

  .drag-icon {
    font-size: 48px;
  }

  .drag-text {
    font-size: 18px;
  }

  .header-section {
    padding: 40px 20px 20px;
  }

  .title-container {
    max-width: 600px;
  }

  .settings-section-main {
    padding: 0 20px 20px;
  }

  .settings-btn-main {
    font-size: 14px !important;
    padding: 10px 20px !important;
  }

  .settings-hint {
    font-size: 13px;
  }

  .main-title {
    font-size: 2.5rem;
  }

  .subtitle {
    font-size: 1rem;
  }

  .floating-toolbar {
    position: relative;
    top: auto;
    left: auto;
    transform: none;
    margin: 20px;
    border-radius: 16px;
    padding: 12px;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    max-width: none;
  }

  .toolbar-section {
    justify-content: center;
  }

  .images-section {
    padding: 10px;
  }

  .images-grid {
    padding: 0 20px;
    height: fit-content;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .image-card {
    flex: 0 0 180px;
    width: 180px;
  }

  .image-preview {
    height: 60px;
  }

  .floating-toolbar {
    position: relative;
    top: auto;
    left: auto;
    transform: none;
    margin: 20px;
    border-radius: 16px;
    padding: 12px;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    max-width: none;
  }

  .toolbar-section {
    justify-content: center;
  }

  .files-section {
    align-items: center;
    flex-direction: column;
    justify-content: center;
    min-width: auto;
    gap: 8px;
  }

  .files-info {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .action-buttons {
    flex-direction: row;
  }

  .stats-section {
    align-items: center;
    flex-direction: row;
    justify-content: center;
  }

  .options-section {
    align-items: center;
    flex-direction: row;
    justify-content: center;
    min-width: auto;
    flex-wrap: wrap;
    gap: 16px;
  }

  .quality-control {
    min-width: 140px;
    margin-left: 0;
  }

  .decision-control {
    min-width: 220px;
  }

  .image-quality-control {
    margin-top: 6px;
    padding-top: 6px;
  }

  .toolbar-divider {
    width: 100%;
    height: 1px;
    background: linear-gradient(
      to right,
      transparent,
      rgba(0, 0, 0, 0.1),
      transparent
    );
    margin: 0;
  }

  .stats-info {
    min-width: 220px;
    /* 移动端使用较小的最小宽度 */
    justify-content: center;
  }

  /* 移动端确保按钮文字显示 */
  .download-btn-new .download-text {
    display: inline !important;
  }

  .add-btn .btn-text,
  .retry-btn .btn-text,
  .delete-btn .btn-text {
    display: inline !important;
  }

  .download-btn-new {
    padding: 12px 16px !important;
    min-width: auto !important;
    justify-content: flex-start !important;
  }

  .add-btn,
  .retry-btn,
  .delete-btn {
    padding: 8px 12px !important;
    min-width: auto !important;
    justify-content: flex-start !important;
  }

  .upload-btn-hero {
    min-width: auto;
    width: 100%;
    max-width: 350px;
  }

  .fullscreen-comparison {
    height: auto;

    overflow: visible;
  }

  .comparison-container-fullscreen,
  .comparison-image-fullscreen {
    min-height: 250px;
    height: 300px;
    display: flex;
  }

  .comparison-container-fullscreen {
    max-height: 70vh;
    display: flex;
  }
}

@media (max-width: 480px) {
  .floating-toolbar {
    padding: 10px;
    gap: 10px;
  }

  .action-btn {
    padding: 8px 12px;
  }

  .btn-text {
    font-size: 12px;
  }

  .quality-slider-wrapper {
    width: 80px;
  }

  .download-btn-new {
    padding: 12px 16px;
  }

  .download-text {
    font-size: 14px;
  }
}

/* 全局防闪烁规则 */
img-comparison-slider,
img-comparison-slider *,
.comparison-image-fullscreen,
.comparison-slider-fullscreen,
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

/* 自定义全屏滑块样式 */
:deep(.comparison-slider-fullscreen .handle) {
  background: rgba(255, 255, 255, 0.9);
  border: 3px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

:deep(.comparison-slider-fullscreen .handle:hover) {
  transform: scale(1.1);
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.3);
}

:deep(.comparison-slider-fullscreen .divider) {
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
}

/* 图片网格 */
.images-grid {
  display: flex;
  gap: 12px;
  height: fit-content;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  /* 自定义滚动条 */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
}

.images-grid::-webkit-scrollbar {
  height: 6px;
  width: 6px;
}

.images-grid::-webkit-scrollbar-track {
  background: transparent;
}

.images-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.images-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* 图片卡片 */
.image-card {
  background: transparent;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  flex: 0 0 180px;
  width: 180px;
  display: flex;
  flex-direction: column;
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

/* 图片预览 */
.image-preview {
  position: relative;
  width: 100%;
  height: 80px;
  overflow: hidden;
}

.image-preview img,
.preview-image {
  width: 100%;
  height: 100%;
  /* Safari 兼容性 - object-fit 支持 */
  -o-object-fit: cover;
  object-fit: cover;
  /* 为不支持 object-fit 的旧版浏览器提供回退 */
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center;
  transition: transform 0.3s ease;
  /* 确保图片在容器中居中显示 */
  display: block;
  margin: 0 auto;
}

.image-card:hover .image-preview img {
  transform: scale(1.05);
}

/* 压缩中覆盖层 */
.compressing-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(79, 70, 229, 0.62);
  backdrop-filter: blur(6px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: white;
  padding: 12px;
  text-align: center;
}

.cancel-btn {
  border: 1px solid rgba(255, 255, 255, 0.32);
  background: rgba(255, 255, 255, 0.18);
  color: white;
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease,
    border-color 0.18s ease;
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.26);
  border-color: rgba(255, 255, 255, 0.44);
  transform: translateY(-1px);
}

.overlay-label {
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.02em;
}

.processing-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 5px 9px;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(8px);
  color: white;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18);
}

.processing-badge-label {
  white-space: nowrap;
}

/* 错误覆盖层 */
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(239, 68, 68, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.error-text {
  font-size: 12px;
  font-weight: 600;
}

/* 图片信息 */
.image-info {
  padding: 12px;
  background: white;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 160px;
}

/* 图片头部信息 */
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
  line-height: 1.3;
}

.image-format {
  font-size: 9px;
  font-weight: 700;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.image-format.svg-format {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

/* 图片统计信息 */
.image-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* SVG文件特殊显示 */
.svg-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.svg-size-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.svg-size-info .size-label {
  font-size: 10px;
  color: #6b7280;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.svg-size-info .size-value {
  font-size: 11px;
  font-weight: 600;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

.svg-conversion-hint {
  font-size: 10px;
  color: #10b981;
  text-align: center;
  font-style: italic;
  opacity: 0.8;
}

/* SVG description area to fill blank space */
.svg-description {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.svg-feature {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #6b7280;
  line-height: 1.3;
}

.svg-feature .feature-icon {
  font-size: 12px;
  flex-shrink: 0;
  opacity: 0.7;
}

.svg-feature .feature-text {
  flex: 1;
  font-weight: 500;
}

.compression-result {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.size-comparison {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.size-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
}

.size-label {
  font-size: 9px;
  color: #9ca3af;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.size-value {
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

.size-value.original {
  color: #6b7280;
}

.size-value.compressed {
  color: #059669;
}

.size-arrow {
  color: #d1d5db;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.result-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  align-items: center;
}

.ratio-badge {
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  font-size: 10px;
  font-weight: 700;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  padding: 4px 8px;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
  transition: all 0.2s ease;
  white-space: nowrap;
}

.ratio-badge.ratio-negative {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  box-shadow: 0 2px 4px rgba(239, 68, 68, 0.2);
}

.decision-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-top: 4px;
}

.decision-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 3px 7px;
  font-size: 9px;
  font-weight: 700;
  line-height: 1.1;
  border: 1px solid transparent;
  white-space: nowrap;
}

.output-chip {
  color: #047857;
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.14);
}

.objective-chip {
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.1);
  border-color: rgba(124, 58, 237, 0.14);
}

.fallback-chip {
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.18);
}

/* 图片质量控制 */
.image-quality-control {
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}

.quality-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.quality-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.quality-label {
  font-size: 10px;
  color: #6b7280;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.quality-value {
  font-size: 11px;
  color: #374151;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

.reset-quality-btn {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #64748b;
  padding: 0;
  flex-shrink: 0;
}

.reset-quality-btn:hover {
  background: #4f46e5;
  border-color: #4f46e5;
  color: white;
  transform: scale(1.05);
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);
}

.reset-quality-btn:active {
  transform: scale(0.95);
}

/* 确保按钮包装器不会干扰点击 */
:deep(.image-quality-control .el-slider__button-wrapper) {
  top: 50%;
  transform: translateY(-50%) translateX(-50%);
  height: fit-content;
  width: fit-content;
  display: flex;
  cursor: pointer;
  z-index: 3;
  /* 确保按钮在最上层 */
}

.image-quality-slider {
  --el-slider-height: 6px;
  --el-slider-button-size: 14px;
  --el-slider-main-bg-color: linear-gradient(135deg, #4f46e5, #7c3aed);
  --el-slider-runway-bg-color: rgba(0, 0, 0, 0.08);
  width: 100%;
}

/* 确保滑轨可点击 */
.image-quality-slider :deep(.el-slider__runway) {
  height: 6px;
  cursor: pointer;
  position: relative;
  z-index: 1;
  border-radius: 3px;
}

/* 确保整个滑动条容器都可交互 */
.image-quality-slider :deep(.el-slider) {
  position: relative;
  z-index: 1;
  padding: 8px 0;
}

/* 自定义滑块按钮样式 */
.image-quality-slider :deep(.el-slider__button) {
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  border: 2px solid #ffffff;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
  cursor: pointer;
  z-index: 2;
  transition: all 0.2s ease;
}

.image-quality-slider :deep(.el-slider__button:hover) {
  background: linear-gradient(135deg, #6366f1, #7c3aed);
  border-color: #ffffff;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
  transform: scale(1.15);
}

/* 确保按钮包装器也有足够的点击区域 */
.image-quality-slider :deep(.el-slider__button-wrapper) {
  cursor: pointer;
  z-index: 2;
}

/* 图片操作按钮 */
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
  font-size: 12px;
  flex: 1;
}

.action-btn-small.crop-single {
  color: #4f46e5;
  border-color: rgba(79, 70, 229, 0.3);
}
.action-btn-small.crop-single:hover {
  background: #eef2ff;
  border-color: rgba(79, 70, 229, 0.6);
}

/* Hover crop button on thumbnail */
.crop-hover-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 15px;
  transition: all 0.25s ease;
  opacity: 0;
  transform: translateY(-4px) scale(0.9);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}
.image-preview:hover .crop-hover-btn {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.crop-hover-btn:hover {
  background: rgba(79, 70, 229, 0.85);
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.5);
}
.crop-hover-btn:active {
  transform: scale(0.9);
}

/* Restore button shown when an image has been replaced by format conversion */
.restore-hover-btn {
  position: absolute;
  right: 44px;
  top: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #111827;
  border-radius: 8px;
  padding: 6px 8px;
  font-weight: 700;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.18s ease,
    transform 0.12s ease;
}

.image-preview:hover .restore-hover-btn {
  opacity: 1;
  transform: translateY(-2px);
}

.action-btn-small:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.download-single {
  color: #059669;
  border-color: rgba(5, 150, 105, 0.2);
}

.download-single:hover {
  background: #ecfdf5;
  border-color: rgba(5, 150, 105, 0.4);
}

.retry-single {
  color: #2563eb;
  border-color: rgba(37, 99, 235, 0.2);
}

.retry-single:hover {
  background: #eff6ff;
  border-color: rgba(37, 99, 235, 0.4);
}

.delete-single {
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.2);
}

.delete-single:hover {
  background: #fef2f2;
  border-color: rgba(220, 38, 38, 0.4);
}

/* 调试信息样式 */
.debug-info {
  color: white;
  padding: 20px;
  background: rgba(255, 0, 0, 0.3);
  margin: 10px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 14px;
  line-height: 1.4;
}

.debug-info p {
  margin: 5px 0;
}

/* 单图预览 */
.single-image-preview {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.05);
}

.single-image {
  max-width: 100%;
  max-height: 100%;
  /* Safari 兼容性 - object-fit 支持 */
  -o-object-fit: contain;
  object-fit: contain;
}

/* 预览覆盖层 */
.preview-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(102, 126, 234, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
}

.preview-overlay.error {
  background: rgba(239, 68, 68, 0.9);
}

.overlay-text {
  font-size: 18px;
  font-weight: 600;
  margin-top: 10px;
}

.overlay-subtext {
  font-size: 14px;
  opacity: 0.9;
  margin-top: 5px;
  text-align: center;
  max-width: 300px;
}

/* 图片信息覆盖层 */
.image-overlay-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: white;
  padding: 20px;
  backdrop-filter: blur(10px);
  transition:
    opacity 0.2s ease,
    visibility 0.2s ease;
  pointer-events: none;
  z-index: 102;
}

/* 全屏模式样式 */
.fullscreen-comparison.fullscreen-mode {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.95);
  z-index: 140;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fullscreen-comparison.fullscreen-mode .comparison-container-fullscreen {
  max-width: 90vw;
  max-height: 90vh;
  transition: transform 0.2s ease;
  transform-origin: center;
}

.fullscreen-comparison.fullscreen-mode .image-overlay-info {
  pointer-events: auto;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
}

/* 覆盖层头部布局 */
.overlay-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.image-title {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  margin-right: 16px;
}

/* 图片控制按钮组 */
.image-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
}

.image-controls .el-button {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  transition: all 0.2s ease;
}

.image-controls .el-button:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}

.image-controls .el-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.image-controls .el-button:disabled:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: none;
}

/* 缩放信息显示 */
.zoom-info {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 600;
  min-width: 35px;
  text-align: center;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

/* 移动端拖拽时隐藏信息层 */
.image-overlay-info.mobile-dragging {
  opacity: 0;
  visibility: hidden;
}

/* PC端拖拽时隐藏信息层 */
.image-overlay-info.pc-dragging {
  opacity: 0;
  visibility: hidden;
}

.image-details {
  display: flex;
  gap: 12px;
  font-size: 13px;
  opacity: 0.9;
  flex-wrap: wrap;
}

.image-details .savings {
  color: #4ade80;
  font-weight: 700;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  transition: color 0.2s ease;
}

.image-details .savings.savings-negative {
  color: #dc2626;
}

/* 全屏模式下的键盘提示 */
.fullscreen-comparison.fullscreen-mode::before {
  content: '提示：按 Esc 退出全屏，+/- 缩放，0 重置，←/→ 切换图片';
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 141;
  opacity: 0;
  animation: fadeInOut 4s ease-in-out;
}

@keyframes fadeInOut {
  0% {
    opacity: 0;
  }
  10% {
    opacity: 1;
  }

  90% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

/* 响应式调整 */
@media (max-width: 768px) {
  .image-controls {
    gap: 4px;
  }

  .image-controls .el-button {
    width: 28px;
    height: 28px;
    font-size: 12px;
  }

  .zoom-info {
    font-size: 10px;
    min-width: 28px;
  }

  .overlay-header {
    flex-direction: column;
    gap: 8px;
  }

  .image-title {
    margin-right: 0;
    text-align: center;
  }

  .decision-row,
  .objective-row {
    width: 100%;
    flex-wrap: wrap;
  }

  .decision-control {
    width: 100%;
    min-width: auto;
  }
}

/* Playground 自适应修正 */
.image-card,
.image-info,
.image-header,
.image-stats,
.compression-result,
.size-comparison,
.size-item,
.image-actions {
  min-width: 0;
}

.image-card,
.image-info {
  box-sizing: border-box;
}

.image-info {
  height: auto;
  min-height: 160px;
}

.image-header,
.size-comparison {
  flex-wrap: wrap;
}

.image-name {
  min-width: 0;
}

.image-quality-control .quality-header {
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
}

.image-quality-control .quality-info {
  min-width: 0;
  flex: 1 1 110px;
  flex-wrap: wrap;
}

.image-quality-control .reset-quality-btn {
  margin-left: auto;
}

.image-quality-control .quality-label {
  white-space: nowrap;
}

.image-quality-control .quality-value {
  color: #374151;
  white-space: nowrap;
  background: none;
  background-clip: border-box;
  -webkit-background-clip: border-box;
  -webkit-text-fill-color: currentColor;
}

.image-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(28px, 1fr));
  gap: 4px;
}

.action-btn-small {
  min-width: 0;
  padding: 4px;
}

@media (max-width: 1180px) {
  .floating-toolbar {
    flex-wrap: wrap;
    align-items: stretch;
    justify-content: center;
    width: min(100%, 1240px);
    max-width: calc(100vw - 24px);
    box-sizing: border-box;
  }

  .toolbar-section {
    width: 100%;
    min-width: 0;
    flex-wrap: wrap;
    white-space: normal;
  }

  .toolbar-divider {
    width: 100%;
    height: 1px;
    margin: 0;
    background: linear-gradient(
      to right,
      transparent,
      rgba(0, 0, 0, 0.1),
      transparent
    );
  }

  .files-section,
  .stats-section,
  .options-section {
    flex: 1 1 100%;
    min-width: 0;
    justify-content: center;
  }

  .files-info,
  .action-buttons,
  .stats-info {
    width: 100%;
    min-width: 0;
    flex-wrap: wrap;
    justify-content: center;
  }

  .stats-info {
    height: auto;
  }

  .stats-info .size-label {
    min-width: 0;
    white-space: normal;
    text-align: center;
  }

  .quality-control,
  .decision-control {
    min-width: 0;
    margin-left: 0;
    flex: 1 1 220px;
  }

  .decision-row,
  .objective-row {
    flex-wrap: wrap;
  }

  .objective-input-wrapper {
    min-width: 0;
  }

  .decision-select,
  .decision-select-compact {
    max-width: 100%;
  }
}

@media (max-width: 950px) {
  .files-section,
  .stats-section,
  .options-section {
    align-items: stretch;
  }

  .files-info {
    justify-content: center;
    text-align: center;
  }

  .action-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    width: 100%;
  }

  .action-btn {
    width: 100%;
    justify-content: center !important;
  }

  .stats-info {
    justify-content: space-between;
    gap: 10px;
  }

  .stats-info .size-label {
    flex: 1 1 140px;
    text-align: left;
  }

  .images-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
    padding: 8px;
    overflow-x: hidden;
    overflow-y: visible;
  }

  .image-card {
    flex: initial;
    width: auto;
  }
}

@media (max-width: 480px) {
  .floating-toolbar {
    margin: 12px 8px;
    max-width: calc(100vw - 16px);
  }

  .images-section {
    padding: 8px;
    gap: 12px;
  }

  .images-grid {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 6px;
  }

  .files-info,
  .stats-info {
    justify-content: center;
    text-align: center;
  }

  .stats-info .size-label {
    flex-basis: 100%;
    text-align: center;
  }

  .action-buttons {
    grid-template-columns: 1fr;
  }

  .image-info {
    padding: 10px;
    gap: 8px;
  }

  .image-actions {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .action-btn-small {
    padding: 4px 2px;
  }

  .quality-control,
  .decision-control,
  .decision-select,
  .decision-select-compact,
  .decision-input {
    width: 100%;
  }
}

/* Toolbar stability */
@media (min-width: 1351px) {
  .floating-toolbar {
    display: grid;
    grid-template-columns:
      minmax(280px, 1.1fr)
      minmax(300px, 1fr)
      minmax(460px, 1.35fr)
      max-content;
    align-items: center;
    gap: 18px;
    width: min(100%, 1980px);
    max-width: calc(100vw - 48px);
    padding: 14px 20px;
    box-sizing: border-box;
  }

  .toolbar-divider {
    display: none;
  }

  .toolbar-section {
    width: 100%;
    min-width: 0;
    white-space: normal;
  }

  .files-section {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
  }

  .files-info {
    min-width: 0;
    white-space: nowrap;
  }

  .action-buttons {
    flex-wrap: nowrap;
    justify-content: flex-end;
  }

  .stats-section {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 210px;
    align-items: center;
    gap: 14px;
    min-height: 52px;
  }

  .stats-info {
    min-width: 0;
    height: auto;
  }

  .stats-info .size-label {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stats-pills {
    min-width: 210px;
    min-height: 28px;
    justify-content: flex-end;
    align-items: center;
    align-content: center;
  }

  .options-section {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) minmax(0, 0.95fr);
    align-items: center;
    gap: 16px;
    min-width: 0;
  }

  .exif-option {
    min-width: 150px;
    height: auto;
  }

  .exif-option :deep(.el-checkbox) {
    margin-right: 0;
    white-space: nowrap;
  }

  .quality-control {
    min-width: 0;
    margin-left: 0;
  }

  .decision-control {
    min-width: 0;
  }

  .download-section {
    justify-content: flex-end;
  }

  .download-btn-new {
    width: 228px;
    min-width: 228px;
  }

  .download-btn-content {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 1350px) and (min-width: 951px) {
  .floating-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      'files stats'
      'options download';
    align-items: stretch;
    gap: 16px 18px;
    width: min(100%, 1480px);
    max-width: calc(100vw - 32px);
    padding: 14px 18px;
    box-sizing: border-box;
  }

  .toolbar-divider {
    display: none;
  }

  .toolbar-section {
    width: 100%;
    min-width: 0;
    white-space: normal;
  }

  .files-section {
    grid-area: files;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }

  .files-info {
    min-width: 0;
  }

  .action-buttons {
    flex-wrap: nowrap;
    justify-content: flex-end;
  }

  .stats-section {
    grid-area: stats;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 190px;
    align-items: center;
    gap: 12px;
    min-height: 52px;
  }

  .stats-info {
    min-width: 0;
    height: auto;
  }

  .stats-info .size-label {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stats-pills {
    min-width: 190px;
    min-height: 28px;
    justify-content: flex-end;
    align-items: center;
    align-content: center;
  }

  .options-section {
    grid-area: options;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) minmax(0, 0.95fr);
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .exif-option {
    min-width: 140px;
    height: auto;
  }

  .exif-option :deep(.el-checkbox) {
    margin-right: 0;
    white-space: nowrap;
  }

  .quality-control {
    min-width: 0;
    margin-left: 0;
  }

  .decision-control {
    min-width: 0;
  }

  .download-section {
    grid-area: download;
    justify-content: flex-end;
    align-items: center;
  }

  .download-btn-new {
    width: 228px;
    min-width: 228px;
  }

  .download-btn-content {
    width: 100%;
    justify-content: center;
  }
}

/* 设置面板样式 */
.settings-content {
  padding: 0;
}

.settings-section {
  margin-bottom: 24px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.settings-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin: 0 0 8px 0;
}

.settings-description {
  color: #666;
  font-size: 14px;
  margin: 0 0 16px 0;
}

.tool-config-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tool-config-item {
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  padding: 16px;
  background: #fafbfc;
}

.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-icon {
  color: #667eea;
  font-size: 18px;
}

.tool-name {
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.tool-config {
  margin-top: 12px;
}

.tool-help {
  margin-top: 12px;
  padding: 12px;
  background: #f0f7ff;
  border: 1px solid #d1ecf1;
  border-radius: 6px;
}

.help-text {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #333;
  line-height: 1.5;
}

.help-link {
  color: #667eea;
  text-decoration: none;
}

.help-link:hover {
  text-decoration: underline;
}

.help-note {
  margin: 0;
  font-size: 12px;
  color: #666;
  font-style: italic;
}

.add-tool-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e1e5e9;
}

.usage-info {
  color: #666;
  font-size: 14px;
  line-height: 1.6;
}

.usage-info p {
  margin: 0 0 8px 0;
}

.usage-info p:last-child {
  margin-bottom: 0;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.settings-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  backdrop-filter: blur(10px);
}

.settings-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-1px);
}

/* FPS-style info overlay in top-left corner */
.fps-style-info {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 110;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  font-family: 'Courier New', monospace;
}

.memory-indicator,
.worker-indicator {
  background: rgba(0, 0, 0, 0.8);
  color: #00ff41;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(0, 255, 65, 0.3);
}

.memory-indicator.memory-high {
  color: #ff4444;
  border-color: rgba(255, 68, 68, 0.3);
}

.worker-indicator {
  color: #44ffff;
  border-color: rgba(68, 255, 255, 0.3);
}

/* Queue section styling */
.queue-section {
  display: flex;
  align-items: center;
}

.queue-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.queue-status {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.queue-clear-btn {
  background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  color: white;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
}

.queue-clear-btn:hover {
  transform: translateY(-1px) scale(1.05);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.queue-clear-btn:active {
  transform: translateY(0px) scale(0.95);
}
</style>
