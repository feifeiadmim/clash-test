/**
 * 统一输出文件处理器
 * 消除重复的输出文件生成逻辑，提供统一的输出接口
 */

import path from 'path';
import fs from 'fs';
import { OutputFormats } from '../types.js';
import { ProxyConverter } from '../index.js';
import { generateSafeFileName, validateNodes } from './common.js';
import { BaseError, ParserErrorHandler } from '../parsers/common/error-handler.js';
import { getConfig } from '../config/default.js';

// 定义输出相关的错误类
class FileProcessError extends BaseError {
  constructor(message, filePath = null, details = null) {
    super(message, 'FILE_PROCESS_ERROR', details);
    this.filePath = filePath;
  }
}

class ConvertError extends BaseError {
  constructor(message, details = null) {
    super(message, 'CONVERT_ERROR', details);
  }
}

// 默认错误处理器
const defaultErrorHandler = {
  handle: (error) => {
    ParserErrorHandler.logError('OUTPUT', 'file_process', error);
  }
};

/**
 * 输出文件生成器类
 */
export class OutputGenerator {
  constructor(options = {}) {
    // 安全验证输出目录
    const rawOutputDir = options.outputDir || getConfig('outputDir', './output');
    this.outputDir = this.validateAndSanitizeOutputDir(rawOutputDir);
    this.converter = new ProxyConverter();
    this.errorHandler = options.errorHandler || defaultErrorHandler;
  }

  /**
   * 验证和清理输出目录路径
   * @private
   * @param {string} outputDir - 原始输出目录
   * @returns {string} 安全的输出目录路径
   */
  validateAndSanitizeOutputDir(outputDir) {
    if (!outputDir || typeof outputDir !== 'string') {
      throw new FileProcessError('输出目录必须是非空字符串');
    }

    // 解析绝对路径
    const resolvedPath = path.resolve(outputDir);

    // 检查危险路径模式
    const dangerousPatterns = [
      /\.\./,           // 父目录遍历
      /[<>:"|?*]/,      // 非法字符
      /[\x00-\x1f]/,    // 控制字符
      /^\/etc/,         // 系统目录
      /^\/var/,         // 系统变量目录
      /^\/tmp/,         // 临时目录
      /^C:\\Windows/i,  // Windows系统目录
      /^C:\\Program/i   // Windows程序目录
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(resolvedPath)) {
        throw new FileProcessError(`不安全的输出目录路径: ${outputDir}`);
      }
    }

    // 确保路径在允许的范围内
    const allowedBasePaths = [
      path.resolve('./output'),
      path.resolve('./temp'),
      path.resolve('./dist'),
      path.resolve(process.cwd(), 'output'),
      path.resolve(process.cwd(), 'temp'),
      path.resolve(process.cwd(), 'dist')
    ];

    const isAllowed = allowedBasePaths.some(basePath =>
      resolvedPath.startsWith(basePath) || resolvedPath === basePath
    );

    if (!isAllowed) {
      console.warn(`⚠️ 输出目录超出允许范围，使用默认目录: ${outputDir}`);
      return path.resolve('./output');
    }

    return resolvedPath;
  }

