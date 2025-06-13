/**
 * 文件处理公共模块（移至parsers/common统一管理）
 * 提取process-files.js和merge-files.js中的重复逻辑
 * 减少代码重复，提高维护性
 */

import fs from 'fs';
import path from 'path';
import { converter, OutputFormats } from '../../index.js';
import { CONFIG } from '../../config/default.js';

/**
 * 通用文件处理器
 * 统一处理解析、去重、重命名等逻辑
 */
export class CommonFileProcessor {
  constructor(options = {}) {
    this.converter = converter;
    this.options = {
      enableValidation: true,
      enableStats: true,
      enableProgress: true,
      ...options
    };
  }

  /**
   * 解析节点的通用逻辑
   * @param {string} content - 文件内容
   * @param {string} inputFormat - 输入格式
   * @returns {Object[]} 解析后的节点数组
   */
  async parseNodes(content, inputFormat) {
    if (this.options.enableProgress) {
      console.log('🔍 解析节点...');
    }

    const parseFormat = this.getParseFormat(inputFormat);
    const nodes = this.converter.parse(content, parseFormat);

    // 安全检查：确保nodes是数组
    if (!nodes || !Array.isArray(nodes)) {
      if (this.options.enableProgress) {
        console.log('⚠️ 解析失败，返回空数组');
      }
      return [];
    }

    if (this.options.enableProgress) {
      console.log(`✅ 解析完成，共 ${nodes.length} 个节点`);
    }

    if (nodes.length === 0) {
      if (this.options.enableProgress) {
        console.log('⚠️ 没有找到有效节点');
      }
      return [];
    }

    // 验证节点
    if (this.options.enableValidation) {
      this.validateNodes(nodes);
    }

    return nodes;
  }

  /**
   * 处理节点的通用逻辑（去重、重命名）
   * @param {Object[]} nodes - 节点数组
   * @param {Object} processOptions - 处理选项
   * @returns {Object[]} 处理后的节点数组
   */
  async processNodes(nodes, processOptions = {}) {
    if (this.options.enableProgress) {
      console.log('\n🔄 处理节点...');
    }

    // 安全检查：确保nodes是数组
    if (!nodes || !Array.isArray(nodes)) {
      if (this.options.enableProgress) {
        console.log('⚠️ 输入节点无效，返回空数组');
      }
      return [];
    }

    let processedNodes = [...nodes];

    // 去重
    if (processOptions.deduplicate !== false) {
      const originalCount = processedNodes.length;
      processedNodes = this.converter.deduplicate(
        processedNodes,
        processOptions.deduplicateOptions || {}
      );

      if (this.options.enableProgress) {
        console.log(`✅ 去重完成: ${originalCount} → ${processedNodes.length} (移除 ${originalCount - processedNodes.length} 个重复)`);
      }
    }

    // 重命名
    if (processOptions.rename !== false) {
      processedNodes = this.converter.rename(
        processedNodes,
        processOptions.renameOptions || {}
      );

      if (this.options.enableProgress) {
        console.log(`✅ 重命名完成`);
      }
    }

    return processedNodes;
  }

  /**
   * 生成输出文件的通用逻辑
   * @param {Object[]} nodes - 节点数组
   * @param {string[]} outputFormats - 输出格式数组
   * @param {string} baseFileName - 基础文件名
   * @param {string} inputFormat - 输入格式
   */
  async generateOutputFiles(nodes, outputFormats, baseFileName, inputFormat) {
    if (this.options.enableProgress) {
      console.log('\n💾 生成输出文件...');
    }

    const formatConfigs = this.getOutputFormatConfigs(inputFormat);

    for (const format of outputFormats) {
      const config = formatConfigs[format];
      if (!config) continue;

      try {
        const content = await config.generate(nodes);
        if (content === null) continue; // 跳过重复格式

        const outputFile = path.join(CONFIG.outputDir, `${baseFileName}_${config.extension}`);
        this.writeFile(outputFile, content);

        if (this.options.enableProgress) {
          console.log(`✅ 生成${config.name}: ${path.basename(outputFile)}`);
        }
      } catch (error) {
        console.error(`❌ 生成${config.name}失败:`, error.message);
      }
    }
  }

  /**
   * 获取输出格式配置
   * @param {string} inputFormat - 输入格式
   * @returns {Object} 格式配置对象
   */
  getOutputFormatConfigs(inputFormat) {
    return {
      [OutputFormats.CLASH]: {
        name: 'Clash YAML',
        extension: 'clash.yaml',
        generate: async (nodes) => {
          // 在合并操作中，即使输入格式是clash，也需要生成输出文件
          const { toSimpleClashYaml } = await import('../../converters/clash.js');
          return toSimpleClashYaml(nodes, { sourceFormat: inputFormat });
        }
      },
      [OutputFormats.URL]: {
        name: 'URL列表',
        extension: 'urls.txt',
        generate: (nodes) => {
          if (inputFormat === 'url') return null; // 避免重复转换
          return this.converter.convert(nodes, OutputFormats.URL);
        }
      },
      [OutputFormats.BASE64]: {
        name: 'Base64订阅',
        extension: 'base64.txt',
        generate: (nodes) => {
          if (inputFormat === 'base64') return null; // 避免重复转换
          return this.converter.convert(nodes, OutputFormats.BASE64);
        }
      },
      [OutputFormats.JSON]: {
        name: 'JSON数据',
        extension: 'nodes.json',
        generate: (nodes) => {
          return JSON.stringify(this.converter.convert(nodes, OutputFormats.JSON), null, 2);
        }
      }
    };
  }

