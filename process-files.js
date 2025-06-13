#!/usr/bin/env node

/**
 * 订阅文件处理工具
 * 用于处理 tests 文件夹中的订阅文件
 */

import fs from 'fs';
import path from 'path';
import { ProxyConverter } from './src/index.js';
import { OutputFormats } from './src/types.js';
import {
  getParseFormat,
  displayNodeList,
  displayRenamedNodeList,
  displayNodeStats,
  displayProcessProgress,
  validateNodes
} from './src/utils/common.js';
import { generateOutputFiles } from './src/utils/output.js';
import { CONFIG as DEFAULT_CONFIG } from './src/config/default.js';
import { ParserErrorHandler, BaseError } from './src/parsers/common/error-handler.js';
import { CommonFileProcessor, processFileCommon } from './src/parsers/common/file-processor.js';

// 使用统一配置
const CONFIG = DEFAULT_CONFIG;

/**
 * 确保输出目录存在
 */
function ensureOutputDir() {
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    console.log(`✅ 创建输出目录: ${CONFIG.outputDir}`);
  }
}

/**
 * 读取文件内容
 * @param {string} filePath - 文件路径
 * @returns {string} 文件内容
 */
function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`❌ 读取文件失败: ${filePath}`, error.message);
    return null;
  }
}

/**
 * 写入文件
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 */
function writeFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ 文件已保存: ${filePath}`);
  } catch (error) {
    console.error(`❌ 保存文件失败: ${filePath}`, error.message);
  }
}

/**
 * 检测文件格式
 * @param {string} content - 文件内容
 * @param {string} fileName - 文件名
 * @returns {string} 格式类型
 */
function detectFileFormat(content, fileName) {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    return 'clash';
  }

  if (ext === '.txt') {
    // 检查是否为Base64
    if (content.trim().split('\n').length === 1 && content.length > 100) {
      try {
        atob(content.trim());
        return 'base64';
      } catch (e) {
        // 不是Base64，检查是否为URL列表
      }
    }

    // 检查是否为URL列表
    const lines = content.split('\n').filter(line => line.trim());
    const proxyPrefixes = ['ss://', 'ssr://', 'vmess://', 'vless://', 'trojan://', 'hysteria://', 'hysteria2://', 'hy2://', 'tuic://', 'snell://'];
    const hasProxyUrls = lines.some(line =>
      proxyPrefixes.some(prefix => line.trim().startsWith(prefix))
    );

    if (hasProxyUrls) {
      return 'url';
    }
  }

  return 'unknown';
}

/**
 * 处理单个文件（重构版本 - 使用公共模块）
 * @param {string} inputFile - 输入文件路径
 * @param {Object} options - 处理选项
 */
async function processFile(inputFile, options = {}) {
  const fileName = path.basename(inputFile);
  console.log(`\n📁 处理文件: ${fileName}`);
  console.log('─'.repeat(50));

  try {
    // 使用公共文件处理器
    const processor = new CommonFileProcessor({
      enableValidation: true,
      enableStats: true,
      enableProgress: true
    });

    // 读取和检测文件
    const content = processor.readFileContent(inputFile);
    if (!content) return;

    const inputFormat = processor.detectFileFormat(content, fileName);
    console.log(`📋 检测到格式: ${inputFormat}`);

    if (inputFormat === 'unknown') {
      console.log('⚠️ 无法识别文件格式，跳过处理');
      return;
    }

    // 解析节点
    const nodes = await processor.parseNodes(content, inputFormat);
    if (nodes.length === 0) return;

    // 显示解析到的节点
    displayNodeList(nodes);

    // 合并处理选项
    const processOptions = { ...CONFIG.defaultOptions, ...options };

    // 处理节点（去重、重命名）
    const processedNodes = await processor.processNodes(nodes, processOptions);

    // 显示重命名后的节点
    if (processOptions.rename) {
      displayRenamedNodeList(processedNodes);
    }

    // 生成和显示统计信息
    const stats = processor.generateStats(processedNodes);
    processor.displayStats(stats);

    // 生成输出文件
    const fileNameWithoutExt = path.parse(fileName).name;
    const outputFormats = [OutputFormats.CLASH, OutputFormats.URL, OutputFormats.BASE64, OutputFormats.JSON];
    await processor.generateOutputFiles(processedNodes, outputFormats, fileNameWithoutExt, inputFormat);

    console.log(`✅ ${fileName} 处理完成！`);

  } catch (error) {
    console.error(`❌ 处理文件失败: ${fileName}`, error.message);
  }
}

/**
 * 处理所有文件
 */
async function processAllFiles() {
  console.log('🚀 代理节点文件处理工具');
  console.log('='.repeat(50));

  // 确保输出目录存在
  ensureOutputDir();

  // 扫描输入目录
  const inputFiles = [];

  try {
    const files = fs.readdirSync(CONFIG.inputDir);
    for (const file of files) {
      const filePath = path.join(CONFIG.inputDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile() && file !== 'test.js') {
        inputFiles.push(filePath);
      }
    }
  } catch (error) {
    console.error(`❌ 读取输入目录失败: ${CONFIG.inputDir}`, error.message);
    return;
  }

  if (inputFiles.length === 0) {
    console.log(`⚠️ 在 ${CONFIG.inputDir} 目录中没有找到订阅文件`);
    return;
  }

  console.log(`📂 找到 ${inputFiles.length} 个文件:`);
  inputFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${path.basename(file)}`);
  });

  // 处理每个文件
  for (const inputFile of inputFiles) {
    await processFile(inputFile);
  }

  console.log('\n🎉 所有文件处理完成！');
  console.log(`📁 输出文件保存在: ${CONFIG.outputDir}`);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // 处理指定文件
    const fileName = args[0];
    const inputFile = path.join(CONFIG.inputDir, fileName);

    if (!fs.existsSync(inputFile)) {
      console.error(`❌ 文件不存在: ${inputFile}`);
      return;
    }

    ensureOutputDir();
    await processFile(inputFile);
  } else {
    // 处理所有文件
    await processAllFiles();
  }
}

