import type { ToolConfig } from './types'

export type CompressionDeploymentMode =
  | 'best-effort'
  | 'offline-preferred'
  | 'offline-strict'

export interface CompressionDeploymentConfig {
  mode?: CompressionDeploymentMode
  browserImageCompression?: {
    libURL?: string
  }
  wasm?: {
    baseUrl?: string
    useLocal?: boolean
    allowCdnFallback?: boolean
  }
  networkTools?: {
    allowTinyPng?: boolean
  }
}

export interface ResolvedCompressionDeploymentConfig {
  mode: CompressionDeploymentMode
  browserImageCompression: {
    libURL?: string
  }
  wasm: {
    baseUrl?: string
    useLocal?: boolean
    allowCdnFallback?: boolean
  }
  networkTools: {
    allowTinyPng?: boolean
  }
}

const defaultDeploymentConfig: ResolvedCompressionDeploymentConfig = {
  mode: 'best-effort',
  browserImageCompression: {},
  wasm: {},
  networkTools: {},
}

let deploymentConfig: ResolvedCompressionDeploymentConfig = {
  ...defaultDeploymentConfig,
  browserImageCompression: {
    ...defaultDeploymentConfig.browserImageCompression,
  },
  wasm: { ...defaultDeploymentConfig.wasm },
  networkTools: { ...defaultDeploymentConfig.networkTools },
}

export function configureCompressionDeployment(
  config: CompressionDeploymentConfig = {},
): void {
  deploymentConfig = {
    mode: config.mode ?? defaultDeploymentConfig.mode,
    browserImageCompression: {
      ...defaultDeploymentConfig.browserImageCompression,
      ...config.browserImageCompression,
    },
    wasm: {
      ...defaultDeploymentConfig.wasm,
      ...config.wasm,
    },
    networkTools: {
      ...defaultDeploymentConfig.networkTools,
      ...config.networkTools,
    },
  }
}

export function getCompressionDeploymentConfig(): ResolvedCompressionDeploymentConfig {
  return {
    mode: deploymentConfig.mode,
    browserImageCompression: {
      ...deploymentConfig.browserImageCompression,
    },
    wasm: { ...deploymentConfig.wasm },
    networkTools: { ...deploymentConfig.networkTools },
  }
}

export function getBrowserImageCompressionLibURL(): string | undefined {
  return deploymentConfig.browserImageCompression.libURL
}

export function canUseNetworkTool(toolName: string): boolean {
  if (toolName !== 'tinypng') {
    return true
  }

  if (deploymentConfig.mode === 'offline-strict') {
    return false
  }

  if (deploymentConfig.mode === 'offline-preferred') {
    return deploymentConfig.networkTools.allowTinyPng === true
  }

  return deploymentConfig.networkTools.allowTinyPng !== false
}

export function filterDeploymentBlockedTools<T extends string>(
  tools: T[],
): T[] {
  return tools.filter((tool) => canUseNetworkTool(tool))
}

export function mergeDeploymentToolConfigs(
  toolConfigs: ToolConfig[],
): ToolConfig[] {
  const libURL = getBrowserImageCompressionLibURL()

  if (!libURL) {
    return toolConfigs
  }

  const existingIndex = toolConfigs.findIndex(
    (config) => config.name === 'browser-image-compression',
  )

  if (existingIndex === -1) {
    return [
      ...toolConfigs,
      {
        name: 'browser-image-compression',
        libURL,
      },
    ]
  }

  const nextConfigs = [...toolConfigs]
  nextConfigs[existingIndex] = {
    libURL,
    ...nextConfigs[existingIndex],
  }
  return nextConfigs
}
