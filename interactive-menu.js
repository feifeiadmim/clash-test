#!/usr/bin/env node

/**
 * 交互式代理节点处理菜单
 * 提供多种处理选项的交互式界面
 */

import readline from 'readline';
import { mergeYamlFiles, mergeBase64Files, mergeUrlFiles, scanAndCategorizeFiles, ensureOutputDir } from './merge-files.js';
import { DEDUPLICATION_STRATEGY, DuplicateAction } from './src/utils/deduplication.js';
import { FilterTypes } from './src/utils/filters.js';
import { OutputFormats } from './src/types.js';

// 创建readline接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * 显示主菜单
 */
function showMainMenu() {
  console.clear();

  // 精美的标题
  console.log('');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(68) + '║');
  console.log('║' + '🚀 代理节点处理工具 - 交互式菜单'.padStart(42).padEnd(68) + '║');
  console.log('║' + ' '.repeat(68) + '║');
  console.log('╠' + '═'.repeat(68) + '╣');
  console.log('║' + ' '.repeat(68) + '║');
  console.log('║' + '📋 功能菜单'.padStart(28).padEnd(68) + '║');
  console.log('║' + ' '.repeat(68) + '║');
  console.log('║  1️⃣  处理所有文件 (自动转换格式)'.padEnd(68) + '║');
  console.log('║  2️⃣  合并YAML文件 (去重后生成单个YAML文件) [默认]'.padEnd(68) + '║');
  console.log('║  3️⃣  合并Base64文件 (去重后生成单个Base64文件)'.padEnd(68) + '║');
  console.log('║  4️⃣  合并URL文件 (去重后生成单个URL文件)'.padEnd(68) + '║');
  console.log('║  5️⃣  智能合并所有文件 (按格式分类合并)'.padEnd(68) + '║');
  console.log('║  6️⃣  查看文件统计信息'.padEnd(68) + '║');
  console.log('║' + ' '.repeat(68) + '║');
  console.log('║  0️⃣  退出程序'.padEnd(68) + '║');
  console.log('║' + ' '.repeat(68) + '║');
  console.log('║  💡 提示: 直接按回车键使用默认选项'.padEnd(68) + '║');
  console.log('║' + ' '.repeat(68) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  console.log('');
}

/**
 * 获取用户输入（支持默认值）
 * @param {string} prompt - 提示信息
 * @param {string} defaultValue - 默认值
 * @returns {Promise<string>} 用户输入或默认值
 */
function getUserInput(prompt, defaultValue = '') {
  return new Promise((resolve) => {
    const fullPrompt = defaultValue ?
      `${prompt} [默认: ${defaultValue}]: ` :
      `${prompt}: `;

    rl.question(fullPrompt, (answer) => {
      const input = answer.trim();
      resolve(input || defaultValue);
    });
  });
}

/**
 * 暂停等待用户按键
 */
function waitForKeyPress() {
  return new Promise((resolve) => {
    rl.question('\n按回车键继续...', () => {
      resolve();
    });
  });
}

/**
 * 显示去重策略选择菜单
 */
function showDeduplicationStrategyMenu() {
  console.log('');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('║' + '🎯 去重策略'.padStart(32).padEnd(58) + '║');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('╠' + '═'.repeat(58) + '╣');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('║  使用 FULL 策略 - 完全匹配 (最高精度)'.padEnd(58) + '║');
  console.log('║  已优化为唯一去重策略，确保最佳效果'.padEnd(58) + '║');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('');
}

/**
 * 获取去重策略配置
 */
async function getDeduplicationStrategy() {
  showDeduplicationStrategyMenu();

  // 返回固定的完全匹配策略配置
  return {
    strategy: DEDUPLICATION_STRATEGY,
    name: '完全匹配策略'
  };
}

/**
 * 显示输出格式选择菜单
 */
function showOutputFormatsMenu() {
  console.log('');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('║' + '📄 选择输出格式'.padStart(32).padEnd(58) + '║');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('╠' + '═'.repeat(58) + '╣');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('║  1️⃣  Clash YAML (推荐) [默认]'.padEnd(58) + '║');
  console.log('║  2️⃣  Base64 订阅'.padEnd(58) + '║');
  console.log('║  3️⃣  URL 列表'.padEnd(58) + '║');
  console.log('║  4️⃣  JSON 数据'.padEnd(58) + '║');
  console.log('║  5️⃣  全部格式 (生成所有格式)'.padEnd(58) + '║');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('');
}

/**
 * 获取用户选择的输出格式
 */
