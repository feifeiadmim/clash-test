# API 文档

## 概述

本文档描述了代理节点转换工具的核心API接口和使用方法。

## 核心模块

### ProxyNodeConverter

主要的转换器类，提供完整的代理节点处理功能。

#### 构造函数

```javascript
import { ProxyNodeConverter } from './src/index.js';

const converter = new ProxyNodeConverter(options);
```

**参数:**
- `options` (Object): 配置选项
  - `enableCache` (boolean): 是否启用缓存，默认 `true`
  - `streamProcessing` (boolean): 是否启用流式处理，默认 `true`
  - `concurrencyLimit` (number): 并发限制，默认 `5`
  - `performance` (Object): 性能配置
  - `deduplication` (Object): 去重配置

#### 方法

##### `processFile(filePath, options)`

处理单个文件。

**参数:**
- `filePath` (string): 文件路径
- `options` (Object): 处理选项
  - `deduplicate` (boolean): 是否去重，默认 `true`
  - `rename` (boolean): 是否重命名，默认 `true`
  - `outputFormat` (string): 输出格式，默认 `'yaml'`

**返回值:**
- `Promise<Object[]>`: 处理后的节点数组

**示例:**
```javascript
const nodes = await converter.processFile('./input/input.yaml', {
  deduplicate: true,
  rename: true,
  outputFormat: 'yaml'
});
```

##### `processContent(content, options)`

处理内容字符串。

**参数:**
- `content` (string): 要处理的内容
- `options` (Object): 处理选项（同上）

**返回值:**
- `Promise<Object[]>`: 处理后的节点数组

##### `mergeFiles(filePaths, outputPath, options)`

合并多个文件。

**参数:**
- `filePaths` (string[]): 输入文件路径数组
- `outputPath` (string): 输出文件路径
- `options` (Object): 合并选项

**返回值:**
- `Promise<void>`

**示例:**
```javascript
await converter.mergeFiles(
  ['./input/file1.yaml', './input/file2.yaml'],
  './output/merged.yaml',
  { deduplicate: true }
);
```

##### `getStats()`

获取处理统计信息。

**返回值:**
- `Object`: 统计信息对象
  - `totalProcessed` (number): 总处理数量
  - `duplicatesRemoved` (number): 移除的重复项
  - `processingTime` (number): 处理时间
  - `cacheHits` (number): 缓存命中次数

### 解析器注册表 (ParserRegistry)

管理所有解析器的注册表。

#### 方法

##### `register(parser)`

注册解析器。

**参数:**
- `parser` (Object): 解析器对象
  - `name` (string): 解析器名称
  - `test` (Function): 测试函数
  - `parse` (Function): 解析函数

##### `parse(content)`

解析内容。

**参数:**
- `content` (string): 要解析的内容

**返回值:**
- `Promise<Object[]>`: 解析后的节点数组

### 去重引擎 (DeduplicationEngine)

提供节点去重功能。

#### 方法

##### `deduplicate(nodes, options)`

去重节点数组。

**参数:**
- `nodes` (Object[]): 节点数组
- `options` (Object): 去重选项
  - `strategy` (string): 去重策略，默认 `'full'`
  - `action` (string): 处理动作，`'delete'` 或 `'rename'`
  - `caseSensitive` (boolean): 是否区分大小写

**返回值:**
- `Object[]`: 去重后的节点数组

**示例:**
```javascript
import { DeduplicationEngine } from './src/utils/deduplication.js';

const engine = new DeduplicationEngine();
const uniqueNodes = engine.deduplicate(nodes, {
  strategy: 'full',
  action: 'delete'
});
```

### 缓存系统 (ParseCache)

LRU缓存实现，用于提升解析性能。

#### 方法

##### `set(key, value)`

设置缓存项。

##### `get(key)`

获取缓存项。

##### `has(key)`

检查键是否存在。

##### `delete(key)`

删除缓存项。

##### `clear()`

清空缓存。

##### `getStats()`

获取缓存统计信息。

## 配置选项

### 默认配置

```javascript
const defaultConfig = {
  // 处理选项
  processing: {
    deduplicate: true,
    rename: true,
    enableCache: true,
    streamProcessing: true
  },

  // 去重配置
  deduplication: {
    strategy: 'full',
    action: 'delete',
    caseSensitive: false
  },

  // 重命名配置
  rename: {
    template: '{flag}{region}{index:3}',
    groupByRegion: true,
    startIndex: 1
  },

  // 性能配置
  performance: {
    batchSize: 100,
    maxConcurrency: 5,
    cacheTimeout: 300000,
    memoryLimit: 200 * 1024 * 1024
  }
};
```

### 环境配置

支持通过环境变量配置：

- `NODE_ENV`: 运行环境 (`development`, `production`, `test`)
- `CACHE_ENABLED`: 是否启用缓存
- `BATCH_SIZE`: 批处理大小
- `MEMORY_LIMIT`: 内存限制

## 错误处理

### 错误类型

- `ParseError`: 解析错误
- `ValidationError`: 验证错误
- `ConfigError`: 配置错误
- `CacheError`: 缓存错误

### 错误处理示例

```javascript
try {
  const nodes = await converter.processFile('./input.yaml');
} catch (error) {
  if (error.name === 'ParseError') {
    console.error('解析失败:', error.message);
  } else if (error.name === 'ValidationError') {
    console.error('验证失败:', error.details);
  } else {
    console.error('未知错误:', error);
  }
}
```

## 性能优化

### 缓存策略

- 启用解析缓存以提升重复内容的处理速度
- 使用LRU算法自动管理缓存大小
- 支持TTL过期机制

### 流式处理

- 大文件自动启用流式处理
- 分批处理减少内存占用
- 支持进度回调

### 并发控制

- 限制同时处理的文件数量
- 防止内存溢出
- 智能负载均衡

## 监控和调试

### 性能监控

```javascript
import { startMonitoring, getMonitoringReport } from './src/monitoring/system-monitor.js';

// 启动监控
startMonitoring();

// 获取报告
const report = getMonitoringReport();
console.log('系统状态:', report.health.status);
console.log('内存使用:', report.memory.current);
```

### 日志记录

```javascript
import { log } from './src/monitoring/system-monitor.js';

log.info('开始处理文件', { fileName: 'input.yaml' });
log.error('处理失败', { error: error.message });
```

## 最佳实践

### 1. 配置优化

```javascript
// 生产环境配置
const productionConfig = {
  performance: {
    batchSize: 500,
    maxConcurrency: 10,
    enableCache: true
  },
  deduplication: {
    strategy: 'full',
    action: 'delete'
  }
};
```

### 2. 错误处理

```javascript
// 使用安全包装器
import { wrapParser } from './src/parsers/common/error-handler.js';

const safeParser = wrapParser(originalParser);
```

### 3. 内存管理

```javascript
// 处理大文件时启用流式处理
const converter = new ProxyNodeConverter({
  streamProcessing: true,
  performance: {
    batchSize: 1000,
    memoryLimit: 100 * 1024 * 1024
  }
});
```

### 4. 测试

```javascript
// 运行测试
import './tests/run-tests.js';

// 或运行特定测试
node tests/run-tests.js deduplication.test.js
```

## 版本兼容性

- Node.js >= 14.0.0
- ES6 Modules 支持
- 支持 Windows, macOS, Linux

## 更新日志

### v2.0.0 (当前版本)
- ✅ 重构架构，提升性能
- ✅ 添加监控系统
- ✅ 完善测试覆盖
- ✅ 优化内存管理
- ✅ 统一错误处理

### v1.x.x (历史版本)
- 基础功能实现
- 多格式支持
- 去重和重命名功能