  /**
   * 验证和清理文件路径
   * @private
   * @param {string} fileName - 文件名
   * @returns {string} 安全的文件路径
   */
  validateAndSanitizeFilePath(fileName) {
    if (!fileName || typeof fileName !== 'string') {
      throw new FileProcessError('文件名必须是非空字符串');
    }

    // 清理文件名中的危险字符
    let sanitizedFileName = fileName
      .replace(/[<>:"|?*]/g, '_')     // 替换非法字符
      .replace(/[\x00-\x1f]/g, '')   // 移除控制字符
      .replace(/\.\./g, '_')         // 替换父目录遍历
      .replace(/^\.+/, '')           // 移除开头的点
      .trim();

    // 文件名长度限制
    if (sanitizedFileName.length > 255) {
      sanitizedFileName = sanitizedFileName.substring(0, 255);
    }

    // 确保文件名不为空
    if (sanitizedFileName.length === 0) {
      sanitizedFileName = 'output_' + Date.now();
    }

    // 构建完整路径
    const fullPath = path.join(this.outputDir, sanitizedFileName);

    // 验证最终路径在输出目录内
    const resolvedPath = path.resolve(fullPath);
    const resolvedOutputDir = path.resolve(this.outputDir);

    if (!resolvedPath.startsWith(resolvedOutputDir)) {
      throw new FileProcessError(`文件路径超出输出目录范围: ${fileName}`);
    }

    return resolvedPath;
  }

  /**
   * 生成多种格式的输出文件
   * @param {Object[]} nodes - 节点数组
   * @param {string[]} outputFormats - 输出格式数组
   * @param {string} filePrefix - 文件前缀
   * @param {string} sourceFormat - 源格式
   * @returns {Promise<Object>} 生成结果
   */
  async generateOutputFiles(nodes, outputFormats, filePrefix, sourceFormat = 'unknown') {
    try {
      // 验证输入参数
      validateNodes(nodes);

      if (!Array.isArray(outputFormats) || outputFormats.length === 0) {
        throw new ConvertError('输出格式数组不能为空');
      }

      console.log('\n💾 生成输出文件...');

      const results = {
        success: [],
        failed: [],
        total: outputFormats.length
      };

      // 确保输出目录存在
      this.ensureOutputDir();

      // 生成每种格式的文件
      for (const format of outputFormats) {
        try {
          const result = await this.generateSingleFormat(nodes, format, filePrefix, sourceFormat);
          results.success.push(result);
          console.log(`✅ ${result.formatName}文件已生成`);
        } catch (error) {
          const errorInfo = {
            format,
            error: error.message,
            formatName: this.getFormatName(format)
          };
          results.failed.push(errorInfo);
          console.error(`❌ 生成${errorInfo.formatName}失败: ${error.message}`);
        }
      }

      return results;
    } catch (error) {
      throw new FileProcessError(`输出文件生成失败: ${error.message}`, null, { nodes: nodes.length, formats: outputFormats });
    }
  }

  /**
   * 生成单一格式的输出文件
   * @param {Object[]} nodes - 节点数组
   * @param {string} format - 输出格式
   * @param {string} filePrefix - 文件前缀
   * @param {string} sourceFormat - 源格式
   * @returns {Promise<Object>} 生成结果
   */
  async generateSingleFormat(nodes, format, filePrefix, sourceFormat) {
    const formatInfo = this.getFormatInfo(format);

    if (!formatInfo) {
      throw new ConvertError(`不支持的输出格式: ${format}`);
    }

    // 生成内容
    const content = await this.generateContent(nodes, format, sourceFormat);

    // 生成安全的文件名
    const fileName = generateSafeFileName(filePrefix + (formatInfo.suffix || ''), formatInfo.extension);
    const outputPath = this.validateAndSanitizeFilePath(fileName);

    // 写入文件
    await this.writeFile(outputPath, content);

    return {
      format,
      formatName: formatInfo.name,
      fileName,
      outputPath,
      size: Buffer.byteLength(content, 'utf8')
    };
  }

  /**
   * 生成指定格式的内容
   * @param {Object[]} nodes - 节点数组
   * @param {string} format - 输出格式
   * @param {string} sourceFormat - 源格式
   * @returns {Promise<string>} 生成的内容
   */
  async generateContent(nodes, format, sourceFormat) {
    switch (format) {
      case OutputFormats.CLASH:
        const { toSimpleClashYaml } = await import('../converters/clash.js');
        return toSimpleClashYaml(nodes, { sourceFormat });

      case OutputFormats.BASE64:
        return this.converter.convert(nodes, OutputFormats.BASE64);

      case OutputFormats.URL:
        return this.converter.convert(nodes, OutputFormats.URL);

      case OutputFormats.JSON:
        const jsonData = this.converter.convert(nodes, OutputFormats.JSON);
        return JSON.stringify(jsonData, null, 2);

      default:
        throw new ConvertError(`不支持的输出格式: ${format}`);
    }
  }

  /**
   * 获取格式信息
   * @param {string} format - 格式名称
   * @returns {Object|null} 格式信息
   */
  getFormatInfo(format) {
    const formatMap = getConfig('outputFormats', {});

    // 标准格式映射
    const standardFormats = {
      [OutputFormats.CLASH]: { extension: 'yaml', name: 'Clash YAML', suffix: '' },
      [OutputFormats.BASE64]: { extension: 'txt', name: 'Base64订阅', suffix: '_base64' },
      [OutputFormats.URL]: { extension: 'txt', name: 'URL列表', suffix: '_urls' },
      [OutputFormats.JSON]: { extension: 'json', name: 'JSON数据', suffix: '' }
    };

    return standardFormats[format] || formatMap[format] || null;
  }

  /**
   * 获取格式名称
   * @param {string} format - 格式
   * @returns {string} 格式名称
   */
  getFormatName(format) {
    const info = this.getFormatInfo(format);
    return info ? info.name : format;
  }

  /**
   * 写入文件（使用安全写入器）
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @returns {Promise<Object>}
   */
  async writeFile(filePath, content) {
    try {
      // 导入安全写入器
      const { writeFileSafe } = await import('./safe-file-writer.js');

      // 使用安全写入器进行原子性写入
      const result = await writeFileSafe(filePath, content, {
        enableBackup: false,
        enableIntegrityCheck: true,
        lockTimeout: 30000
      });

      return result;
    } catch (error) {
      throw new FileProcessError(`安全文件写入失败: ${error.message}`, filePath);
    }
  }

  /**
   * 确保输出目录存在
   */
  ensureOutputDir() {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
    } catch (error) {
      throw new FileProcessError(`创建输出目录失败: ${error.message}`, this.outputDir);
    }
  }

  /**
   * 获取输出文件统计信息
   * @param {string} outputDir - 输出目录
   * @returns {Object} 统计信息
   */
  getOutputStats(outputDir = this.outputDir) {
    try {
      if (!fs.existsSync(outputDir)) {
        return { totalFiles: 0, totalSize: 0, files: [] };
      }

      const files = fs.readdirSync(outputDir);
      const stats = {
        totalFiles: files.length,
        totalSize: 0,
        files: []
      };

      for (const file of files) {
        const filePath = path.join(outputDir, file);
        const fileStat = fs.statSync(filePath);

        stats.files.push({
          name: file,
          size: fileStat.size,
          modified: fileStat.mtime
        });

        stats.totalSize += fileStat.size;
      }

      return stats;
    } catch (error) {
      this.errorHandler.handle(new FileProcessError(`获取输出统计失败: ${error.message}`, outputDir));
      return { totalFiles: 0, totalSize: 0, files: [] };
    }
  }

  /**
   * 清理输出目录
   * @param {string} pattern - 文件名模式（可选）
   * @returns {Promise<number>} 删除的文件数量
   */
  async cleanOutputDir(pattern = null) {
    try {
      if (!fs.existsSync(this.outputDir)) {
        return 0;
      }

      const files = fs.readdirSync(this.outputDir);
      let deletedCount = 0;

      for (const file of files) {
        if (!pattern || file.includes(pattern)) {
          // 安全验证文件路径
          const filePath = this.validateAndSanitizeFilePath(file);

          // 确保文件在输出目录内
          if (filePath.startsWith(path.resolve(this.outputDir))) {
            await fs.promises.unlink(filePath);
            deletedCount++;
          } else {
            console.warn(`⚠️ 跳过不安全的文件路径: ${file}`);
          }
        }
      }

      return deletedCount;
    } catch (error) {
      throw new FileProcessError(`清理输出目录失败: ${error.message}`, this.outputDir);
    }
  }
}

/**
 * 创建默认输出生成器实例
 */
export const defaultOutputGenerator = new OutputGenerator();

/**
 * 便捷函数：生成输出文件
 * @param {Object[]} nodes - 节点数组
 * @param {string[]} outputFormats - 输出格式数组
 * @param {string} filePrefix - 文件前缀
 * @param {string} sourceFormat - 源格式
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 生成结果
 */
export async function generateOutputFiles(nodes, outputFormats, filePrefix, sourceFormat = 'unknown', options = {}) {
  const generator = new OutputGenerator(options);
  return await generator.generateOutputFiles(nodes, outputFormats, filePrefix, sourceFormat);
}

/**
 * 便捷函数：生成单一格式文件
 * @param {Object[]} nodes - 节点数组
 * @param {string} format - 输出格式
 * @param {string} filePrefix - 文件前缀
 * @param {string} sourceFormat - 源格式
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 生成结果
 */
export async function generateSingleFormat(nodes, format, filePrefix, sourceFormat = 'unknown', options = {}) {
  const generator = new OutputGenerator(options);
  return await generator.generateSingleFormat(nodes, format, filePrefix, sourceFormat);
}
