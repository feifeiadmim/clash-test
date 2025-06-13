/**
 * 重命名模块单元测试
 */

import { describe, it, assert } from './test-framework.js';
import { 
  detectRegion, 
  renameNodes, 
  batchRename, 
  restoreOriginalNames,
  getRenameStats
} from '../../src/utils/rename.js';

describe('重命名模块测试', () => {
  describe('地区检测功能 (detectRegion)', () => {
    it('应该正确检测香港节点', () => {
      const testCases = [
        '🇭🇰香港001',
        'HK-Premium',
        'Hong Kong Server',
        'hongkong-01',
        '🇭🇰é¦æ¸¯011' // 测试编码问题
      ];

      testCases.forEach(name => {
        const result = detectRegion(name);
        assert.equal(result, 'HK', `应该识别 "${name}" 为香港`);
      });
    });

    it('应该正确检测台湾节点', () => {
      const testCases = [
        '🇹🇼台湾001',
        'TW-Server',
        'Taiwan Premium',
        '台湾高速节点'
      ];

      testCases.forEach(name => {
        const result = detectRegion(name);
        assert.equal(result, 'TW', `应该识别 "${name}" 为台湾`);
      });
    });

    it('应该正确检测美国节点', () => {
      const testCases = [
        '🇺🇸美国001',
        'US-West',
        'USA Server',
        'United States',
        'America Premium'
      ];

      testCases.forEach(name => {
        const result = detectRegion(name);
        assert.equal(result, 'US', `应该识别 "${name}" 为美国`);
      });
    });

    it('应该正确检测日本节点', () => {
      const testCases = [
        '🇯🇵日本001',
        'JP-Tokyo',
        'Japan Server'
      ];

      testCases.forEach(name => {
        const result = detectRegion(name);
        assert.equal(result, 'JP', `应该识别 "${name}" 为日本`);
      });
    });

    it('应该正确检测新加坡节点', () => {
      const testCases = [
        '🇸🇬新加坡001',
        'SG-Premium',
        'Singapore Server',
        '狮城节点'
      ];

      testCases.forEach(name => {
        const result = detectRegion(name);
        assert.equal(result, 'SG', `应该识别 "${name}" 为新加坡`);
      });
    });

    it('应该将无法识别的节点归类为其他', () => {
      const testCases = [
        'Unknown Server',
        'Premium-001',
        'Fast Node',
        '高速节点',
        'Server-123',
        '测试节点'
      ];

      testCases.forEach(name => {
        const result = detectRegion(name);
        assert.equal(result, 'OTHER', `应该识别 "${name}" 为其他`);
      });
    });

    it('应该处理空字符串和特殊情况', () => {
      assert.equal(detectRegion(''), 'OTHER');
      assert.equal(detectRegion(null), 'OTHER');
      assert.equal(detectRegion(undefined), 'OTHER');
      assert.equal(detectRegion('   '), 'OTHER');
    });

    it('应该正确处理编码问题', () => {
      const encodingTests = [
        { input: 'é¦æ¸¯', expected: 'HK' },
        { input: 'å°æ¹¾', expected: 'TW' },
        { input: 'æ°å å¡', expected: 'SG' },
        { input: 'æ¥æ¬', expected: 'JP' },
        { input: 'éå½', expected: 'KR' },
        { input: 'ç¾å½', expected: 'US' },
        { input: 'è±å½', expected: 'UK' }
      ];

      encodingTests.forEach(({ input, expected }) => {
        const result = detectRegion(input);
        assert.equal(result, expected, `编码问题处理: "${input}" 应该识别为 ${expected}`);
      });
    });

    it('应该忽略大小写', () => {
      const testCases = [
        { input: 'HK', expected: 'HK' },
        { input: 'hk', expected: 'HK' },
        { input: 'Hk', expected: 'HK' },
        { input: 'HONG KONG', expected: 'HK' },
        { input: 'hong kong', expected: 'HK' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = detectRegion(input);
        assert.equal(result, expected, `大小写处理: "${input}" 应该识别为 ${expected}`);
      });
    });
  });

  describe('节点重命名功能 (renameNodes)', () => {
    let testNodes;

    beforeEach(() => {
      testNodes = [
        {
          name: '🇭🇰香港001',
          server: '1.1.1.1',
          port: 443,
          type: 'vmess'
        },
        {
          name: '🇺🇸美国002',
          server: '2.2.2.2',
          port: 443,
          type: 'trojan'
        },
        {
          name: 'Unknown Server',
          server: '3.3.3.3',
          port: 443,
          type: 'ss'
        }
      ];
    });

    it('应该正确重命名节点', () => {
      const result = renameNodes(testNodes);

      assert.isArray(result);
      assert.lengthOf(result, 3);

      // 检查重命名结果
      assert.match(result[0].name, /🇭🇰香港\d{3}/);
      assert.match(result[1].name, /🇺🇸美国\d{3}/);
      assert.match(result[2].name, /🌐其他\d{3}/);

      // 检查原始名称保存
      assert.equal(result[0].originalName, '🇭🇰香港001');
      assert.equal(result[1].originalName, '🇺🇸美国002');
      assert.equal(result[2].originalName, 'Unknown Server');

      // 检查地区检测结果
      assert.equal(result[0].detectedRegion, 'HK');
      assert.equal(result[1].detectedRegion, 'US');
      assert.equal(result[2].detectedRegion, 'OTHER');
    });

    it('应该支持自定义模板', () => {
      const options = {
        template: '{region}-{index:2}'
      };

      const result = renameNodes(testNodes, options);

      assert.match(result[0].name, /香港-\d{2}/);
      assert.match(result[1].name, /美国-\d{2}/);
      assert.match(result[2].name, /其他-\d{2}/);
    });

    it('应该支持按地区分组编号', () => {
      const mixedNodes = [
        { name: '🇭🇰香港001', server: '1.1.1.1', port: 443, type: 'vmess' },
        { name: '🇺🇸美国001', server: '2.2.2.2', port: 443, type: 'trojan' },
        { name: '🇭🇰香港002', server: '3.3.3.3', port: 443, type: 'ss' },
        { name: '🇺🇸美国002', server: '4.4.4.4', port: 443, type: 'vmess' }
      ];

      const result = renameNodes(mixedNodes, { groupByRegion: true });

      // 香港节点应该从001开始编号
      const hkNodes = result.filter(node => node.detectedRegion === 'HK');
      assert.lengthOf(hkNodes, 2);
      assert.match(hkNodes[0].name, /🇭🇰香港001/);
      assert.match(hkNodes[1].name, /🇭🇰香港002/);

      // 美国节点应该从001开始编号
      const usNodes = result.filter(node => node.detectedRegion === 'US');
      assert.lengthOf(usNodes, 2);
      assert.match(usNodes[0].name, /🇺🇸美国001/);
      assert.match(usNodes[1].name, /🇺🇸美国002/);
    });

    it('应该支持顺序编号', () => {
      const result = renameNodes(testNodes, { groupByRegion: false });

      // 应该按顺序编号，不按地区分组
      assert.match(result[0].name, /🇭🇰香港001/);
      assert.match(result[1].name, /🇺🇸美国002/);
      assert.match(result[2].name, /🌐其他003/);
    });

    it('应该处理空数组', () => {
      const result = renameNodes([]);
      assert.isArray(result);
      assert.lengthOf(result, 0);
    });

    it('应该处理无效输入', () => {
      assert.deepEqual(renameNodes(null), []);
      assert.deepEqual(renameNodes(undefined), []);
      assert.deepEqual(renameNodes('invalid'), []);
    });
  });

  describe('批量重命名功能 (batchRename)', () => {
    it('应该支持不同地区使用不同模板', () => {
      const testNodes = [
        { name: '🇭🇰香港001', server: '1.1.1.1', port: 443, type: 'vmess' },
        { name: '🇺🇸美国001', server: '2.2.2.2', port: 443, type: 'trojan' }
      ];

      const regionTemplates = {
        'HK': '{flag}{region}-Premium-{index:3}',
        'US': '{flag}{region}-Standard-{index:3}',
        'default': '{flag}{region}-{index:3}'
      };

      const result = batchRename(testNodes, regionTemplates);

      assert.match(result[0].name, /🇭🇰香港-Premium-\d{3}/);
      assert.match(result[1].name, /🇺🇸美国-Standard-\d{3}/);
    });
  });

  describe('辅助功能测试', () => {
    it('应该正确恢复原始名称', () => {
      const testNodes = [
        { name: '🇭🇰香港001', originalName: 'Original HK Node' },
        { name: '🇺🇸美国001', originalName: 'Original US Node' }
      ];

      const result = restoreOriginalNames(testNodes);

      assert.equal(result[0].name, 'Original HK Node');
      assert.equal(result[1].name, 'Original US Node');
    });

    it('应该正确生成重命名统计', () => {
      const originalNodes = [
        { name: 'Original 1' },
        { name: 'Original 2' },
        { name: 'Original 3' }
      ];

      const renamedNodes = [
        { name: '🇭🇰香港001', detectedRegion: 'HK' },
        { name: '🇺🇸美国001', detectedRegion: 'US' },
        { name: '🌐其他001', detectedRegion: 'OTHER' }
      ];

      const stats = getRenameStats(originalNodes, renamedNodes);

      assert.equal(stats.total, 3);
      assert.equal(stats.regions.HK, 1);
      assert.equal(stats.regions.US, 1);
      assert.equal(stats.regions.OTHER, 1);
      assert.equal(stats.regionCount, 3);
    });
  });
});
