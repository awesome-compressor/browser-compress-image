<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { ElMessage } from 'element-plus'
// @ts-ignore
import { Aim, CloseBold, Download, Refresh, ZoomIn, ZoomOut } from '@element-plus/icons-vue'

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
const emit = defineEmits(['close'])

const originalImgRef = ref<HTMLImageElement | null>(null)
const compressedImgRef = ref<HTMLImageElement | null>(null)
const originalCropper = ref<Cropper | null>(null)
const compressedCropper = ref<Cropper | null>(null)

// sync + zoom state
const syncing = ref(false)
const zoomLevel = ref(1)
const originalDims = ref<{w:number;h:number}|null>(null)
const compressedDims = ref<{w:number;h:number}|null>(null)
// Aspect ratio & export settings
const aspectRatio = ref<number | null>(null) // null => free
const exportFormat = ref<'png'|'jpeg'|'webp'>('png')
let exportQuality = 0.9
const presets = [
  { label: '自由', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4/3 },
  { label: '16:9', value: 16/9 },
  { label: '3:2', value: 3/2 },
]
// Focus mode handling (show only one pane emphasized)
const focusMode = ref<'none'|'original'|'compressed'>('none')
let initialCanvasData: Cropper.CanvasData | null = null

// Mobile layout state
const activeMobilePane = ref<'original'|'compressed'>('original')
const isMobile = ref(false)

function updateIsMobile() {
  isMobile.value = window.innerWidth <= 780
}

function formatSize(bytes?: number) {
  if (bytes == null) return ''
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B','KB','MB','GB','TB']
  const i = Math.floor(Math.log(bytes)/Math.log(k))
  return `${(bytes/Math.pow(k,i)).toFixed(i===0?0:2)} ${sizes[i]}`
}

// prevent wheel native zoom
function preventWheel(e: WheelEvent) {
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
          originalDims.value = { w: originalImgRef.value.naturalWidth, h: originalImgRef.value.naturalHeight }
        }
      },
      crop() {
        if (!syncing.value) syncCrop('original')
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
          compressedDims.value = { w: compressedImgRef.value.naturalWidth, h: compressedImgRef.value.naturalHeight }
        }
      },
      crop() {
        if (!syncing.value) syncCrop('compressed')
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
}

function syncCrop(from: 'original' | 'compressed') {
  const src = from === 'original' ? originalCropper.value : compressedCropper.value
  const dst = from === 'original' ? compressedCropper.value : originalCropper.value
  if (!src || !dst) return
  syncing.value = true
  const box = src.getCropBoxData()
  dst.setCropBoxData({ left: box.left, top: box.top, width: box.width, height: box.height })
  syncing.value = false
}

function applyAspectRatio() {
  const ratio = aspectRatio.value ?? NaN
  originalCropper.value?.setAspectRatio(ratio)
  compressedCropper.value?.setAspectRatio(ratio)
}

// (reserved) setAspect helper kept for potential external triggers
// function setAspect(r: number | null) {
//   aspectRatio.value = r
//   applyAspectRatio()
// }



