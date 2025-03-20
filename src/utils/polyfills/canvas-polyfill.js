/**
 * Canvas Polyfill for Termux
 */

const Jimp = require('jimp');

class CanvasReplacement {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    console.log('Canvas polyfill initialized');
  }

  getContext() {
    return {
      fillRect: () => {},
      clearRect: () => {},
      drawImage: () => {},
      fillText: () => {},
      measureText: (text) => ({ width: text.length * 5 })
    };
  }

  toBuffer() {
    return Buffer.from('dummy');
  }
}

module.exports = CanvasReplacement;
module.exports.createCanvas = (w, h) => new CanvasReplacement(w, h);
module.exports.loadImage = async () => ({ width: 10, height: 10 });