/**
 * 带配置的处理所有文件
 */
async function processAllFilesWithConfig(customConfig = {}) {
  console.log('🚀 代理节点文件处理工具 (自定义配置)');
  console.log('='.repeat(50));

  // 确保输出目录存在
  ensureOutputDir();

  // 扫描输入目录
  const inputFiles = [];

  try {
    const files = fs.readdirSync(CONFIG.inputDir);
    for (const file of files) {
      const filePath = path.join(CONFIG.inputDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile() && file !== 'test.js') {
        inputFiles.push(filePath);
      }
    }
  } catch (error) {
    console.error(`❌ 读取输入目录失败: ${CONFIG.inputDir}`, error.message);
    return;
  }

  if (inputFiles.length === 0) {
    console.log(`⚠️ 在 ${CONFIG.inputDir} 目录中没有找到订阅文件`);
    return;
  }

  console.log(`📂 找到 ${inputFiles.length} 个文件:`);
  inputFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${path.basename(file)}`);
  });

  // 处理每个文件
  for (const inputFile of inputFiles) {
    await processFileWithConfig(inputFile, customConfig);
  }

  console.log('\n🎉 所有文件处理完成！');
  console.log(`📁 输出文件保存在: ${CONFIG.outputDir}`);
}

/**
 * 带配置的处理单个文件
 */
async function processFileWithConfig(inputFile, customConfig = {}) {
  const fileName = path.basename(inputFile);
  const fileNameWithoutExt = path.parse(fileName).name;

  console.log(`\n📁 处理文件: ${fileName}`);
  console.log('─'.repeat(50));

  // 读取文件
  const content = readFileContent(inputFile);
  if (!content) {
    return;
  }

  // 检测格式
  const inputFormat = detectFileFormat(content, fileName);
  console.log(`📋 检测到格式: ${inputFormat}`);

  if (inputFormat === 'unknown') {
    console.log('⚠️ 无法识别文件格式，跳过处理');
    return;
  }

  // 创建转换器
  const converter = new ProxyConverter();

  try {
    // 解析节点
    console.log('🔍 解析节点...');

    const parseFormat = getParseFormat(inputFormat);
    const nodes = converter.parse(content, parseFormat);
    console.log(`✅ 解析完成，共 ${nodes.length} 个节点`);

    if (nodes.length === 0) {
      console.log('⚠️ 没有找到有效节点');
      return;
    }

    // 验证节点
    validateNodes(nodes);

    // 显示解析到的节点
    displayNodeList(nodes);

    // 合并处理选项
    const processOptions = {
      ...CONFIG.defaultOptions,
      ...customConfig
    };

    // 确保去重选项正确合并
    if (customConfig.deduplicateOptions) {
      processOptions.deduplicateOptions = {
        ...CONFIG.defaultOptions.deduplicateOptions,
        ...customConfig.deduplicateOptions
      };
    }

    // 处理节点
    console.log('\n🔄 处理节点...');

    // 去重
    let processedNodes = nodes;
    if (processOptions.deduplicate !== false) {
      const originalCount = processedNodes.length;
      processedNodes = converter.deduplicate(processedNodes, processOptions.deduplicateOptions);
      console.log(`✅ 去重完成: ${originalCount} → ${processedNodes.length} (移除 ${originalCount - processedNodes.length} 个重复)`);
    }

    // 重命名
    if (processOptions.rename !== false) {
      processedNodes = converter.rename(processedNodes, CONFIG.defaultOptions.renameOptions);
      console.log(`✅ 重命名完成`);

      // 显示重命名后的节点
      displayRenamedNodeList(processedNodes);
    }

    // 生成统计信息
    const stats = converter.getStats(processedNodes);
    displayNodeStats(stats);

    // 使用统一的输出文件生成器
    const outputFormats = customConfig.outputFormats || [OutputFormats.CLASH, OutputFormats.BASE64, OutputFormats.URL, OutputFormats.JSON];
    await generateOutputFiles(processedNodes, outputFormats, fileNameWithoutExt, inputFormat);

    console.log(`✅ ${fileName} 处理完成！`);

  } catch (error) {
    console.error(`❌ 处理文件失败: ${fileName}`, error.message);
  }
}

// 导出函数供其他模块使用
export { processAllFiles, processFile, ensureOutputDir, processAllFilesWithConfig, processFileWithConfig };

// 如果直接运行此文件，执行主函数
if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch(error => {
    console.error('❌ 程序执行失败:', error);
  });
}
