/**
 * VMess解析器安全测试用例
 * 针对超长输入、非法Base64注入、畸形JSON结构的安全测试
 */

import { describe, it, assert } from '../unit/test-framework.js';
import { validateVMessInput } from '../../src/parsers/vmess.js';
import { VMessParser } from '../../src/parsers/vmess.js';

describe('VMess解析器安全测试套件', () => {
  
  describe('超长输入攻击测试', () => {
    it('应该拒绝超长Base64内容（>10KB）', () => {
      const longContent = 'A'.repeat(11000); // 超过10KB限制
      const attackUrl = `vmess://${longContent}`;
      
      const result = validateVMessInput(attackUrl);
      assert.isFalse(result.isValid);
      assert.include(result.error, 'too long');
    });

    it('应该拒绝极长Base64内容（>100KB）', () => {
      const extremelyLongContent = 'A'.repeat(100000); // 100KB
      const attackUrl = `vmess://${extremelyLongContent}`;
      
      const result = validateVMessInput(attackUrl);
      assert.isFalse(result.isValid);
      assert.include(result.error, 'too long');
    });

    it('应该拒绝超长解码后JSON（>20KB）', () => {
      // 创建一个解码后超过20KB的JSON
      const largeObject = {
        add: '1.1.1.1',
        port: '443',
        id: '12345678-1234-1234-1234-123456789012',
        largeField: 'x'.repeat(25000) // 25KB字段
      };
      const largeJson = JSON.stringify(largeObject);
      const largeBase64 = btoa(largeJson);
      const attackUrl = `vmess://${largeBase64}`;
      
      const result = validateVMessInput(attackUrl);
      assert.isFalse(result.isValid);
      assert.include(result.error, 'too long');
    });

    it('应该处理边界长度输入（正好10KB）', () => {
      // 创建正好10KB的Base64内容
      const boundaryContent = 'A'.repeat(10240); // 正好10KB
      const boundaryUrl = `vmess://${boundaryContent}`;
      
      const result = validateVMessInput(boundaryUrl);
      assert.isFalse(result.isValid); // 应该因为无效Base64被拒绝，而不是长度
      assert.include(result.error, 'Invalid Base64 format');
    });
  });

  describe('非法Base64注入测试', () => {
    it('应该拒绝包含非法字符的Base64', () => {
      const invalidBase64Tests = [
        'vmess://invalid@base64!content',
        'vmess://test#with#hash',
        'vmess://test with spaces',
        'vmess://test\nwith\nnewlines',
        'vmess://test\twith\ttabs',
        'vmess://test<script>alert(1)</script>',
        'vmess://test"with"quotes',
        'vmess://test\'with\'quotes',
        'vmess://test&with&ampersand',
        'vmess://test%20with%20encoding'
      ];

      for (const testUrl of invalidBase64Tests) {
        const result = validateVMessInput(testUrl);
        assert.isFalse(result.isValid, `应该拒绝: ${testUrl}`);
        assert.include(result.error, 'Invalid Base64 format');
      }
    });

    it('应该拒绝Base64填充错误', () => {
      const paddingTests = [
        'vmess://QWxhZGRpbjpvcGVuIHNlc2FtZQ', // 缺少填充
        'vmess://QWxhZGRpbjpvcGVuIHNlc2FtZQ===', // 过多填充
        'vmess://QWxhZGRpbjpvcGVuIHNlc2FtZQ=a', // 填充后有字符
        'vmess://QWxhZGRpbjpvcGVuIHNlc2FtZQ==' // 正确填充但内容无效
      ];

      for (const testUrl of paddingTests) {
        const result = validateVMessInput(testUrl);
        // 前三个应该因为格式错误被拒绝，最后一个应该因为JSON解析错误被拒绝
        assert.isFalse(result.isValid, `应该拒绝: ${testUrl}`);
      }
    });

    it('应该拒绝空Base64内容', () => {
      const emptyTests = [
        'vmess://',
        'vmess://    ',
        'vmess://\n\t\r'
      ];

      for (const testUrl of emptyTests) {
        const result = validateVMessInput(testUrl);
        assert.isFalse(result.isValid, `应该拒绝: ${testUrl}`);
        assert.include(result.error, 'missing base64 content');
      }
    });

    it('应该处理Unicode字符注入', () => {
      const unicodeTests = [
        'vmess://测试中文内容',
        'vmess://тест',
        'vmess://🚀🎯📊',
        'vmess://\u0000\u0001\u0002', // 控制字符
        'vmess://\uFEFF', // BOM字符
        'vmess://\u200B\u200C\u200D' // 零宽字符
      ];

      for (const testUrl of unicodeTests) {
        const result = validateVMessInput(testUrl);
        assert.isFalse(result.isValid, `应该拒绝Unicode: ${testUrl}`);
        assert.include(result.error, 'Invalid Base64 format');
      }
    });
  });

  describe('畸形JSON结构测试', () => {
    it('应该拒绝非JSON内容', () => {
      const nonJsonTests = [
        btoa('not json content'),
        btoa('123456789'),
        btoa('true'),
        btoa('null'),
        btoa('"string"'),
        btoa('[]'), // 数组而非对象
        btoa('function() { return "evil"; }'),
        btoa('<xml>content</xml>')
      ];

      for (const base64Content of nonJsonTests) {
        const testUrl = `vmess://${base64Content}`;
        const result = validateVMessInput(testUrl);
        assert.isFalse(result.isValid, `应该拒绝非JSON: ${base64Content}`);
      }
    });

    it('应该拒绝缺少必需字段的JSON', () => {
      const incompleteJsonTests = [
        {}, // 完全空对象
        { add: '1.1.1.1' }, // 缺少port和id
        { port: '443' }, // 缺少add和id
        { id: 'test-uuid' }, // 缺少add和port
        { add: '1.1.1.1', port: '443' }, // 缺少id
        { add: '1.1.1.1', id: 'test-uuid' }, // 缺少port
        { port: '443', id: 'test-uuid' } // 缺少add
      ];

      for (const jsonObj of incompleteJsonTests) {
        const base64Content = btoa(JSON.stringify(jsonObj));
        const testUrl = `vmess://${base64Content}`;
        const result = validateVMessInput(testUrl);
        assert.isFalse(result.isValid, `应该拒绝不完整JSON: ${JSON.stringify(jsonObj)}`);
        assert.include(result.error, 'Missing required field');
      }
    });

    it('应该拒绝无效字段值的JSON', () => {
      const invalidFieldTests = [
        { add: '', port: '443', id: 'test-uuid' }, // 空服务器地址
        { add: '   ', port: '443', id: 'test-uuid' }, // 空白服务器地址
        { add: '1.1.1.1', port: '', id: 'test-uuid' }, // 空端口
        { add: '1.1.1.1', port: 'invalid', id: 'test-uuid' }, // 无效端口
        { add: '1.1.1.1', port: '0', id: 'test-uuid' }, // 端口为0
        { add: '1.1.1.1', port: '99999', id: 'test-uuid' }, // 端口超出范围
        { add: '1.1.1.1', port: '443', id: '' }, // 空UUID
        { add: '1.1.1.1', port: '443', id: '   ' }, // 空白UUID
        { add: '1.1.1.1', port: '443', id: 'invalid-uuid' }, // 无效UUID格式
        { add: '1.1.1.1', port: '443', id: '12345' } // UUID太短
      ];

      for (const jsonObj of invalidFieldTests) {
        const base64Content = btoa(JSON.stringify(jsonObj));
        const testUrl = `vmess://${base64Content}`;
        const result = validateVMessInput(testUrl);
        assert.isFalse(result.isValid, `应该拒绝无效字段: ${JSON.stringify(jsonObj)}`);
      }
    });

    it('应该拒绝嵌套过深的JSON', () => {
      // 创建嵌套很深的对象
      let deepObject = { add: '1.1.1.1', port: '443', id: '12345678-1234-1234-1234-123456789012' };
      for (let i = 0; i < 100; i++) {
        deepObject = { nested: deepObject };
      }

      const base64Content = btoa(JSON.stringify(deepObject));
      const testUrl = `vmess://${base64Content}`;
      const result = validateVMessInput(testUrl);
      assert.isFalse(result.isValid);
      assert.include(result.error, 'Missing required field');
    });

    it('应该拒绝包含危险内容的JSON', () => {
      const dangerousJsonTests = [
        {
          add: '1.1.1.1',
          port: '443',
          id: '12345678-1234-1234-1234-123456789012',
          __proto__: { malicious: true }
        },
        {
          add: '1.1.1.1',
          port: '443',
          id: '12345678-1234-1234-1234-123456789012',
          constructor: { prototype: { evil: true } }
        },
        {
          add: 'javascript:alert(1)',
          port: '443',
          id: '12345678-1234-1234-1234-123456789012'
        },
        {
          add: '1.1.1.1',
          port: '443',
          id: '12345678-1234-1234-1234-123456789012',
          eval: 'malicious code'
        }
      ];

      for (const jsonObj of dangerousJsonTests) {
        const base64Content = btoa(JSON.stringify(jsonObj));
        const testUrl = `vmess://${base64Content}`;
        const result = validateVMessInput(testUrl);
        // 这些应该被字段验证拒绝，而不是因为危险内容
        assert.isFalse(result.isValid, `应该拒绝危险JSON: ${JSON.stringify(jsonObj)}`);
      }
    });
  });

  describe('边界条件和异常处理测试', () => {
    it('应该处理null和undefined输入', () => {
      const nullTests = [null, undefined, ''];
      
      for (const testInput of nullTests) {
        const result = validateVMessInput(testInput);
        assert.isFalse(result.isValid);
        assert.include(result.error, 'must be a non-empty string');
      }
    });

    it('应该处理非字符串输入', () => {
      const nonStringTests = [
        123,
        true,
        false,
        {},
        [],
        function() {},
        Symbol('test'),
        new Date()
      ];

      for (const testInput of nonStringTests) {
        const result = validateVMessInput(testInput);
        assert.isFalse(result.isValid);
        assert.include(result.error, 'must be a non-empty string');
      }
    });

    it('应该处理错误的协议前缀', () => {
      const wrongProtocolTests = [
        'http://base64content',
        'https://base64content',
        'ss://base64content',
        'trojan://base64content',
        'vless://base64content',
        'vmess:base64content', // 缺少//
        'vmess//base64content', // 缺少:
        'VMESS://base64content', // 大小写
        ' vmess://base64content', // 前导空格
        'vmess:// base64content' // 协议后空格
      ];

      for (const testUrl of wrongProtocolTests) {
        const result = validateVMessInput(testUrl);
        assert.isFalse(result.isValid);
        assert.include(result.error, 'must start with vmess://');
      }
    });

    it('应该处理内存耗尽攻击', () => {
      // 测试大量重复字段的JSON
      const attackObject = {
        add: '1.1.1.1',
        port: '443',
        id: '12345678-1234-1234-1234-123456789012'
      };
      
      // 添加大量字段
      for (let i = 0; i < 1000; i++) {
        attackObject[`field_${i}`] = `value_${i}`.repeat(100);
      }

      const attackJson = JSON.stringify(attackObject);
      if (attackJson.length <= 20480) { // 如果在限制内
        const base64Content = btoa(attackJson);
        if (base64Content.length <= 10240) { // 如果Base64也在限制内
          const testUrl = `vmess://${base64Content}`;
          const result = validateVMessInput(testUrl);
          // 应该能正常处理，因为在限制范围内
          assert.isTrue(result.isValid || result.error.includes('too long'));
        }
      }
    });
  });

  describe('性能和资源消耗测试', () => {
    it('应该在合理时间内完成验证', () => {
      const validConfig = {
        add: '1.1.1.1',
        port: '443',
        id: '12345678-1234-1234-1234-123456789012'
      };
      const base64Content = btoa(JSON.stringify(validConfig));
      const testUrl = `vmess://${base64Content}`;

      const startTime = performance.now();
      const result = validateVMessInput(testUrl);
      const endTime = performance.now();
      const duration = endTime - startTime;

      assert.isTrue(result.isValid);
      assert.ok(duration < 10, `验证时间过长: ${duration}ms`); // 应该在10ms内完成
    });

    it('应该限制内存使用', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 执行多次验证
      for (let i = 0; i < 100; i++) {
        const config = {
          add: `${i}.1.1.1`,
          port: '443',
          id: `${i.toString().padStart(8, '0')}-1234-1234-1234-123456789012`
        };
        const base64Content = btoa(JSON.stringify(config));
        const testUrl = `vmess://${base64Content}`;
        validateVMessInput(testUrl);
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
      
      assert.ok(memoryIncrease < 10, `内存使用过多: ${memoryIncrease}MB`); // 应该少于10MB
    });
  });
});
