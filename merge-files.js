#!/usr/bin/env node

/**
 * 代理节点文件合并工具
 * 支持合并多个YAML、Base64、URL格式的代理节点文件
 */

import fs from 'fs';
import path from 'path';
import { OutputFormats } from './src/types.js';

import {
  displayProcessProgress,
  displayMergeStats
} from './src/utils/common.js';
import { CONFIG } from './src/config/default.js';
import { ParserErrorHandler } from './src/parsers/common/error-handler.js';
import { CommonFileProcessor } from './src/parsers/common/file-processor.js';

// 使用统一配置
const MERGE_CONFIG = CONFIG;

/**
 * 确保输出目录存在
 */
function ensureOutputDir() {
  if (!fs.existsSync(MERGE_CONFIG.outputDir)) {
    fs.mkdirSync(MERGE_CONFIG.outputDir, { recursive: true });
    console.log(`✅ 创建输出目录: ${MERGE_CONFIG.outputDir}`);
  }
}

/**
 * 读取文件内容
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
 * 检测文件格式
 */
function detectFileFormat(content, fileName) {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    return 'yaml';
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
 * 扫描并分类文件
 */
function scanAndCategorizeFiles() {
  const categories = {
    yaml: [],
    base64: [],
    url: [],
    unknown: []
  };

  try {
    const files = fs.readdirSync(MERGE_CONFIG.inputDir);

    for (const file of files) {
      if (file === 'test.js') continue;

      const filePath = path.join(MERGE_CONFIG.inputDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile()) {
        const content = readFileContent(filePath);
        if (content) {
          const format = detectFileFormat(content, file);
          categories[format].push({ file, path: filePath, content });
        }
      }
    }
  } catch (error) {
    console.error(`❌ 扫描目录失败: ${MERGE_CONFIG.inputDir}`, error.message);
  }

  return categories;
}



/**
 * 通用文件合并函数（重构版本 - 消除重复逻辑）
 * @param {Array} files - 文件信息数组
 * @param {string} fileType - 文件类型名称
 * @param {string} parseFormat - 解析格式
 * @param {string} outputPrefix - 输出文件前缀
 * @param {Object} customDeduplicationConfig - 自定义去重配置
 * @param {Array} outputFormats - 输出格式数组
 */
async function mergeFilesCommon(files, fileType, parseFormat, outputPrefix, customDeduplicationConfig = null, outputFormats = []) {
  displayProcessProgress(`${fileType}文件`, '合并');

  if (files.length === 0) {
    console.log(`⚠️ 没有找到${fileType}文件`);
    return;
  }

  // 显示要处理的文件列表
  console.log(`📋 准备处理 ${files.length} 个${fileType}文件:`);
  files.forEach((fileInfo, index) => {
    console.log(`  ${index + 1}. ${fileInfo.file}`);
  });
  console.log('');

  try {
    const processor = new CommonFileProcessor({
      enableValidation: true,
      enableStats: true,
      enableProgress: true
    });

    let allNodes = [];

    // 处理每个文件
    for (const fileInfo of files) {
      console.log(`📁 处理: ${fileInfo.file}`);
      try {
        const nodes = await processor.parseNodes(fileInfo.content, parseFormat);
        console.log(`  ✅ 解析到 ${nodes.length} 个节点`);
        allNodes = allNodes.concat(nodes);
      } catch (error) {
        console.error(`  ❌ 解析失败:`, error.message);
      }
    }

    if (allNodes.length === 0) {
      console.log('⚠️ 没有解析到任何节点');
      return;
    }

    console.log(`\n🔄 处理合并的节点 (总计: ${allNodes.length})`);

    // 验证节点
    processor.validateNodes(allNodes);

    // 处理节点（去重、重命名）
    const processOptions = {
      ...MERGE_CONFIG.defaultOptions,
      deduplicateOptions: customDeduplicationConfig || MERGE_CONFIG.defaultOptions.deduplicateOptions
    };

    const processedNodes = await processor.processNodes(allNodes, processOptions);

    // 安全检查：确保processedNodes是数组
    if (!processedNodes || !Array.isArray(processedNodes)) {
      console.error('⚠️ 节点处理失败，返回空数组');
      return;
    }

    // 生成统计
    const stats = processor.generateStats(processedNodes);
    displayMergeStats(stats);

    // 生成输出文件
    await processor.generateOutputFiles(processedNodes, outputFormats, outputPrefix, parseFormat);

    console.log(`🎉 ${fileType}文件合并完成！合并了 ${files.length} 个文件，共 ${processedNodes.length} 个节点`);

    // 返回合并结果
    return {
      totalNodes: allNodes.length,
      uniqueNodes: processedNodes.length,
      duplicateNodes: allNodes.length - processedNodes.length,
      files: files.length
    };
  } catch (error) {
    ParserErrorHandler.logError('MERGE', 'merge_files', error, { fileType, fileCount: files.length });
    return null;
  }
}

/**
 * 合并YAML文件（使用通用函数）
 */
async function mergeYamlFiles(yamlFiles, customDeduplicationConfig = null, outputFormats = [OutputFormats.CLASH]) {
  return mergeFilesCommon(yamlFiles, 'YAML', 'clash', 'merged_yaml_nodes', customDeduplicationConfig, outputFormats);
}

/**
 * 合并Base64文件（使用通用函数）
 */
async function mergeBase64Files(base64Files, customDeduplicationConfig = null, outputFormats = [OutputFormats.BASE64]) {
  return mergeFilesCommon(base64Files, 'Base64', 'base64', 'merged_base64_nodes', customDeduplicationConfig, outputFormats);
}

/**
 * 合并URL文件（使用通用函数）
 */
async function mergeUrlFiles(urlFiles, customDeduplicationConfig = null, outputFormats = [OutputFormats.URL]) {
  return mergeFilesCommon(urlFiles, 'URL', 'url', 'merged_url_nodes', customDeduplicationConfig, outputFormats);
}

export { mergeYamlFiles, mergeBase64Files, mergeUrlFiles, scanAndCategorizeFiles, ensureOutputDir };
