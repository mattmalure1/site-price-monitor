// zip-writer.js — Minimal ZIP file writer (STORE only, no compression)
// Produces valid ZIP files without external dependencies
// Declarative content script (IIFE, no ES modules)

(function () {
  'use strict';

  window.__discordExporter = window.__discordExporter || {};

  // CRC-32 lookup table
  var crcTable = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c;
    }
    return table;
  })();

  function crc32(data) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function toUint8Array(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof input === 'string') return new TextEncoder().encode(input);
    return new Uint8Array(input);
  }

  // Write a 16-bit little-endian value into a buffer
  function writeU16(buf, offset, val) {
    buf[offset] = val & 0xFF;
    buf[offset + 1] = (val >> 8) & 0xFF;
  }

  // Write a 32-bit little-endian value into a buffer
  function writeU32(buf, offset, val) {
    buf[offset] = val & 0xFF;
    buf[offset + 1] = (val >> 8) & 0xFF;
    buf[offset + 2] = (val >> 16) & 0xFF;
    buf[offset + 3] = (val >> 24) & 0xFF;
  }

  function ZipWriter() {
    this._entries = [];
  }

  ZipWriter.prototype.addFile = function (name, data) {
    var bytes = toUint8Array(data);
    var nameBytes = new TextEncoder().encode(name);
    this._entries.push({
      name: name,
      nameBytes: nameBytes,
      data: bytes,
      crc: crc32(bytes)
    });
  };

  ZipWriter.prototype.toBlob = function () {
    var entries = this._entries;

    // Use a fixed DOS date/time for simplicity (2024-01-01 00:00:00)
    var dosTime = 0x0000; // 00:00:00
    var dosDate = 0x5821; // 2024-01-01

    // Calculate total size
    var localHeadersSize = 0;
    var centralDirSize = 0;
    var dataSize = 0;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      localHeadersSize += 30 + e.nameBytes.length;
      dataSize += e.data.length;
      centralDirSize += 46 + e.nameBytes.length;
    }

    var totalSize = localHeadersSize + dataSize + centralDirSize + 22;
    var buf = new Uint8Array(totalSize);
    var offset = 0;
    var centralEntries = [];

    // Write local file headers + data
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var localOffset = offset;
      centralEntries.push(localOffset);

      // Local file header signature
      writeU32(buf, offset, 0x04034B50); offset += 4;
      // Version needed to extract (2.0)
      writeU16(buf, offset, 20); offset += 2;
      // General purpose bit flag
      writeU16(buf, offset, 0); offset += 2;
      // Compression method (0 = STORE)
      writeU16(buf, offset, 0); offset += 2;
      // Last mod file time
      writeU16(buf, offset, dosTime); offset += 2;
      // Last mod file date
      writeU16(buf, offset, dosDate); offset += 2;
      // CRC-32
      writeU32(buf, offset, e.crc); offset += 4;
      // Compressed size (same as uncompressed for STORE)
      writeU32(buf, offset, e.data.length); offset += 4;
      // Uncompressed size
      writeU32(buf, offset, e.data.length); offset += 4;
      // File name length
      writeU16(buf, offset, e.nameBytes.length); offset += 2;
      // Extra field length
      writeU16(buf, offset, 0); offset += 2;
      // File name
      buf.set(e.nameBytes, offset); offset += e.nameBytes.length;
      // File data
      buf.set(e.data, offset); offset += e.data.length;
    }

    // Write central directory
    var centralDirOffset = offset;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];

      // Central directory file header signature
      writeU32(buf, offset, 0x02014B50); offset += 4;
      // Version made by (2.0, DOS)
      writeU16(buf, offset, 20); offset += 2;
      // Version needed to extract (2.0)
      writeU16(buf, offset, 20); offset += 2;
      // General purpose bit flag
      writeU16(buf, offset, 0); offset += 2;
      // Compression method (0 = STORE)
      writeU16(buf, offset, 0); offset += 2;
      // Last mod file time
      writeU16(buf, offset, dosTime); offset += 2;
      // Last mod file date
      writeU16(buf, offset, dosDate); offset += 2;
      // CRC-32
      writeU32(buf, offset, e.crc); offset += 4;
      // Compressed size
      writeU32(buf, offset, e.data.length); offset += 4;
      // Uncompressed size
      writeU32(buf, offset, e.data.length); offset += 4;
      // File name length
      writeU16(buf, offset, e.nameBytes.length); offset += 2;
      // Extra field length
      writeU16(buf, offset, 0); offset += 2;
      // File comment length
      writeU16(buf, offset, 0); offset += 2;
      // Disk number start
      writeU16(buf, offset, 0); offset += 2;
      // Internal file attributes
      writeU16(buf, offset, 0); offset += 2;
      // External file attributes
      writeU32(buf, offset, 0); offset += 4;
      // Relative offset of local header
      writeU32(buf, offset, centralEntries[i]); offset += 4;
      // File name
      buf.set(e.nameBytes, offset); offset += e.nameBytes.length;
    }

    // End of central directory record
    var centralDirEnd = offset;
    writeU32(buf, offset, 0x06054B50); offset += 4;
    // Disk number
    writeU16(buf, offset, 0); offset += 2;
    // Disk with central directory
    writeU16(buf, offset, 0); offset += 2;
    // Number of central directory entries on this disk
    writeU16(buf, offset, entries.length); offset += 2;
    // Total number of central directory entries
    writeU16(buf, offset, entries.length); offset += 2;
    // Size of central directory
    writeU32(buf, offset, centralDirEnd - centralDirOffset); offset += 4;
    // Offset of central directory
    writeU32(buf, offset, centralDirOffset); offset += 4;
    // Comment length
    writeU16(buf, offset, 0); offset += 2;

    return new Blob([buf], { type: 'application/zip' });
  };

  window.__discordExporter.ZipWriter = ZipWriter;
})();
