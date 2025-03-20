/**
 * node-webpmux Polyfill for Termux
 */

class WebPImage {
  static async from() { 
    return new this(); 
  }
  setExif() {}
  async save() {}
}

module.exports = {
  Image: WebPImage,
  EXIF: { 
    create: () => Buffer.from([]) 
  }
};
