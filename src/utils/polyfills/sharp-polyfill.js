/**
 * Sharp Polyfill for Termux
 */

function createSharpPolyfill(input) {
  return {
    resize: () => createSharpPolyfill(input),
    jpeg: () => createSharpPolyfill(input),
    png: () => createSharpPolyfill(input),
    webp: () => createSharpPolyfill(input),
    toBuffer: async () => {
      if (Buffer.isBuffer(input)) return input;
      return Buffer.from('dummy');
    },
    toFile: async (path) => {
      const fs = require('fs');
      if (Buffer.isBuffer(input)) {
        fs.writeFileSync(path, input);
      } else {
        fs.writeFileSync(path, Buffer.from('dummy'));
      }
      return { width: 10, height: 10 };
    }
  };
}

module.exports = createSharpPolyfill;
