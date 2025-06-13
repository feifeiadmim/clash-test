/**
 * 原子性文件写入器
 * 通过临时文件+重命名的方式确保文件写入的原子性
 * 防止写入过程中的数据损坏和部分写入问题
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BaseError, ErrorTypes, ErrorSeverity } from '../parsers/common/error-handler.js';

/**
 * 文件处理错误类
 */
class FileProcessError extends BaseError {
  constructor(message, operation = null, filePath = null, details = null) {
    super(message, ErrorTypes.FILE_ERROR, details, ErrorSeverity.HIGH);
    this.operation = operation;
    this.filePath = filePath;
  }
}

/**
 * 原子性文件写入器类
 */
export class AtomicFileWriter {
  constructor(options = {}) {
    this.options = {
      tempSuffix: '.tmp',
      backupSuffix: '.backup',
      enableBackup: false,
      enableIntegrityCheck: true,
      maxRetries: 3,
      retryDelay: 1000,
      ...options
    };
  }

  /**
   * 原子性写入文件
   * @param {string} filePath - 目标文件路径
   * @param {string} content - 文件内容
   * @param {Object} options - 写入选项
   * @returns {Promise<Object>} 写入结果
   */
  async writeFileAtomic(filePath, content, options = {}) {
    const writeOptions = { ...this.options, ...options };
    const tempPath = this.generateTempPath(filePath);
    let backupPath = null;

    try {
      // 确保目录存在
      await this.ensureDirectory(path.dirname(filePath));

      // 创建备份（如果启用且文件存在）
      if (writeOptions.enableBackup && await this.fileExists(filePath)) {
        backupPath = await this.createBackup(filePath);
      }

      // 写入临时文件
      await this.writeToTempFile(tempPath, content);

      // 验证写入完整性
      if (writeOptions.enableIntegrityCheck) {
        await this.verifyFileIntegrity(tempPath, content);
      }

      // 原子性重命名
      await this.atomicRename(tempPath, filePath);

      // 清理备份文件（如果成功）
      if (backupPath && !writeOptions.keepBackup) {
        await this.cleanupBackup(backupPath);
      }

      return {
        success: true,
        filePath,
        tempPath,
        backupPath,
        size: Buffer.byteLength(content, 'utf8'),
        checksum: this.calculateChecksum(content),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      // 清理临时文件
      await this.cleanupTempFile(tempPath);

      // 恢复备份（如果存在）
      if (backupPath) {
        await this.restoreFromBackup(backupPath, filePath);
      }

      throw new FileProcessError(
        `原子性写入失败: ${error.message}`,
        filePath,
        { tempPath, backupPath, error: error.message }
      );
    }
  }

  /**
   * 生成安全的临时文件路径
   * @param {string} filePath - 原始文件路径
   * @returns {string} 临时文件路径
   */
  generateTempPath(filePath) {
    // 使用加密安全的随机数生成器
    const randomBytes = crypto.randomBytes(16);
    const random = randomBytes.toString('hex');
    const timestamp = Date.now();
    const pid = process.pid;

    // 将临时文件放在安全的临时目录中
    const tempDir = this.getTempDirectory();
    const basename = path.basename(filePath);
    const tempFileName = `${basename}${this.options.tempSuffix}.${timestamp}.${pid}.${random}`;

    return path.join(tempDir, tempFileName);
  }

  /**
   * 获取安全的临时目录
   * @returns {string} 临时目录路径
   */
  getTempDirectory() {
    // 使用系统临时目录或配置的安全目录
    const tempDir = this.options.tempDirectory ||
      path.join(process.cwd(), 'temp');

    // 确保临时目录存在且安全
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, {
        recursive: true,
        mode: 0o700 // 只有所有者可访问
      });
    }

