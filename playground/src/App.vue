<script setup lang="ts">
import {
  CloseBold,
  Download,
  FolderOpened,
  Loading,
  Picture,
  Upload,
  ZoomIn,
  ZoomOut,
  FullScreen,
  Aim,
  Setting,
  Key,
  Plus,
  Delete,
} from '@element-plus/icons-vue'
import GitForkVue from '@simon_he/git-fork-vue'
import { ElMessage } from 'element-plus'
import 'img-comparison-slider/dist/styles.css'
import JSZip from 'jszip'
import { download } from 'lazy-js-utils'
import { h } from 'vue'
import { compress } from '../../src'

// 导入 img-comparison-slider
import('img-comparison-slider')

// 单个图片的状态接口
interface ImageItem {
  id: string
  file: File
  originalUrl: string
  compressedUrl?: string
  originalSize: number
  compressedSize?: number
  compressionRatio?: number
  isCompressing: boolean
  compressionError?: string
  quality: number // 每张图片独立的质量设置
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

// 图片查看相关状态
const imageZoom = ref(1) // 图片缩放比例
const isFullscreen = ref(false) // 全屏状态
const imageTransform = ref({ x: 0, y: 0 }) // 图片位移

// 全局配置
const preserveExif = ref(false) // EXIF 信息保留选项
const globalQuality = ref(0.6) // 全局质量设置
const globalQualityDragging = ref(0.6) // 拖动过程中的临时质量值

// 设置面板相关状态
const showSettingsPanel = ref(false)

// 工具配置接口
interface ToolConfig {
  name: string
  key: string
  enabled: boolean
}

// 可用的工具选项
const availableTools = ['tinypng']

// 工具配置数组
const toolConfigs = ref<ToolConfig[]>([])

// 临时工具配置（用于设置面板编辑）
const tempToolConfigs = ref<ToolConfig[]>([])

// 打开设置面板时，复制当前配置到临时配置
const openSettingsPanel = () => {
  tempToolConfigs.value = JSON.parse(JSON.stringify(toolConfigs.value))
  showSettingsPanel.value = true
}

// 关闭设置面板时，不保存临时配置的更改
const closeSettingsPanel = () => {
  showSettingsPanel.value = false
  // 不更新 toolConfigs，保持原有配置
}

// 从 localStorage 恢复设置
const loadSettings = () => {
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
        enabled: false,
      },
    ]
  }

  // 同步初始化拖动状态
  globalQualityDragging.value = globalQuality.value
}

