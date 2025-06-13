#!/usr/bin/env node

/**
 * 测试运行器
 * 运行所有单元测试和集成测试
 */

import { testFramework } from './unit/test-framework.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 主测试运行器
 */
async function runAllTests() {
  console.log('🚀 启动测试套件...\n');
  
  try {
    // 导入所有测试文件
    console.log('📂 加载测试文件...');
    
    await import('./unit/deduplication.test.js');
    console.log('  ✅ 去重模块测试');

    await import('./unit/parser-registry.test.js');
    console.log('  ✅ 解析器注册表测试');

    await import('./unit/cache.test.js');
    console.log('  ✅ 缓存模块测试');

    await import('./cache/cache-consistency.test.js');
    console.log('  ✅ 缓存一致性测试');

    await import('./security/vmess-security.test.js');
    console.log('  ✅ VMess安全测试');

    console.log('\n📋 测试文件加载完成\n');
    
    // 运行所有测试
    await testFramework.run();
    
  } catch (error) {
    console.error('❌ 测试运行失败:', error);
    process.exit(1);
  }
}

/**
 * 运行特定测试文件
 * @param {string} testFile - 测试文件名
 */
async function runSpecificTest(testFile) {
  console.log(`🎯 运行特定测试: ${testFile}\n`);
  
  try {
    const testPath = path.join(__dirname, 'unit', testFile);
    await import(testPath);
    await testFramework.run();
  } catch (error) {
    console.error('❌ 测试运行失败:', error);
    process.exit(1);
  }
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
🧪 测试运行器使用说明

用法:
  node tests/run-tests.js [选项] [测试文件]

选项:
  --help, -h     显示帮助信息
  --watch, -w    监视模式（暂未实现）
  --verbose, -v  详细输出模式

测试文件:
  deduplication.test.js    去重模块测试
  parser-registry.test.js  解析器注册表测试
  cache.test.js           缓存模块测试

示例:
  node tests/run-tests.js                    # 运行所有测试
  node tests/run-tests.js deduplication.test.js  # 运行特定测试
  node tests/run-tests.js --verbose          # 详细模式运行所有测试
`);
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    help: false,
    watch: false,
    verbose: false,
    testFile: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--watch':
      case '-w':
        options.watch = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      default:
        if (!arg.startsWith('-')) {
          options.testFile = arg;
        }
        break;
    }
  }

  return options;
}

/**
 * 设置测试环境
 */
function setupTestEnvironment() {
  // 设置Node.js环境变量
  process.env.NODE_ENV = 'test';
  
  // 启用垃圾回收（如果可用）
  if (global.gc) {
    console.log('🗑️ 垃圾回收已启用');
  }
  
  // 设置未捕获异常处理
  process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获的异常:', error);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未处理的Promise拒绝:', reason);
    process.exit(1);
  });
}

/**
 * 主入口
 */
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    return;
  }
  
  setupTestEnvironment();
  
  if (options.verbose) {
    console.log('🔍 详细模式已启用');
  }
  
  const startTime = Date.now();
  
  try {
    if (options.testFile) {
      await runSpecificTest(options.testFile);
    } else {
      await runAllTests();
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log(`\n⏱️ 总耗时: ${totalTime}ms`);
    console.log('🎉 测试完成！');
    
  } catch (error) {
    console.error('💥 测试执行失败:', error);
    process.exit(1);
  }
}

// 运行主程序
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 程序启动失败:', error);
    process.exit(1);
  });
}

export { runAllTests, runSpecificTest };