    return tempDir;
  }

  /**
   * 确保目录存在
   * @param {string} dirPath - 目录路径
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.promises.access(dirPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.promises.mkdir(dirPath, { recursive: true });
      } else {
        throw error;
      }
    }
  }

  /**
   * 检查文件是否存在
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>} 是否存在
   */
  async fileExists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 创建备份文件
   * @param {string} filePath - 原始文件路径
   * @returns {Promise<string>} 备份文件路径
   */
  async createBackup(filePath) {
    const backupPath = `${filePath}${this.options.backupSuffix}.${Date.now()}`;
    await fs.promises.copyFile(filePath, backupPath);
    return backupPath;
  }

  /**
   * 写入临时文件
   * @param {string} tempPath - 临时文件路径
   * @param {string} content - 文件内容
   */
  async writeToTempFile(tempPath, content) {
    // 使用安全的文件权限
    const options = {
      encoding: 'utf8',
      mode: 0o600, // 只有所有者可读写
      flag: 'w'     // 覆盖写入
    };

    await fs.promises.writeFile(tempPath, content, options);

    // 验证文件权限
    const stats = await fs.promises.stat(tempPath);
    if ((stats.mode & 0o777) !== 0o600) {
      console.warn(`⚠️ 临时文件权限不安全: ${tempPath}`);
    }
  }

  /**
   * 验证文件完整性 - 防止时间窗口攻击
   * @param {string} filePath - 文件路径
   * @param {string} expectedContent - 期望内容
   */
  async verifyFileIntegrity(filePath, expectedContent) {
    // 使用文件描述符确保操作的原子性
    let fileHandle;

    try {
      fileHandle = await fs.promises.open(filePath, 'r');

      // 获取文件统计信息
      const stats = await fileHandle.stat();
      const expectedSize = Buffer.byteLength(expectedContent, 'utf8');

      if (stats.size !== expectedSize) {
        throw new Error(`文件完整性验证失败：大小不匹配 (期望: ${expectedSize}, 实际: ${stats.size})`);
      }

      // 读取文件内容
      const buffer = Buffer.alloc(stats.size);
      await fileHandle.read(buffer, 0, stats.size, 0);
      const actualContent = buffer.toString('utf8');

      // 验证内容
      if (actualContent !== expectedContent) {
        throw new Error('文件完整性验证失败：内容不匹配');
      }

      // 验证校验和
      const expectedChecksum = this.calculateChecksum(expectedContent);
      const actualChecksum = this.calculateChecksum(actualContent);

      if (expectedChecksum !== actualChecksum) {
        throw new Error('文件完整性验证失败：校验和不匹配');
      }

    } finally {
      if (fileHandle) {
        await fileHandle.close();
      }
    }
  }

  /**
   * 原子性重命名
   * @param {string} tempPath - 临时文件路径
   * @param {string} targetPath - 目标文件路径
   */
  async atomicRename(tempPath, targetPath) {
    // 在重命名前设置目标文件权限
    await fs.promises.rename(tempPath, targetPath);

    // 确保目标文件有正确的权限
    await fs.promises.chmod(targetPath, 0o644); // 所有者读写，其他人只读
  }

  /**
   * 计算内容校验和
   * @param {string} content - 内容
   * @returns {string} MD5校验和
   */
  calculateChecksum(content) {
    return crypto.createHash('md5').update(content, 'utf8').digest('hex');
  }

  /**
   * 清理临时文件
   * @param {string} tempPath - 临时文件路径
   */
  async cleanupTempFile(tempPath) {
    try {
      if (await this.fileExists(tempPath)) {
        await fs.promises.unlink(tempPath);
      }
    } catch (error) {
      console.warn(`清理临时文件失败: ${tempPath}`, error.message);
    }
  }

  /**
   * 清理备份文件
   * @param {string} backupPath - 备份文件路径
   */
  async cleanupBackup(backupPath) {
    try {
      if (await this.fileExists(backupPath)) {
        await fs.promises.unlink(backupPath);
      }
    } catch (error) {
      console.warn(`清理备份文件失败: ${backupPath}`, error.message);
    }
  }

  /**
   * 从备份恢复文件
   * @param {string} backupPath - 备份文件路径
   * @param {string} targetPath - 目标文件路径
   */
  async restoreFromBackup(backupPath, targetPath) {
    try {
      if (await this.fileExists(backupPath)) {
        await fs.promises.copyFile(backupPath, targetPath);
        console.log(`✅ 已从备份恢复文件: ${targetPath}`);
      }
    } catch (error) {
      console.error(`从备份恢复文件失败: ${targetPath}`, error.message);
    }
  }

  /**
   * 带重试的原子性写入
   * @param {string} filePath - 文件路径
   * @param {string} content - 内容
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 写入结果
   */
  async writeFileAtomicWithRetry(filePath, content, options = {}) {
    const maxRetries = options.maxRetries || this.options.maxRetries;
    const retryDelay = options.retryDelay || this.options.retryDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.writeFileAtomic(filePath, content, options);
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }

        console.warn(`写入失败，第${attempt}次重试 (${maxRetries}): ${error.message}`);
        
        // 等待后重试
        if (retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
  }

  /**
   * 批量原子性写入
   * @param {Array} writeOperations - 写入操作数组 [{filePath, content, options}]
   * @returns {Promise<Array>} 写入结果数组
   */
  async batchWriteAtomic(writeOperations) {
    const results = [];
    const errors = [];

    for (const operation of writeOperations) {
      try {
        const result = await this.writeFileAtomic(
          operation.filePath,
          operation.content,
          operation.options
        );
        results.push(result);
      } catch (error) {
        errors.push({
          filePath: operation.filePath,
          error: error.message
        });
      }
    }

    return {
      successful: results,
      failed: errors,
      totalCount: writeOperations.length,
      successCount: results.length,
      failureCount: errors.length
    };
  }
}

// 创建全局实例
export const globalAtomicWriter = new AtomicFileWriter();

// 导出便捷方法
export const writeFileAtomic = (filePath, content, options) =>
  globalAtomicWriter.writeFileAtomic(filePath, content, options);

export const writeFileAtomicWithRetry = (filePath, content, options) =>
  globalAtomicWriter.writeFileAtomicWithRetry(filePath, content, options);

export const batchWriteAtomic = (writeOperations) =>
  globalAtomicWriter.batchWriteAtomic(writeOperations);