function applyZoom() {
  if (!originalCropper.value || !compressedCropper.value || !initialCanvasData) return
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
    const mime = exportFormat.value === 'png' ? 'image/png' : exportFormat.value === 'jpeg' ? 'image/jpeg' : 'image/webp'
    const canvas = c.getCroppedCanvas({})
  canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${label}-cropped.${exportFormat.value === 'jpeg' ? 'jpg' : exportFormat.value}`
      a.click()
      URL.revokeObjectURL(url)
  }, mime, exportFormat.value === 'png' ? undefined : exportQuality)
  }
  if (which === 'both') {
    doDownload(originalCropper.value, 'original')
    doDownload(compressedCropper.value, 'compressed')
    ElMessage.success('Downloaded both cropped images')
  } else {
    doDownload(which === 'original' ? originalCropper.value : compressedCropper.value, which)
    ElMessage.success(`Downloaded ${which} cropped image`)
  }
}

function close() {
  emit('close')
  props.onClose?.()
}

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
  } else if (e.key === '+' || e.key === '=') {
    zoomIn(); e.preventDefault()
  } else if (e.key === '-') {
    zoomOut(); e.preventDefault()
  } else if (e.key === '0') {
    resetZoom(); e.preventDefault()
  } else if (e.key.toLowerCase() === 'r') {
    resetAll(); e.preventDefault()
  }
}

onMounted(() => {
  initCroppers()
  window.addEventListener('wheel', preventWheel, { passive: false })
  window.addEventListener('keydown', handleKey)
  updateIsMobile()
  window.addEventListener('resize', updateIsMobile)
})

onBeforeUnmount(() => {
  window.removeEventListener('wheel', preventWheel)
  window.removeEventListener('keydown', handleKey)
  window.removeEventListener('resize', updateIsMobile)
  originalCropper.value?.destroy()
  compressedCropper.value?.destroy()
})
</script>

<template>
  <div class="crop-page" :class="{  'focus-compressed': focusMode==='compressed', 'mobile-layout': isMobile }">
    <div class="crop-header">
      <div class="left">
        <span class="title">Image Crop (同步裁剪)</span>
        <span class="hint">Esc 关闭 · +/- 缩放 · 0 重置 · R 重置全部</span>
      </div>
      <div class="actions">
        <el-tooltip content="Zoom Out" placement="bottom">
          <el-button circle :size="isMobile? 'large':'small'" :disabled="zoomLevel<=0.25" @click="zoomOut"><el-icon><ZoomOut/></el-icon></el-button></el-tooltip>
        <div class="zoom-value">{{ Math.round(zoomLevel*100) }}%</div>
        <el-tooltip content="Zoom In" placement="bottom">
          <el-button circle :size="isMobile? 'large':'small'" style="margin-left: 0;" :disabled="zoomLevel>=5" @click="zoomIn"><el-icon><ZoomIn/></el-icon></el-button></el-tooltip>
        <el-tooltip content="Reset Zoom" placement="bottom"><el-button circle style="margin-left: 0;" :size="isMobile? 'large':'small'" @click="resetZoom"><el-icon><Aim/></el-icon></el-button></el-tooltip>
        <el-tooltip content="Reset All" style="margin-left: 0;" placement="bottom"><el-button  circle :size="isMobile? 'large':'small'" style="margin-left: 0;" @click="resetAll"><el-icon><Refresh/></el-icon></el-button></el-tooltip>
      </div>
      <div style="display: flex; gap: 12px">
         <div class="inline-group">
          <el-select v-model="aspectRatio" size="small" class="ratio-select" placeholder="比例" @change="() => applyAspectRatio()">
            <el-option v-for="p in presets" :key="p.label" :label="p.label" :value="p.value" />
          </el-select>
        </div>
        <el-button type="danger" circle size="small" @click="close"><el-icon><CloseBold/></el-icon></el-button>
      </div>
    </div>
    <div class="crop-body">
      <div class="pane" :class="{ 'mobile-active': !isMobile || activeMobilePane==='original', 'mobile-hidden': isMobile && activeMobilePane!=='original' }">
        <div class="label original">Original</div>
        <div class="inner">
          <img ref="originalImgRef" :src="props.originalUrl" alt="original" draggable="false" />
          <div class="info-bar">
            <div class="name" :title="props.originalName">{{ props.originalName || 'Original' }}</div>
            <div class="meta">
              <span v-if="originalDims">{{ originalDims.w }}×{{ originalDims.h }}</span>
              <span v-if="props.originalSize">{{ formatSize(props.originalSize) }}</span>
            </div>
            <button class="action-btn-small download-single" title="下载裁剪后的原图" @click.stop="download('original')">
              <el-icon><Download/></el-icon>
            </button>
          </div>
        </div>
      </div>
  <div class="pane">
        <div class="label compressed">Compressed</div>
        <div class="inner">
          <img ref="compressedImgRef" :src="props.compressedUrl" alt="compressed" draggable="false" />
          <div class="info-bar">
            <div class="name" :title="props.compressedName">{{ props.compressedName || 'Compressed' }}</div>
            <div class="meta">
              <span v-if="compressedDims">{{ compressedDims.w }}×{{ compressedDims.h }}</span>
              <span v-if="props.compressedSize">{{ formatSize(props.compressedSize) }}</span>
            </div>
            <button class="action-btn-small download-single" title="下载裁剪后的压缩图" @click.stop="download('compressed')">
              <el-icon><Download/></el-icon>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crop-page { min-height: 100vh;position:fixed; inset:0; z-index:400; display:flex; flex-direction:column; background:radial-gradient(circle at 30% 30%, #1f2937, #0f172a); color:#fff; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; overflow:hidden; }
.crop-header { position:fixed; top:0; left:0; right:0; z-index:10; display:flex; align-items:center; flex-wrap: wrap; gap: 10px; justify-content:space-between; padding:10px 120px 10px 18px; background:rgba(15,23,42,0.92); backdrop-filter:blur(18px) saturate(140%); border-bottom:1px solid rgba(255,255,255,0.08); box-shadow:0 4px 18px -2px rgba(0,0,0,0.55); }
.left { display:flex; flex-direction:column; gap:2px; }
.title { font-size:15px; font-weight:600; letter-spacing:0.5px; background:linear-gradient(90deg,#60a5fa,#a78bfa); background-clip:text; -webkit-background-clip:text; -webkit-text-fill-color:transparent; color:transparent; white-space: nowrap; overflow:hidden; text-overflow:ellipsis; }
.hint { font-size:11px; opacity:0.65; }
.actions { display:flex; align-items:center; gap:12px; }
.zoom-value { font-size:12px; min-width:42px; text-align:center; font-weight:600; background:rgba(255,255,255,0.08); padding:4px 8px; border-radius:6px; }
.crop-body { flex:1; display:flex; gap:14px; padding:76px 20px 120px; /* extra bottom padding for info bars */ overflow:auto; height:100%; box-sizing:border-box; }
.pane { flex:1; position:relative; display:flex; flex-direction:column; min-height:0; border:1px solid rgba(255,255,255,0.1); background:linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015)); border-radius:20px; backdrop-filter:blur(8px); overflow:hidden; box-shadow:0 10px 40px -8px rgba(0,0,0,0.55); transition:flex .35s ease, transform .35s ease, opacity .3s; }
.crop-page.focus-original .pane:first-child { flex:1.4; }
.crop-page.focus-original .pane:last-child { flex:0.6; opacity:0.85; }
.crop-page.focus-compressed .pane:last-child { flex:1.4; }
.crop-page.focus-compressed .pane:first-child { flex:0.6; opacity:0.85; }
.crop-page.swapped .crop-body { flex-direction: row-reverse; }
.pane .inner { flex:1; position:relative; display:flex; align-items:center; justify-content:center; overflow:hidden; min-height:0; }
.pane img { max-width:100%; max-height:100%; user-select:none; -webkit-user-drag:none; }
.info-bar { position:absolute; bottom:10px; left:12px; right:12px; display:flex; align-items:center; gap:12px; background:rgba(15,23,42,0.72); backdrop-filter:blur(10px) saturate(160%); padding:10px 14px; border:1px solid rgba(255,255,255,0.12); border-radius:14px; box-shadow:0 4px 14px rgba(0,0,0,0.55); z-index:5; }
:deep(.cropper-drag-box) { cursor: default !important; }
:deep(.cropper-crop-box) { cursor: move; }

/* Header inline controls */
.inline-group { display:flex; align-items:center; gap:10px; }
.ratio-select, .fmt-select { width:110px; }
.quality-wrap { display:flex; align-items:center; gap:6px; min-width:140px; }
.q-label { font-size:12px; opacity:.8; font-weight:600; }
.q-slider { width:120px; --el-slider-height:4px; }
.q-val { font-size:12px; font-family:'SF Mono',monospace; opacity:.85; min-width:34px; text-align:right; }
.info-bar .name { flex:1; font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.info-bar .meta { display:flex; gap:10px; font-size:12px; opacity:.85; font-family:'SF Mono',Monaco,'Consolas',monospace; }
.label { position:absolute; top:10px; left:12px; font-size:11px; font-weight:600; letter-spacing:0.5px; padding:4px 10px; border-radius:20px; text-transform:uppercase; backdrop-filter:blur(6px); box-shadow:0 2px 6px rgba(0,0,0,0.4); }
.label.original { background:linear-gradient(135deg,#3b82f6,#6366f1); }
.label.compressed { background:linear-gradient(135deg,#10b981,#059669); }

/* Reuse app button styles for consistency */
.action-btn-small { background: white; border:1px solid rgba(0,0,0,0.1); border-radius:6px; padding:4px 6px; cursor:pointer; transition:all .2s ease; display:flex; align-items:center; justify-content:center; font-size:12px; }
.action-btn-small:hover { transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,0.15); }
.download-single { color:#059669; border-color:rgba(5,150,105,0.2); }
.download-single:hover { background:#ecfdf5; border-color:rgba(5,150,105,0.4); }
.action-btn-small:active { transform:translateY(0); }

/* Cropper tweaks */
:deep(.cropper-container) { font-size:0; width:100% !important; height:100% !important; max-height:100% !important; z-index:1; }
:deep(.cropper-drag-box) { cursor: default !important; }
:deep(.cropper-crop-box) { cursor: move; }
:deep(.cropper-view-box) { outline:2px solid #fff; outline-offset:0; box-shadow:0 0 0 1px rgba(255,255,255,0.4); border-radius:4px; }
:deep(.cropper-face) { background:rgba(255,255,255,0.05); }
:deep(.cropper-line) { background:rgba(255,255,255,0.7); }
:deep(.cropper-point) { background:#fff; width:8px; height:8px; opacity:0.9; }
:deep(.cropper-center) { display:none; }

/* Animations */
.pane, .crop-header { animation:fadeSlide .35s ease; }
@keyframes fadeSlide { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }

@media (max-width: 1100px) { .crop-body { flex-direction:column; } }

/* Mobile layout refinements */
@media (max-width: 780px) {
  .crop-body { flex-direction:column; padding:70px 10px 90px; gap:12px; overflow:hidden; }
  .mobile-layout .pane { flex:1; }
  .mobile-layout .pane.mobile-active { opacity:1; position:relative; }
  .pane .inner { align-items:center; justify-content:center; }
  .info-bar { bottom:12px; left:10px; right:10px; padding:8px 10px; gap:8px; }
  .info-bar .name { font-size:12px; }
  .info-bar .meta { font-size:11px; gap:6px; }
  .zoom-value { display:none; }
  .crop-header { flex-direction: column;align-items: flex-start; padding: 10px; gap: 18px; }
  .title { font-size:14px; }
  .hint { display:none; }
}
</style>