async function getOutputFormats() {
  showOutputFormatsMenu();

  const choice = await getUserInput('请选择输出格式 (1-5)', '1');

  switch (choice) {
    case '1':
      return { formats: [OutputFormats.CLASH], names: ['Clash YAML'] };
    case '2':
      return { formats: [OutputFormats.BASE64], names: ['Base64 订阅'] };
    case '3':
      return { formats: [OutputFormats.URL], names: ['URL 列表'] };
    case '4':
      return { formats: [OutputFormats.JSON], names: ['JSON 数据'] };
    case '5':
      return {
        formats: [OutputFormats.CLASH, OutputFormats.BASE64, OutputFormats.URL, OutputFormats.JSON],
        names: ['Clash YAML', 'Base64 订阅', 'URL 列表', 'JSON 数据']
      };
    default:
      console.log('❌ 无效选择，使用默认格式 Clash YAML');
      return { formats: [OutputFormats.CLASH], names: ['Clash YAML'] };
  }
}

/**
 * 处理所有文件
 */
async function processAllFilesMenu() {
  console.clear();
  console.log('');
  console.log('╔' + '═'.repeat(48) + '╗');
  console.log('║' + ' '.repeat(48) + '║');
  console.log('║' + '📁 处理所有文件'.padStart(28).padEnd(48) + '║');
  console.log('║' + ' '.repeat(48) + '║');
  console.log('╚' + '═'.repeat(48) + '╝');
  console.log('');

  try {
    // 选择去重策略
    console.log('🎯 步骤 1: 选择去重策略');
    const deduplicationConfig = await getDeduplicationStrategy();
    console.log(`✅ 已选择: ${deduplicationConfig.name}`);

    // 选择输出格式
    console.log('\n📄 步骤 2: 选择输出格式');
    const outputConfig = await getOutputFormats();
    console.log(`✅ 已选择: ${outputConfig.names.join(', ')}`);

    console.log('\n🚀 开始处理文件...');

    // 动态导入处理文件模块
    const { processAllFilesWithConfig } = await import('./process-files.js');
    await processAllFilesWithConfig({
      deduplicateOptions: deduplicationConfig,
      outputFormats: outputConfig.formats
    });
  } catch (error) {
    console.error('❌ 处理失败:', error.message);
  }

  await waitForKeyPress();
}

/**
 * 查看文件统计
 */
async function showFileStats() {
  console.clear();
  console.log('📊 文件统计信息');
  console.log('='.repeat(40));

  const categories = scanAndCategorizeFiles();

  console.log(`📂 扫描目录: ./input`);
  console.log('');
  console.log('📋 文件分类统计:');
  console.log(`  🟡 YAML文件: ${categories.yaml.length} 个`);
  categories.yaml.forEach((file, index) => {
    console.log(`     ${index + 1}. ${file.file}`);
  });

  console.log(`  🟢 Base64文件: ${categories.base64.length} 个`);
  categories.base64.forEach((file, index) => {
    console.log(`     ${index + 1}. ${file.file}`);
  });

  console.log(`  🔵 URL文件: ${categories.url.length} 个`);
  categories.url.forEach((file, index) => {
    console.log(`     ${index + 1}. ${file.file}`);
  });

  console.log(`  ⚪ 未知格式: ${categories.unknown.length} 个`);
  categories.unknown.forEach((file, index) => {
    console.log(`     ${index + 1}. ${file.file}`);
  });

  console.log('');
  console.log(`📈 总计: ${categories.yaml.length + categories.base64.length + categories.url.length + categories.unknown.length} 个文件`);

  await waitForKeyPress();
}

/**
 * 智能合并所有文件
 */
async function smartMergeAllFiles() {
  console.clear();
  console.log('');
  console.log('╔' + '═'.repeat(48) + '╗');
  console.log('║' + ' '.repeat(48) + '║');
  console.log('║' + '🧠 智能合并所有文件'.padStart(30).padEnd(48) + '║');
  console.log('║' + ' '.repeat(48) + '║');
  console.log('╚' + '═'.repeat(48) + '╝');
  console.log('');

  ensureOutputDir();
  const categories = scanAndCategorizeFiles();

  console.log('📋 将按格式分类进行合并:');
  console.log(`  🟡 YAML文件: ${categories.yaml.length} 个`);
  console.log(`  🟢 Base64文件: ${categories.base64.length} 个`);
  console.log(`  🔵 URL文件: ${categories.url.length} 个`);
  console.log('');

  // 选择去重策略
  console.log('🎯 步骤 1: 选择去重策略');
  const deduplicationConfig = await getDeduplicationStrategy();
  console.log(`✅ 已选择: ${deduplicationConfig.name}`);

  // 选择输出格式
  console.log('\n📄 步骤 2: 选择输出格式');
  const outputConfig = await getOutputFormats();
  console.log(`✅ 已选择: ${outputConfig.names.join(', ')}`);

  const confirm = await getUserInput('\n确认开始智能合并? (Y/n)', 'y');
  if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
    console.log('❌ 操作已取消');
    await waitForKeyPress();
    return;
  }

  try {
    // 合并YAML文件
    if (categories.yaml.length > 0) {
      await mergeYamlFiles(categories.yaml, deduplicationConfig, outputConfig.formats);
    }

    // 合并Base64文件
    if (categories.base64.length > 0) {
      await mergeBase64Files(categories.base64, deduplicationConfig, outputConfig.formats);
    }

    // 合并URL文件
    if (categories.url.length > 0) {
      await mergeUrlFiles(categories.url, deduplicationConfig, outputConfig.formats);
    }

    console.log('\n🎉 智能合并完成！');

  } catch (error) {
    console.error('❌ 合并失败:', error.message);
  }

  await waitForKeyPress();
}

