// 零依赖 ZIP 生成器（store 模式，无压缩），逐个消费异步数据源以控制内存
(() => {
  'use strict';

  const TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    TABLE[n] = c >>> 0;
  }

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  window.buildZip = async function (source) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    let count = 0;

    for await (const item of source) {
      const name = enc.encode(item.name);
      const data = item.data;
      const crc = crc32(data);

      const local = new Uint8Array(30 + name.length);
      const v = new DataView(local.buffer);
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 0x0800, true);
      v.setUint32(14, crc, true);
      v.setUint32(18, data.length, true);
      v.setUint32(22, data.length, true);
      v.setUint16(26, name.length, true);
      local.set(name, 30);

      const cd = new Uint8Array(46 + name.length);
      const c = new DataView(cd.buffer);
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true);
      c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      cd.set(name, 46);

      parts.push(local, new Blob([data]));
      central.push(cd);
      offset += local.length + data.length;
      count++;
    }

    const cdSize = central.reduce((sum, x) => sum + x.length, 0);
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, count, true);
    e.setUint16(10, count, true);
    e.setUint32(12, cdSize, true);
    e.setUint32(16, offset, true);

    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  };
})();
