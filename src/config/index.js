/**
 * 配置管理入口文件
 * 统一管理所有环境配置，提供配置加载和切换功能
 */

import { DEFAULT_CONFIG, CONFIG_PRESETS, ConfigManager } from './default.js';
import DEVELOPMENT_CONFIG from './development.js';
import PRODUCTION_CONFIG from './production.js';
import TEST_CONFIG from './test.js';

/**
 * 环境配置映射
 */
export const ENVIRONMENT_CONFIGS = {
  development: DEVELOPMENT_CONFIG,
  production: PRODUCTION_CONFIG,
  test: TEST_CONFIG,
  default: DEFAULT_CONFIG
};

/**
 * 配置加载器
 * 根据环境变量或参数加载相应配置
 */
export class ConfigLoader {
  static currentEnvironment = 'development';
  static currentConfig = DEFAULT_CONFIG;

  /**
   * 加载环境配置
   * @param {string} environment - 环境名称
   * @returns {Object} 配置对象
   */
  static loadEnvironmentConfig(environment = null) {
    // 自动检测环境
    if (!environment) {
      environment = this.detectEnvironment();
    }

    const config = ENVIRONMENT_CONFIGS[environment];
    if (!config) {
      console.warn(`⚠️ 未找到环境配置: ${environment}，使用默认配置`);
      return DEFAULT_CONFIG;
    }

    this.currentEnvironment = environment;
    this.currentConfig = config;

    console.log(`🔧 加载${environment}环境配置`);
    return config;
  }

  /**
   * 自动检测环境
   * @returns {string} 环境名称
   */
  static detectEnvironment() {
    // 检查环境变量
    if (typeof process !== 'undefined' && process.env) {
      const nodeEnv = process.env.NODE_ENV;
      if (nodeEnv) {
        return nodeEnv.toLowerCase();
      }
    }

    // 检查命令行参数
    if (typeof process !== 'undefined' && process.argv) {
      const envArg = process.argv.find(arg => arg.startsWith('--env='));
      if (envArg) {
        return envArg.split('=')[1].toLowerCase();
      }
    }

    // 默认开发环境
    return 'development';
  }

  /**
   * 获取当前配置
   * @returns {Object} 当前配置
   */
  static getCurrentConfig() {
    return this.currentConfig;
  }

  /**
   * 获取当前环境
   * @returns {string} 当前环境
   */
  static getCurrentEnvironment() {
    return this.currentEnvironment;
  }

  /**
   * 应用配置预设
   * @param {string} presetName - 预设名称
   * @returns {Object} 应用预设后的配置
   */
  static applyPreset(presetName) {
    const preset = CONFIG_PRESETS[presetName];
    if (!preset) {
      console.warn(`⚠️ 未找到配置预设: ${presetName}`);
      return this.currentConfig;
    }

    const { mergeConfig } = await import('./default.js');
    this.currentConfig = mergeConfig(preset, this.currentConfig);
    
    console.log(`🎯 应用配置预设: ${presetName}`);
    return this.currentConfig;
  }

  /**
   * 创建自定义配置
   * @param {Object} customConfig - 自定义配置
   * @param {string} baseEnvironment - 基础环境
   * @returns {Object} 合并后的配置
   */
  static createCustomConfig(customConfig, baseEnvironment = 'default') {
    const baseConfig = ENVIRONMENT_CONFIGS[baseEnvironment] || DEFAULT_CONFIG;
    const { mergeConfig } = await import('./default.js');
    
    return mergeConfig(customConfig, baseConfig);
  }

  /**
   * 验证配置
   * @param {Object} config - 要验证的配置
   * @returns {Object} 验证结果
   */
  static validateConfig(config = null) {
    const targetConfig = config || this.currentConfig;
    const { validateConfigAdvanced } = await import('./default.js');
    
    return validateConfigAdvanced(targetConfig);
  }

  /**
   * 获取配置摘要
   * @returns {Object} 配置摘要
   */
  static getConfigSummary() {
    return {
      environment: this.currentEnvironment,
      performance: this.currentConfig.performance,
      logging: this.currentConfig.logging,
      cache: this.currentConfig.cache,
      validation: this.currentConfig.validation,
      directories: {
        inputDir: this.currentConfig.inputDir,
        outputDir: this.currentConfig.outputDir,
        tempDir: this.currentConfig.tempDir,
        logDir: this.currentConfig.logDir
      }
    };
  }

  /**
   * 重置配置
   */
  static reset() {
    this.currentEnvironment = 'development';
    this.currentConfig = DEFAULT_CONFIG;
    ConfigManager.reset();
  }
}

/**
 * 便捷函数：加载配置
 * @param {string} environment - 环境名称
 * @returns {Object} 配置对象
 */
export function loadConfig(environment = null) {
  return ConfigLoader.loadEnvironmentConfig(environment);
}

/**
 * 便捷函数：获取当前配置
 * @returns {Object} 当前配置
 */
export function getCurrentConfig() {
  return ConfigLoader.getCurrentConfig();
}

/**
 * 便捷函数：应用预设
 * @param {string} presetName - 预设名称
 * @returns {Object} 应用预设后的配置
 */
export function applyPreset(presetName) {
  return ConfigLoader.applyPreset(presetName);
}

/**
 * 便捷函数：创建自定义配置
 * @param {Object} customConfig - 自定义配置
 * @param {string} baseEnvironment - 基础环境
 * @returns {Object} 合并后的配置
 */
export function createCustomConfig(customConfig, baseEnvironment = 'default') {
  return ConfigLoader.createCustomConfig(customConfig, baseEnvironment);
}

// 导出所有配置
export {
  DEFAULT_CONFIG,
  DEVELOPMENT_CONFIG,
  PRODUCTION_CONFIG,
  TEST_CONFIG,
  CONFIG_PRESETS,
  ConfigManager
};

// 自动加载环境配置
const autoLoadedConfig = ConfigLoader.loadEnvironmentConfig();

// 导出当前配置作为默认导出
export default autoLoadedConfig;