  /**
   * 获取解析格式
   * @param {string} inputFormat - 输入格式
   * @returns {string} 解析格式
   */
  getParseFormat(inputFormat) {
    const formatMap = {
      'clash': 'clash',
      'base64': 'base64',
      'url': 'url',
      'yaml': 'clash',
      'txt': 'url'
    };
    return formatMap[inputFormat] || inputFormat;
  }

  /**
   * 验证节点
   * @param {Object[]} nodes - 节点数组
   */
  validateNodes(nodes) {
    const validNodes = nodes.filter(node => this.converter.validateNode(node));
    const invalidCount = nodes.length - validNodes.length;

    if (invalidCount > 0 && this.options.enableProgress) {
      console.log(`⚠️ 发现 ${invalidCount} 个无效节点`);
    }
  }

  /**
   * 写入文件（使用安全写入器）
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   */
  async writeFile(filePath, content) {
    try {
      // 导入安全写入器
      const { writeFileSafe } = await import('../../utils/safe-file-writer.js');

      // 使用安全写入器进行原子性写入
      const result = await writeFileSafe(filePath, content, {
        enableBackup: false,
        enableIntegrityCheck: true,
        lockTimeout: 30000
      });

      console.log(`✅ 文件已安全保存: ${path.basename(filePath)} (${result.size} bytes)`);
      return result;
    } catch (error) {
      console.error(`❌ 安全写入文件失败: ${filePath}`, error.message);
      throw error;
    }
  }

  /**
   * 读取文件内容
   * @param {string} filePath - 文件路径
   * @returns {string|null} 文件内容
   */
  readFileContent(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error(`❌ 读取文件失败: ${filePath}`, error.message);
      return null;
    }
  }

  /**
   * 检测文件格式
   * @param {string} content - 文件内容
   * @param {string} fileName - 文件名
   * @returns {string} 检测到的格式
   */
  detectFileFormat(content, fileName) {
    // 基于文件扩展名的初步判断
    const ext = path.extname(fileName).toLowerCase();

    if (ext === '.yaml' || ext === '.yml') {
      return 'clash';
    }

    if (ext === '.txt') {
      // 检查内容判断是URL还是Base64
      const lines = content.trim().split('\n').filter(line => line.trim());
      if (lines.length > 0) {
        const firstLine = lines[0].trim();
        if (firstLine.includes('://')) {
          return 'url';
        } else {
          return 'base64';
        }
      }
    }

    // 基于内容的判断
    if (content.includes('proxies:') || content.includes('proxy-groups:')) {
      return 'clash';
    }

    if (content.includes('://')) {
      return 'url';
    }

    // 尝试Base64解码
    try {
      const decoded = Buffer.from(content.trim(), 'base64').toString('utf8');
      if (decoded.includes('://')) {
        return 'base64';
      }
    } catch (error) {
      // 不是有效的Base64
    }

    return 'unknown';
  }

  /**
   * 生成统计信息
   * @param {Object[]} nodes - 节点数组
   * @returns {Object} 统计信息
   */
  generateStats(nodes) {
    if (!this.options.enableStats) {
      // 即使禁用统计，也返回基础信息
      return {
        total: nodes ? nodes.length : 0,
        types: {},
        regions: {}
      };
    }

    try {
      const stats = this.converter.getStats(nodes);
      return stats || {
        total: nodes ? nodes.length : 0,
        types: {},
        regions: {}
      };
    } catch (error) {
      console.warn('⚠️ 生成统计信息失败:', error.message);
      return {
        total: nodes ? nodes.length : 0,
        types: {},
        regions: {}
      };
    }
  }

  /**
   * 显示统计信息
   * @param {Object} stats - 统计信息
   */
  displayStats(stats) {
    if (!stats || !this.options.enableProgress) {
      return;
    }

    console.log('\n📊 节点统计:');
    console.log(`  总数: ${stats.total}`);

    if (stats.types) {
      console.log('  协议分布:');
      Object.entries(stats.types).forEach(([type, count]) => {
        console.log(`    ${type}: ${count}`);
      });
    }

    if (stats.regions) {
      console.log('  地区分布:');
      Object.entries(stats.regions).forEach(([region, count]) => {
        console.log(`    ${region}: ${count}`);
      });
    }
  }
}

/**
 * 创建全局文件处理器实例
 */
export const globalFileProcessor = new CommonFileProcessor();

/**
 * 便捷函数：处理单个文件
 * @param {string} filePath - 文件路径
 * @param {Object} options - 处理选项
 * @returns {Promise<Object[]>} 处理后的节点数组
 */
export async function processFileCommon(filePath, options = {}) {
  const processor = new CommonFileProcessor(options);

  const content = processor.readFileContent(filePath);
  if (!content) return [];

  const fileName = path.basename(filePath);
  const inputFormat = processor.detectFileFormat(content, fileName);

  if (inputFormat === 'unknown') {
    console.log('⚠️ 无法识别文件格式');
    return [];
  }

  const nodes = await processor.parseNodes(content, inputFormat);
  if (nodes.length === 0) return [];

  const processedNodes = await processor.processNodes(nodes, options);

  if (options.generateOutput !== false) {
    const baseFileName = path.parse(fileName).name;
    const outputFormats = options.outputFormats || [OutputFormats.CLASH, OutputFormats.URL, OutputFormats.BASE64, OutputFormats.JSON];
    await processor.generateOutputFiles(processedNodes, outputFormats, baseFileName, inputFormat);
  }

  return processedNodes;
}
