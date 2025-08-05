<script setup lang="ts">
import {
  // @ts-expect-error
  ArrowRight,
  // @ts-expect-error
  CloseBold,
  // @ts-expect-error
  Download,
  // @ts-expect-error
  Loading,
  // @ts-expect-error
  Picture,
  // @ts-expect-error
  View,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { download } from 'lazy-js-utils'
import { computed, h, ref, watch } from 'vue'
import type {
  ConversionComparisonResult,
  EnhancedConvertResult,
  SupportedConvertFormat,
} from '../../../src/formatConverter'
import {
  analyzeFormatConversion,
  convertCompressedToFormats,
  getOptimalFormats,
} from '../../../src/formatConverter'
import type { MultipleCompressResults } from '../../../src/types'

// Props
interface Props {
  visible: boolean
  imageItem?: {
    id: string
    file: File
    originalUrl: string
    compressedUrl?: string
    originalSize: number
    compressedSize?: number
    compressionRatio?: number
    compressedResults?: any
  } | null | undefined
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
  close: []
}>()

// 响应式状态
const isConverting = ref(false)
const conversionMode = ref<'auto' | 'manual'>('auto') // auto: 推荐格式, manual: 手动选择
const selectedFormats = ref<SupportedConvertFormat[]>([])
const conversionResults = ref<ConversionComparisonResult>()
const compressedConvertResults = ref<Array<{ format: SupportedConvertFormat; results: any[] }>>([])
const showComparison = ref(false)
const currentComparisonFormat = ref<SupportedConvertFormat>()

// 支持的格式选项
const availableFormats: Array<{ value: SupportedConvertFormat; label: string; description: string }> = [
  { value: 'webp', label: 'WebP', description: 'Modern format with excellent compression' },
  { value: 'jpeg', label: 'JPEG', description: 'Standard format with good compression' },
  { value: 'jpg', label: 'JPG', description: 'Same as JPEG, different extension' },
  { value: 'png', label: 'PNG', description: 'Lossless format, larger file size' },
]

// 计算属性
const isVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const recommendedFormats = computed(() => {
  if (!props.imageItem?.file) return []
  return getOptimalFormats(props.imageItem.file)
})

const canConvert = computed(() => {
  return props.imageItem?.file && selectedFormats.value.length > 0 && !isConverting.value
})

const totalOriginalSize = computed(() => props.imageItem?.originalSize || 0)

const bestConversionSavings = computed(() => {
  if (!conversionResults.value) return 0
  return conversionResults.value.sizeSavings
})

// 监听图片变化，重置状态
watch(() => props.imageItem?.id, () => {
  conversionResults.value = undefined
  compressedConvertResults.value = []
  showComparison.value = false
  currentComparisonFormat.value = undefined
  
  // 自动选择推荐格式
  if (conversionMode.value === 'auto' && props.imageItem?.file) {
    selectedFormats.value = getOptimalFormats(props.imageItem.file)
  }
})

// 监听转换模式变化
watch(conversionMode, (mode) => {
  if (mode === 'auto' && props.imageItem?.file) {
    selectedFormats.value = getOptimalFormats(props.imageItem.file)
  } else if (mode === 'manual') {
    selectedFormats.value = []
  }
})

// 格式选择变化处理
function handleFormatChange(formats: SupportedConvertFormat[]) {
  selectedFormats.value = formats
}

// 开始转换分析
async function startConversionAnalysis() {
  if (!props.imageItem?.file || selectedFormats.value.length === 0) return

  isConverting.value = true
  conversionResults.value = undefined
  compressedConvertResults.value = []

  try {
    console.log(`Starting format conversion analysis for ${props.imageItem.file.name}`)
    
    // 如果有压缩结果，同时进行压缩结果转换
    const promises: Promise<any>[] = [
      // 策略对比分析（原图转换+压缩）
      analyzeFormatConversion(props.imageItem.file, {
        formats: selectedFormats.value,
        quality: 0.6, // 使用与压缩相同的质量
        analyzeEfficiency: true,
        type: 'blob'
      })
    ]

    // 如果有压缩结果，添加压缩结果转换
    if (props.imageItem.compressedResults) {
      promises.push(
        convertCompressedToFormats(
          props.imageItem.compressedResults,
          selectedFormats.value,
          { quality: 0.9, type: 'blob' }
        )
      )
    }

    const results = await Promise.all(promises)
    
    conversionResults.value = results[0]
    if (results[1]) {
      compressedConvertResults.value = results[1]
    }

    ElMessage({
      message: h('div', [
        h('div', { style: 'font-weight: 600; margin-bottom: 4px;' }, 
          `转换分析完成！已测试 ${selectedFormats.value.length} 种格式`),
        h('div', { style: 'font-size: 13px; color: #059669;' }, 
          `推荐格式: ${conversionResults.value?.recommendedFormat.toUpperCase()}`),
        h('div', { style: 'font-size: 12px; color: #6b7280; margin-top: 2px;' }, 
          `预计节省: ${bestConversionSavings.value.toFixed(1)}%`)
      ]),
      type: 'success',
      duration: 4000
    })

  } catch (error) {
    console.error('Format conversion analysis failed:', error)
    ElMessage({
      message: `格式转换分析失败: ${error instanceof Error ? error.message : '未知错误'}`,
      type: 'error'
    })
  } finally {
    isConverting.value = false
  }
}

// 显示格式对比
function showFormatComparison(format: SupportedConvertFormat) {
  currentComparisonFormat.value = format
  showComparison.value = true
}

// 下载转换结果
async function downloadConvertedFile(format: SupportedConvertFormat, result: any, strategy?: string) {
  try {
    let blob: Blob
    let fileName: string

    if (conversionResults.value) {
      // 从策略分析结果下载
      const conversion = conversionResults.value.conversions.find(c => c.format === format)
      if (!conversion) return

      blob = strategy === 'compress-first' 
        ? conversion.compressFirstResult as Blob
        : strategy === 'convert-first'
        ? conversion.convertFirstResult as Blob
        : conversion.bestResult as Blob

      const suffix = strategy ? `-${strategy}` : '-best'
      fileName = `${props.imageItem!.file.name.replace(/\.[^/.]+$/, '')}${suffix}.${format}`
    } else {
      // 从压缩结果转换下载
      blob = result as Blob
      fileName = `${props.imageItem!.file.name.replace(/\.[^/.]+$/, '')}-compressed.${format}`
    }

    const url = URL.createObjectURL(blob)
    download(url, fileName)
    URL.revokeObjectURL(url)

    ElMessage({
      message: `已下载: ${fileName}`,
      type: 'success',
      duration: 2000
    })
  } catch (error) {
    ElMessage({
      message: '下载失败',
      type: 'error'
    })
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

// 关闭对话框
function closeDialog() {
  isVisible.value = false
  emit('close')
}
</script>

<template>
  <el-dialog
    v-model="isVisible"
    title="格式转换分析"
    width="90%"
    :close-on-click-modal="false"
    class="format-converter-dialog"
    @close="closeDialog"
  >
    <div class="converter-content">
      <!-- 图片信息头部 -->
      <div v-if="imageItem" class="image-header">
        <div class="image-preview">
          <img
            :src="imageItem.originalUrl"
            :alt="imageItem.file.name"
            class="preview-thumb"
          >
        </div>
        <div class="image-info">
          <h3 class="image-name">{{ imageItem.file.name }}</h3>
          <div class="image-details">
            <span class="detail-item">
              原始大小: {{ formatFileSize(imageItem.originalSize) }}
            </span>
            <span v-if="imageItem.compressedSize" class="detail-item">
              压缩后: {{ formatFileSize(imageItem.compressedSize) }}
            </span>
            <span v-if="imageItem.compressionRatio" class="detail-item success">
              节省: {{ Math.abs(imageItem.compressionRatio).toFixed(1) }}%
            </span>
          </div>
        </div>
      </div>

      <!-- 转换模式选择 -->
      <div class="conversion-mode">
        <h4 class="section-title">转换模式</h4>
        <el-radio-group v-model="conversionMode" class="mode-group">
          <el-radio-button label="auto">智能推荐</el-radio-button>
          <el-radio-button label="manual">手动选择</el-radio-button>
        </el-radio-group>
        
        <div v-if="conversionMode === 'auto'" class="mode-description">
          <span class="description-text">
            系统将根据原图格式自动推荐最优转换格式
          </span>
          <div v-if="recommendedFormats.length > 0" class="recommended-formats">
            推荐: 
            <el-tag
              v-for="format in recommendedFormats"
              :key="format"
              size="small"
              type="success"
              class="format-tag"
            >
              {{ format.toUpperCase() }}
            </el-tag>
          </div>
        </div>
      </div>

      <!-- 格式选择 -->
      <div class="format-selection">
        <h4 class="section-title">目标格式</h4>
        <div class="format-options">
          <el-checkbox-group
            :model-value="selectedFormats"
            @change="handleFormatChange"
            :disabled="conversionMode === 'auto' || isConverting"
          >
            <div
              v-for="format in availableFormats"
              :key="format.value"
              class="format-option"
            >
              <el-checkbox
                :label="format.value"
                :disabled="imageItem?.file.type.includes(format.value)"
              >
                <div class="format-info">
                  <span class="format-name">{{ format.label }}</span>
                  <span class="format-desc">{{ format.description }}</span>
                </div>
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </div>
      </div>

      <!-- 开始转换按钮 -->
      <div class="conversion-actions">
        <el-button
          type="primary"
          size="large"
          :loading="isConverting"
          :disabled="!canConvert"
          @click="startConversionAnalysis"
        >
          <el-icon v-if="!isConverting"><Picture /></el-icon>
          {{ isConverting ? '分析中...' : '开始格式转换分析' }}
        </el-button>
        
        <div v-if="selectedFormats.length > 0" class="selected-formats">
          将测试格式: 
          <el-tag
            v-for="format in selectedFormats"
            :key="format"
            class="selected-format-tag"
            size="small"
          >
            {{ format.toUpperCase() }}
          </el-tag>
        </div>
      </div>

      <!-- 转换结果 -->
      <div v-if="conversionResults || compressedConvertResults.length > 0" class="conversion-results">
        <!-- 策略分析结果 -->
        <div v-if="conversionResults" class="strategy-results">
          <h4 class="section-title">
            <el-icon><View /></el-icon>
            转换策略分析结果
          </h4>
          
          <!-- 推荐结果摘要 -->
          <div class="summary-card">
            <div class="summary-content">
              <div class="recommended-format">
                <span class="label">推荐格式:</span>
                <el-tag type="success" size="large" class="format-highlight">
                  {{ conversionResults.recommendedFormat.toUpperCase() }}
                </el-tag>
              </div>
              <div class="summary-stats">
                <div class="stat-item">
                  <span class="stat-label">预计节省</span>
                  <span class="stat-value success">
                    {{ bestConversionSavings.toFixed(1) }}%
                  </span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">成功格式</span>
                  <span class="stat-value">
                    {{ conversionResults.conversionSummary.successfulFormats }}/{{ conversionResults.conversionSummary.totalFormats }}
                  </span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">平均效率</span>
                  <span class="stat-value">
                    {{ conversionResults.conversionSummary.averageEfficiency.toFixed(0) }}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 详细结果列表 -->
          <div class="detailed-results">
            <div
              v-for="conversion in conversionResults.conversions"
              :key="conversion.format"
              class="conversion-card"
              :class="{ 
                'recommended': conversion.format === conversionResults.recommendedFormat,
                'best-efficiency': conversion.efficiencyScore === conversionResults.conversionSummary.bestEfficiency
              }"
            >
              <div class="conversion-header">
                <div class="format-title">
                  <span class="format-name">{{ conversion.format.toUpperCase() }}</span>
                  <el-tag
                    v-if="conversion.format === conversionResults.recommendedFormat"
                    type="success"
                    size="small"
                  >
                    推荐
                  </el-tag>
                </div>
                <div class="efficiency-score">
                  效率: {{ conversion.efficiencyScore.toFixed(0) }}%
                </div>
              </div>

              <div class="strategy-comparison">
                <div class="strategy-item">
                  <div class="strategy-label">压缩优先</div>
                  <div class="strategy-details">
                    <span class="size">{{ formatFileSize(conversion.compressFirstSize) }}</span>
                    <button
                      class="download-btn"
                      @click="downloadConvertedFile(conversion.format, null, 'compress-first')"
                    >
                      <el-icon><Download /></el-icon>
                    </button>
                  </div>
                </div>

                <div class="strategy-arrow">
                  <el-icon><ArrowRight /></el-icon>
                </div>

                <div class="strategy-item">
                  <div class="strategy-label">转换优先</div>
                  <div class="strategy-details">
                    <span class="size">{{ formatFileSize(conversion.convertFirstSize) }}</span>
                    <button
                      class="download-btn"
                      @click="downloadConvertedFile(conversion.format, null, 'convert-first')"
                    >
                      <el-icon><Download /></el-icon>
                    </button>
                  </div>
                </div>

                <div class="strategy-arrow">
                  <el-icon><ArrowRight /></el-icon>
                </div>

                <div class="strategy-item best">
                  <div class="strategy-label">最佳结果</div>
                  <div class="strategy-details">
                    <span class="size best">{{ formatFileSize(conversion.bestSize) }}</span>
                    <span class="strategy-type">({{ conversion.bestStrategy === 'compress-first' ? '压缩优先' : '转换优先' }})</span>
                    <button
                      class="download-btn primary"
                      @click="downloadConvertedFile(conversion.format, null)"
                    >
                      <el-icon><Download /></el-icon>
                    </button>
                  </div>
                </div>
              </div>

              <div class="conversion-metrics">
                <div class="metric">
                  <span class="metric-label">文件大小</span>
                  <span class="metric-value">{{ formatFileSize(conversion.bestSize) }}</span>
                </div>
                <div class="metric">
                  <span class="metric-label">压缩比</span>
                  <span class="metric-value">
                    {{ ((totalOriginalSize - conversion.bestSize) / totalOriginalSize * 100).toFixed(1) }}%
                  </span>
                </div>
                <div class="metric">
                  <span class="metric-label">质量保留</span>
                  <span class="metric-value">{{ (conversion.qualityRatio * 100).toFixed(0) }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 压缩结果转换 -->
        <div v-if="compressedConvertResults.length > 0" class="compressed-results">
          <h4 class="section-title">
            基于压缩结果的格式转换
          </h4>
          <div class="compressed-results-grid">
            <div
              v-for="formatResult in compressedConvertResults"
              :key="formatResult.format"
              class="compressed-format-card"
            >
              <div class="format-header">
                <h5>{{ formatResult.format.toUpperCase() }}</h5>
                <span class="results-count">{{ formatResult.results.length }} 个结果</span>
              </div>
              <div class="format-results">
                <div
                  v-for="(result, index) in formatResult.results"
                  :key="index"
                  class="result-item"
                  :class="{ success: result.success }"
                >
                  <span class="tool-name">{{ result.tool }}</span>
                  <span v-if="result.success" class="result-size">
                    {{ formatFileSize(result.convertedSize || 0) }}
                  </span>
                  <span v-else class="result-error">失败</span>
                  <button
                    v-if="result.success"
                    class="download-btn small"
                    @click="downloadConvertedFile(formatResult.format, result.result)"
                  >
                    <el-icon><Download /></el-icon>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="closeDialog">关闭</el-button>
        <el-button
          v-if="conversionResults"
          type="primary"
          @click="downloadConvertedFile(conversionResults.recommendedFormat, null)"
        >
          下载推荐格式
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.format-converter-dialog {
  --el-dialog-width: 90%;
  max-width: 1200px;
}

.converter-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-height: 70vh;
  overflow-y: auto;
}

/* 图片信息头部 */
.image-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.image-preview {
  flex-shrink: 0;
}

.preview-thumb {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
  border: 2px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.image-info {
  flex: 1;
}

.image-name {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.image-details {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.detail-item {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
}

.detail-item.success {
  color: #059669;
  font-weight: 600;
}

/* 区域标题 */
.section-title {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 转换模式 */
.conversion-mode {
  padding: 16px;
  background: rgba(99, 102, 241, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.1);
}

.mode-group {
  margin-bottom: 12px;
}

.mode-description {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.description-text {
  font-size: 14px;
  color: #6b7280;
}

.recommended-formats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #059669;
  font-weight: 500;
}

.format-tag {
  margin-left: 4px;
}

/* 格式选择 */
.format-selection {
  padding: 16px;
  background: #f9fafb;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.format-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 12px;
}

.format-option {
  padding: 12px;
  background: white;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  transition: all 0.2s ease;
}

.format-option:hover {
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1);
}

.format-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.format-name {
  font-weight: 600;
  color: #374151;
}

.format-desc {
  font-size: 12px;
  color: #6b7280;
}

/* 转换操作 */
.conversion-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(79, 70, 229, 0.05));
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.1);
}

.selected-formats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #6b7280;
}

.selected-format-tag {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

/* 转换结果 */
.conversion-results {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 摘要卡片 */
.summary-card {
  padding: 20px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 12px;
  color: white;
  box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
}

.summary-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.recommended-format {
  display: flex;
  align-items: center;
  gap: 12px;
}

.label {
  font-size: 16px;
  font-weight: 500;
}

.format-highlight {
  background: rgba(255, 255, 255, 0.2) !important;
  color: white !important;
  border: 1px solid rgba(255, 255, 255, 0.3) !important;
  font-size: 18px !important;
  font-weight: 700 !important;
  padding: 8px 16px !important;
}

.summary-stats {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  opacity: 0.8;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

.stat-value.success {
  color: #d1fae5;
}

/* 详细结果 */
.detailed-results {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.conversion-card {
  padding: 20px;
  background: white;
  border-radius: 12px;
  border: 2px solid rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
}

.conversion-card:hover {
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.1);
}

.conversion-card.recommended {
  border-color: #10b981;
  box-shadow: 0 4px 20px rgba(16, 185, 129, 0.2);
}

.conversion-card.best-efficiency {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.02), rgba(79, 70, 229, 0.02));
}

.conversion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.format-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.format-name {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
}

.efficiency-score {
  font-size: 14px;
  font-weight: 600;
  color: #059669;
  background: rgba(16, 185, 129, 0.1);
  padding: 4px 8px;
  border-radius: 6px;
}

/* 策略对比 */
.strategy-comparison {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
}

.strategy-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: white;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.strategy-item.best {
  border-color: #10b981;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(5, 150, 105, 0.05));
}

.strategy-label {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
  text-align: center;
}

.strategy-details {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.size {
  font-size: 14px;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  color: #374151;
}

.size.best {
  color: #059669;
  font-size: 16px;
}

.strategy-type {
  font-size: 10px;
  color: #6b7280;
}

.strategy-arrow {
  color: #d1d5db;
  font-size: 16px;
}

/* 下载按钮 */
.download-btn {
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  padding: 4px 8px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: all 0.2s ease;
}

.download-btn:hover {
  background: #2563eb;
  transform: translateY(-1px);
}

.download-btn.primary {
  background: #10b981;
}

.download-btn.primary:hover {
  background: #059669;
}

.download-btn.small {
  padding: 2px 4px;
  font-size: 10px;
}

/* 转换指标 */
.conversion-metrics {
  display: flex;
  justify-content: space-around;
  gap: 16px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.metric-label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
}

.metric-value {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

/* 压缩结果转换 */
.compressed-results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.compressed-format-card {
  padding: 16px;
  background: white;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.format-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.format-header h5 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.results-count {
  font-size: 12px;
  color: #6b7280;
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

.format-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.result-item.success {
  background: rgba(16, 185, 129, 0.05);
  border-color: rgba(16, 185, 129, 0.2);
}

.tool-name {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}

.result-size {
  font-size: 11px;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
  color: #059669;
  font-weight: 600;
}

.result-error {
  font-size: 11px;
  color: #dc2626;
  font-weight: 500;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .format-converter-dialog {
    --el-dialog-width: 95%;
  }

  .converter-content {
    max-height: 60vh;
  }

  .image-header {
    flex-direction: column;
    text-align: center;
  }

  .summary-content {
    flex-direction: column;
    gap: 16px;
  }

  .summary-stats {
    justify-content: center;
  }

  .strategy-comparison {
    flex-direction: column;
    gap: 8px;
  }

  .strategy-arrow {
    transform: rotate(90deg);
  }

  .conversion-metrics {
    flex-direction: column;
    gap: 8px;
  }

  .compressed-results-grid {
    grid-template-columns: 1fr;
  }
}
</style>