/**
 * 合并指定格式的文件
 */
async function mergeSpecificFormat(format) {
  console.clear();
  console.log('');
  console.log('╔' + '═'.repeat(48) + '╗');
  console.log('║' + ' '.repeat(48) + '║');
  console.log('║' + `📄 合并${format.toUpperCase()}文件`.padStart(30).padEnd(48) + '║');
  console.log('║' + ' '.repeat(48) + '║');
  console.log('╚' + '═'.repeat(48) + '╝');
  console.log('');

  ensureOutputDir();
  const categories = scanAndCategorizeFiles();
  const files = categories[format];

  if (files.length === 0) {
    console.log(`⚠️ 没有找到${format.toUpperCase()}格式的文件`);
    await waitForKeyPress();
    return;
  }

  console.log(`📋 找到 ${files.length} 个${format.toUpperCase()}文件:`);
  files.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file.file}`);
  });
  console.log('');

  // 选择去重策略
  console.log('🎯 步骤 1: 选择去重策略');
  const deduplicationConfig = await getDeduplicationStrategy();
  console.log(`✅ 已选择: ${deduplicationConfig.name}`);

  // 选择输出格式
  console.log('\n📄 步骤 2: 选择输出格式');
  const outputConfig = await getOutputFormats();
  console.log(`✅ 已选择: ${outputConfig.names.join(', ')}`);

  const confirm = await getUserInput(`\n确认合并这 ${files.length} 个文件? (Y/n)`, 'y');
  if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
    console.log('❌ 操作已取消');
    await waitForKeyPress();
    return;
  }

  try {
    switch (format) {
      case 'yaml':
        await mergeYamlFiles(files, deduplicationConfig, outputConfig.formats);
        break;
      case 'base64':
        await mergeBase64Files(files, deduplicationConfig, outputConfig.formats);
        break;
      case 'url':
        await mergeUrlFiles(files, deduplicationConfig, outputConfig.formats);
        break;
    }
  } catch (error) {
    console.error('❌ 合并失败:', error.message);
  }

  await waitForKeyPress();
}





/**
 * 主程序循环
 */
async function main() {
  while (true) {
    showMainMenu();

    const choice = await getUserInput('请输入选项 (0-6)', '2');

    switch (choice) {
      case '1':
        await processAllFilesMenu();
        break;
      case '2':
        await mergeSpecificFormat('yaml');
        break;
      case '3':
        await mergeSpecificFormat('base64');
        break;
      case '4':
        await mergeSpecificFormat('url');
        break;
      case '5':
        await smartMergeAllFiles();
        break;
      case '6':
        await showFileStats();
        break;
      case '0':
        console.log('\n👋 感谢使用！再见！');
        rl.close();
        process.exit(0);
        break;
      default:
        console.log('\n❌ 无效选项，请重新选择');
        await waitForKeyPress();
        break;
    }
  }
}

/**
 * 初始化系统
 */
async function initializeSystem() {
  console.log('🔄 正在初始化系统...');

  try {
    // 预加载并初始化ProxyConverter
    const { converter } = await import('./src/index.js');

    // 确保标准化输出已初始化
    if (converter.standardizedOutputPending) {
      await converter.ensureStandardizedOutput();
    }

    console.log('✅ 系统初始化完成');
  } catch (error) {
    console.warn('⚠️ 系统初始化部分失败，但程序可以继续运行:', error.message);
  }
}

// 启动程序
async function startApplication() {
  try {
    await initializeSystem();
    await main();
  } catch (error) {
    console.error('❌ 程序运行失败:', error);
    rl.close();
    process.exit(1);
  }
}

startApplication();