// 保存临时配置到实际配置并保存到 localStorage（显示成功提示）
const saveSettings = () => {
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
const addToolConfig = () => {
  // 获取已使用的工具名称
  const usedTools = tempToolConfigs.value.map((config) => config.name)
  // 找到第一个未使用的工具
  const availableTool = availableTools.find((tool) => !usedTools.includes(tool))

  if (availableTool) {
    tempToolConfigs.value.push({
      name: availableTool,
      key: '',
      enabled: false,
    })
  }
}

// 删除工具配置（操作临时配置）
const removeToolConfig = (index: number) => {
  tempToolConfigs.value.splice(index, 1)
}

// 全局质量百分比计算属性 - 显示拖动中的值
const globalQualityPercent = computed(() =>
  Math.round(globalQualityDragging.value * 100),
)

// 全局质量拖动输入处理 - 只更新显示，不触发重压缩
const handleGlobalQualityInput = (value: number) => {
  globalQualityDragging.value = value / 100
}

// 全局质量拖动结束处理 - 触发重压缩
const handleGlobalQualitySliderChange = async (value: number) => {
  const newGlobalQuality = value / 100
  globalQualityDragging.value = newGlobalQuality
  await handleGlobalQualityChange(newGlobalQuality)
}

// 修改全局质量变化处理函数 - 自动更新所有图片
const handleGlobalQualityChange = async (newGlobalQuality: number) => {
  globalQuality.value = newGlobalQuality
  globalQualityDragging.value = newGlobalQuality // 同步拖动状态

  // 更新所有图片质量为新的全局质量
  const recompressPromises = imageItems.value.map(async (item) => {
    item.quality = newGlobalQuality
    // 如果图片没有在压缩中，自动重新压缩
    if (!item.isCompressing) {
      await compressImage(item)
    }
  })

  // 并行处理所有图片的重新压缩
  await Promise.all(recompressPromises)
}

// 单个图片质量变化处理
const handleImageQualityChange = async (
  item: ImageItem,
  newQualityPercent: number,
) => {
  // 更新质量值 (转换为0-1范围)
  item.quality = newQualityPercent / 100

  // 如果图片没有在压缩中，自动重新压缩
  if (!item.isCompressing) {
    await compressImage(item)
  }
}

// 图片列表状态
const imageItems = ref<ImageItem[]>([])
const supportType = [
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/gif',
  'image/webp',
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
          '✅ 支持的格式: PNG, JPG, JPEG, GIF, WebP',
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
const totalOriginalSize = computed(() =>
  imageItems.value.reduce((sum, item) => sum + item.originalSize, 0),
)
const totalCompressedSize = computed(() =>
  imageItems.value.reduce((sum, item) => sum + (item.compressedSize || 0), 0),
)

const totalCompressionRatio = computed(() => {
  if (totalOriginalSize.value === 0) return 0
  return (
    ((totalOriginalSize.value - totalCompressedSize.value) /
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
const allCompressed = computed(
  () =>
    imageItems.value.length > 0 &&
    compressedCount.value === imageItems.value.length,
)

// 检查是否可以添加新的工具配置
const canAddToolConfig = computed(() => {
  // 获取已使用的工具名称
  const usedTools = tempToolConfigs.value.map((config) => config.name)
  // 检查是否还有未使用的工具
  return availableTools.some((tool) => !usedTools.includes(tool))
})

// 注册事件监听器
onMounted(() => {
  // 加载保存的设置
  loadSettings()

  fileRef.value!.addEventListener('change', handleFileInputChange)

  // 添加全局拖拽事件监听
  document.addEventListener('dragover', handleDragOver)
  document.addEventListener('drop', handleDrop)
  document.addEventListener('dragenter', handleDragEnter)
  document.addEventListener('dragleave', handleDragLeave)

  // 添加粘贴事件监听
  document.addEventListener('paste', handlePaste)

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

  // 添加窗口大小变化监听
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  // 清理事件监听器
  document.removeEventListener('dragover', handleDragOver)
  document.removeEventListener('drop', handleDrop)
  document.removeEventListener('dragenter', handleDragEnter)
  document.removeEventListener('dragleave', handleDragLeave)
  document.removeEventListener('paste', handlePaste)

  // 清理移动端触摸事件监听器
  document.removeEventListener('touchstart', handleTouchStart)
  document.removeEventListener('touchend', handleTouchEnd)
  document.removeEventListener('touchcancel', handleTouchEnd)

  // 清理PC端鼠标事件监听器
  document.removeEventListener('mousedown', handleMouseDown)
  document.removeEventListener('mouseup', handleMouseUp)

  // 清理图片查看相关事件监听
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('mousemove', handleImageMouseMove)
  document.removeEventListener('mouseup', handleImageMouseUp)

  // 清理窗口事件监听
  window.removeEventListener('resize', handleWindowResize)

  // 清理对象URL
  imageItems.value.forEach((item) => {
    URL.revokeObjectURL(item.originalUrl)
    if (item.compressedUrl) {
      URL.revokeObjectURL(item.compressedUrl)
    }
  })
})

// 移动端触摸事件处理
function handleTouchStart(e: TouchEvent) {
  // 检查触摸是否在图片比较滑块上
  const target = e.target as HTMLElement
  if (
    target.closest('img-comparison-slider') ||
    target.closest('.comparison-slider-fullscreen')
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
    target.closest('.comparison-slider-fullscreen')
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

    ElMessage({
      message: `Successfully loaded ${imageFiles.length} image(s)`,
      type: 'success',
    })
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
    let files: File[] = []

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
      console.log('剪贴板中没有找到支持的图片文件')
      return // 静默处理，不显示错误消息
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

      ElMessage({
        message: `Successfully loaded ${imageFiles.length} image(s)`,
        type: 'success',
      })
    } finally {
      loading.value = false
      // 清空文件输入框的值，确保可以重复选择同一文件
      fileRef.value.value = ''
    }
  }
}

// 添加新图片到列表
async function addNewImages(files: File[]) {
  const newItems: ImageItem[] = files.map((file) => ({
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    file,
    originalUrl: URL.createObjectURL(file),
    originalSize: file.size,
    isCompressing: false,
    quality: globalQuality.value, // 使用全局质量作为默认值
  }))
  // 自动开始压缩所有新添加的图片
  await compressImages(newItems)
  imageItems.value.push(...newItems)
}

// 压缩单个图片
async function compressImage(item: ImageItem): Promise<void> {
  if (item.isCompressing) return

  item.isCompressing = true
  item.compressionError = undefined

  try {
    // 过滤出启用的工具配置
    const enabledToolConfigs = toolConfigs.value.filter(
      (config) => config.enabled && config.key.trim(),
    )

    const compressedBlob = await compress(item.file, {
      quality: item.quality, // 直接使用图片的质量设置（已经是0-1范围）
      type: 'blob',
      preserveExif: preserveExif.value, // 使用全局 EXIF 保留设置
      toolConfigs: enabledToolConfigs, // 传入工具配置
    })

    if (!compressedBlob) {
      ElMessage({
        message: 'size is too large',
        type: 'error',
      })
      return
    }

    if (item.compressedUrl) {
      URL.revokeObjectURL(item.compressedUrl)
    }

    item.compressedUrl = URL.createObjectURL(compressedBlob)
    item.compressedSize = compressedBlob.size
    item.compressionRatio =
      ((item.originalSize - compressedBlob.size) / item.originalSize) * 100

    // 为当前图片优化渲染性能
  } catch (error) {
    console.error('Compression error:', error)
    item.compressionError =
      error instanceof Error ? error.message : 'Compression failed'
  } finally {
    item.isCompressing = false
  }
}

// 批量压缩图片
async function compressImages(items: ImageItem[] = imageItems.value) {
  isCompressingAll.value = true

  try {
    // 并发压缩，但限制并发数量避免性能问题
    const batchSize = 3
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      await Promise.all(batch.map((item) => compressImage(item)))
    }
  } finally {
    isCompressingAll.value = false
  }
}

// 处理 EXIF 保留选项变化
async function handlePreserveExifChange() {
  // 重新压缩所有已存在的图片，使用新的 EXIF 设置
  for (const item of imageItems.value) {
    if (!item.isCompressing) {
      await compressImage(item)
    }
  }
}

// 删除单个图片
function deleteImage(index: number) {
  const item = imageItems.value[index]
  URL.revokeObjectURL(item.originalUrl)
  if (item.compressedUrl) {
    URL.revokeObjectURL(item.compressedUrl)
  }

  imageItems.value.splice(index, 1)

  // 调整当前图片索引
  if (currentImageIndex.value >= imageItems.value.length) {
    currentImageIndex.value = Math.max(0, imageItems.value.length - 1)
  }
}

// 清空所有图片
function clearAllImages() {
  imageItems.value.forEach((item) => {
    URL.revokeObjectURL(item.originalUrl)
    if (item.compressedUrl) {
      URL.revokeObjectURL(item.compressedUrl)
    }
  })

  imageItems.value = []
  currentImageIndex.value = 0
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
  if (!item.compressedUrl) return

  try {
    const originalName = item.file.name
    download(item.compressedUrl, originalName)

    ElMessage({
      message: `Downloaded: ${originalName}`,
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

// 批量下载所有图片（创建 ZIP 压缩包）
async function downloadAllImages() {
  if (downloading.value) return

  const downloadableItems = imageItems.value.filter(
    (item) => item.compressedUrl && !item.compressionError,
  )
  if (downloadableItems.length === 0) {
    ElMessage({
      message: 'No compressed images to download',
      type: 'warning',
    })
    return
  }

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
      if (item.compressedUrl) {
        // 获取压缩后的 Blob 数据
        const response = await fetch(item.compressedUrl)
        const blob = await response.blob()

        // 使用原始文件名添加到 ZIP 文件夹中
        folder.file(item.file.name, blob)
      }
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
            style: `color: ${totalCompressionRatio.value < 0 ? '#dc2626' : '#059669'}; font-size: 13px; font-family: monospace; background: ${totalCompressionRatio.value < 0 ? 'rgba(220, 38, 38, 0.1)' : 'rgba(5, 150, 105, 0.1)'}; padding: 2px 6px; border-radius: 4px;`,
          },
          `Total ${totalCompressionRatio.value < 0 ? 'increased' : 'saved'}: ${totalCompressionRatio.value < 0 ? '+' : ''}${Math.abs(totalCompressionRatio.value).toFixed(1)}%`,
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
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
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
    case 'ArrowLeft':
      if (isFullscreen.value) {
        e.preventDefault()
        setCurrentImage(Math.max(0, currentImageIndex.value - 1))
      }
      break
    case 'ArrowRight':
      if (isFullscreen.value) {
        e.preventDefault()
        setCurrentImage(
          Math.min(imageItems.value.length - 1, currentImageIndex.value + 1),
        )
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

function handleImageMouseDown(e: MouseEvent) {
  if (!isFullscreen.value) return

  // 如果图片没有放大，不处理拖拽
  if (imageZoom.value <= 1) {
    return // 让比较滑块正常工作
  }

  isDragging = true
  dragStartX = e.clientX
  dragStartY = e.clientY

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

  const newX = e.clientX - dragStartX
  const newY = e.clientY - dragStartY

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
</script>

<template>
  <div class="app-container" :class="{ 'drag-over': isDragOver }">
    <!-- 拖拽覆盖层 -->
    <div v-show="isDragOver" class="drag-overlay">
      <div class="drag-message">
        <el-icon class="drag-icon">
          <FolderOpened />
        </el-icon>
        <div class="drag-text">Drop images or folders here</div>
        <div class="drag-subtitle">
          Support multiple images and folder drag & drop • Or use Ctrl+V to
          paste
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
            @click="openSettingsPanel"
            :icon="Setting"
            plain
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
            Support PNG, JPG, JPEG, GIF formats • Multiple files & folders
            supported • Use Ctrl+V to paste images
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
              {{ formatFileSize(totalCompressedSize) }}</span
            >
            <span
              class="saved-mini"
              :class="{ 'saved-negative': totalCompressionRatio < 0 }"
            >
              {{ totalCompressionRatio < 0 ? '+' : '-'
              }}{{ Math.abs(totalCompressionRatio).toFixed(1) }}%
            </span>
          </div>
        </div>

        <div class="toolbar-divider" />

        <div class="toolbar-section options-section">
          <div class="exif-option">
            <el-checkbox
              v-model="preserveExif"
              @change="handlePreserveExifChange"
            >
              <span class="exif-label">Preserve EXIF</span>
            </el-checkbox>
          </div>

          <div class="quality-control">
            <span class="quality-label-small"
              >Global Quality: {{ globalQualityPercent }}%</span
            >
            <el-slider
              :model-value="globalQualityPercent"
              @input="handleGlobalQualityInput"
              @change="handleGlobalQualitySliderChange"
              :max="100"
              :step="1"
              :min="1"
              class="global-quality-slider"
              :show-tooltip="false"
              size="small"
            />
          </div>
        </div>

        <div v-if="allCompressed" class="toolbar-divider" />

        <div v-if="allCompressed" class="toolbar-section download-section">
          <button
            class="download-btn-new"
            :class="[{ downloading }]"
            :disabled="downloading"
            title="Download All Compressed Images"
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
                {{
                  downloading
                    ? 'Downloading...'
                    : `Download All (${compressedCount})`
                }}
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
                :src="item.originalUrl"
                :alt="item.file.name"
              />
              <div v-if="item.isCompressing" class="compressing-overlay">
                <el-icon class="is-loading">
                  <Loading />
                </el-icon>
              </div>
              <div v-if="item.compressionError" class="error-overlay">
                <span class="error-text">Error</span>
              </div>
            </div>
            <div class="image-info">
              <div class="image-name">
                {{ item.file.name }}
              </div>
              <div class="image-stats">
                <span class="original-size">{{
                  formatFileSize(item.originalSize)
                }}</span>
                <span class="compressed-size">
                  → {{ formatFileSize(item.compressedSize || 0) }}
                </span>
                <span
                  class="ratio"
                  :class="{
                    'ratio-negative': (item.compressionRatio || 0) < 0,
                  }"
                >
                  ({{ (item.compressionRatio || 0) < 0 ? '+' : '-'
                  }}{{ Math.abs(item.compressionRatio || 0).toFixed(1) }}%)
                </span>
              </div>
              <!-- 独立的质量控制 -->
              <div class="image-quality-control">
                <span class="quality-label-small"
                  >Quality: {{ Math.round(item.quality * 100) }}%</span
                >
                <el-slider
                  :model-value="Math.round(item.quality * 100)"
                  :max="100"
                  :step="1"
                  :min="1"
                  class="image-quality-slider"
                  :show-tooltip="false"
                  size="small"
                  @change="(val: number) => handleImageQualityChange(item, val)"
                />
              </div>
            </div>
            <div class="image-actions">
              <button
                v-if="item.compressedUrl && !item.compressionError"
                class="action-btn-small download-single"
                title="Download this image"
                @click.stop="downloadImage(item)"
              >
                <el-icon>
                  <Download />
                </el-icon>
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
                  currentImage.compressedSize
                    ? formatFileSize(currentImage.compressedSize)
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
              v-if="currentImage.originalUrl && currentImage.compressedUrl"
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
                  transform: `scale(${imageZoom}) translate(${imageTransform.x}px, ${imageTransform.y}px)`,
                  transformOrigin: 'center center',
                }"
                loading="eager"
                decoding="sync"
                @load="handleImageLoad('original')"
                @error="console.error('原图加载失败')"
              />
              <img
                slot="second"
                :src="currentImage.compressedUrl"
                alt="Compressed Image"
                class="comparison-image-fullscreen"
                :style="{
                  transform: `scale(${imageZoom}) translate(${imageTransform.x}px, ${imageTransform.y}px)`,
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
                  transform: `scale(${imageZoom}) translate(${imageTransform.x}px, ${imageTransform.y}px)`,
                  transformOrigin: 'center center',
                }"
                @load="handleImageLoad('original')"
              />
              <div v-if="currentImage.isCompressing" class="preview-overlay">
                <el-icon class="is-loading" size="30px">
                  <Loading />
                </el-icon>
                <div class="overlay-text">Compressing...</div>
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
                    @click="zoomOut"
                    :disabled="imageZoom <= 0.1"
                    title="缩小 (-)"
                  >
                    <el-icon><ZoomOut /></el-icon>
                  </el-button>
                  <span class="zoom-info"
                    >{{ Math.round(imageZoom * 100) }}%</span
                  >
                  <el-button
                    circle
                    size="small"
                    @click="zoomIn"
                    :disabled="imageZoom >= 5"
                    title="放大 (+)"
                  >
                    <el-icon><ZoomIn /></el-icon>
                  </el-button>
                  <el-button
                    circle
                    size="small"
                    @click="resetZoom"
                    title="重置缩放 (0)"
                  >
                    <el-icon><Aim /></el-icon>
                  </el-button>
                  <el-button
                    circle
                    size="small"
                    @click="toggleFullscreen"
                    :title="isFullscreen ? '退出全屏 (Esc)' : '全屏 (Ctrl+F)'"
                  >
                    <el-icon><FullScreen /></el-icon>
                  </el-button>
                </div>
              </div>
              <div class="image-details">
                <span
                  >{{ currentImageIndex + 1 }} / {{ imageItems.length }}</span
                >
                <span>Quality: {{ currentImage.quality }}%</span>
                <span>{{ formatFileSize(currentImage.originalSize) }}</span>
                <span v-if="currentImage.compressedSize">
                  → {{ formatFileSize(currentImage.compressedSize) }}
                </span>
                <span
                  v-if="currentImage.compressionRatio"
                  class="savings"
                  :class="{
                    'savings-negative': currentImage.compressionRatio < 0,
                  }"
                >
                  ({{ currentImage.compressionRatio < 0 ? '+' : '-'
                  }}{{ Math.abs(currentImage.compressionRatio).toFixed(1) }}%)
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
      accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
      multiple
      hidden
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
            <el-icon><Key /></el-icon>
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
                  <el-icon class="tool-icon"><Picture /></el-icon>
                  <span class="tool-name">{{ config.name.toUpperCase() }}</span>
                  <el-tag
                    :type="config.enabled && config.key ? 'success' : 'info'"
                    size="small"
                  >
                    {{ config.enabled && config.key ? 'Enabled' : 'Disabled' }}
                  </el-tag>
                </div>
                <div class="tool-actions">
                  <el-switch
                    v-model="config.enabled"
                    :disabled="!config.key.trim()"
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

                <el-form-item label="API Key">
                  <el-input
                    v-model="config.key"
                    type="password"
                    placeholder="Enter your API key"
                    show-password
                    clearable
                  >
                    <template #prepend>
                      <el-icon><Key /></el-icon>
                    </template>
                  </el-input>
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
            <el-icon><Setting /></el-icon>
            Usage Information
          </h3>
          <div class="usage-info">
            <p>
              • <strong>TinyPNG:</strong> Online service with excellent
              compression for PNG, JPEG, and WebP files
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
          <el-button @click="closeSettingsPanel">Cancel</el-button>
          <el-button type="primary" @click="saveSettings"> Save </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.app-container {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
  overflow-x: hidden;
  min-height: 100vh;
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
  z-index: 2000;
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
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(102, 126, 234, 0.95),
    rgba(118, 75, 162, 0.95)
  );
  backdrop-filter: blur(10px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
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

.quality-control {
  display: flex;
  align-items: center;
  gap: 8px;
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
  height: 8px; /* 增加点击区域高度 */
  cursor: pointer;
  position: relative;
  z-index: 1;
}

/* 确保整个 mini-slider 容器都可交互 */
.mini-slider :deep(.el-slider) {
  position: relative;
  z-index: 1;
  padding: 10px 0; /* 增加上下padding，扩大点击区域 */
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
}

.stats-info {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 45px;
  min-width: 230px; /* 防止数字变化时工具栏抖动 */
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

/* 选项区域 */
.options-section {
  justify-content: center;
  min-width: 120px;
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
}

/* 全局质量滑块 - 与单个图片保持一致的样式 */
.global-quality-slider {
  width: 100%;
}

.global-quality-slider .el-slider__runway {
  height: 4px;
}

.global-quality-slider .el-slider__button {
  width: 12px;
  height: 12px;
}

/* 单个图片质量控制 */
.image-quality-control {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
}

.quality-label-small {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
  display: block;
  margin-bottom: 4px;
}

.image-quality-slider {
  width: 100%;
}

.image-quality-slider .el-slider__runway {
  height: 4px;
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
  display: contents;
  height: 450px;
  /* Safari 兼容性 - object-fit 支持 */
  -o-object-fit: contain;
  object-fit: contain;
  /* 渲染优化 */
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* PC端样式优化 - 避免滚动条 */
@media (min-width: 769px) {
  .app-container {
    overflow-y: hidden; /* PC端完全禁用滚动 */
  }

  .header-section {
    flex-shrink: 0; /* 确保header不会被压缩 */
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
@media (max-width: 1110px) and (min-width: 769px) {
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
@media (max-width: 980px) and (min-width: 769px) {
  .add-btn .btn-text,
  .delete-btn .btn-text {
    display: none;
  }

  .add-btn,
  .delete-btn {
    min-width: 36px;
    justify-content: center;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
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
    flex: 0 0 120px;
    width: 120px;
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

  .image-quality-control {
    margin-top: 6px;
    padding-top: 6px;
  }

  .quality-label-small {
    font-size: 10px;
    margin-bottom: 2px;
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
    min-width: 220px; /* 移动端使用较小的最小宽度 */
    justify-content: center;
  }

  /* 移动端确保按钮文字显示 */
  .download-btn-new .download-text {
    display: inline !important;
  }

  .add-btn .btn-text,
  .delete-btn .btn-text {
    display: inline !important;
  }

  .download-btn-new {
    padding: 12px 16px !important;
    min-width: auto !important;
    justify-content: flex-start !important;
  }

  .add-btn,
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
.comparison-slider-fullscreen {
  opacity: 1 !important;
  visibility: visible !important;
  transition: none !important;
  animation: none !important;
  filter: none !important;
  -webkit-filter: none !important;
}

/* 防止浏览器默认的图片加载动画 */
img-comparison-slider img {
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
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  flex: 0 0 150px;
  width: 150px;
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
  background: rgba(102, 126, 234, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
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
  padding: 8px;
  background: white;
}

.image-name {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: #6b7280;
  margin-bottom: 6px;
}

/* 图片质量控制 */
.image-quality-control {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative; /* 确保正确的层级关系 */
}

/* 确保按钮包装器不会干扰点击 */
:deep(.image-quality-control .el-slider__button-wrapper) {
  top: 50%;
  transform: translateY(-50%) translateX(-50%);
  height: fit-content;
  width: fit-content;
  display: flex;
  cursor: pointer;
  z-index: 3; /* 确保按钮在最上层 */
}

.quality-label-small {
  font-size: 9px;
  color: #6b7280;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: block;
  margin-bottom: 4px;
}

.image-quality-slider {
  --el-slider-height: 6px;
  --el-slider-button-size: 12px;
  --el-slider-main-bg-color: linear-gradient(135deg, #4f46e5, #7c3aed);
  --el-slider-runway-bg-color: rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 120px;
}

/* 确保滑轨可点击 */
.image-quality-slider :deep(.el-slider__runway) {
  height: 6px; /* 增加点击区域高度 */
  cursor: pointer;
  position: relative;
  z-index: 1;
}

/* 确保整个滑动条容器都可交互 */
.image-quality-slider :deep(.el-slider) {
  position: relative;
  z-index: 1;
  padding: 8px 0; /* 增加上下padding，扩大点击区域 */
}

/* 自定义滑块按钮样式 */
.image-quality-slider :deep(.el-slider__button) {
  background: #4f46e5;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3);
  cursor: pointer;
  z-index: 2;
}

.image-quality-slider :deep(.el-slider__button:hover) {
  background: #6366f1;
  border-color: #ffffff;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
  transform: scale(1.1);
}

/* 确保按钮包装器也有足够的点击区域 */
.image-quality-slider :deep(.el-slider__button-wrapper) {
  cursor: pointer;
  z-index: 2;
}

.original-size {
  font-weight: 500;
}

.compressed-size {
  color: #059669;
  font-weight: 500;
}

.ratio {
  color: #16a34a;
  font-weight: 700;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  transition: color 0.2s ease;
}

.ratio.ratio-negative {
  color: #dc2626;
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
  z-index: 1000;
}

/* 全屏模式样式 */
.fullscreen-comparison.fullscreen-mode {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.95);
  z-index: 9999;
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
  z-index: 10000;
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
</style>
