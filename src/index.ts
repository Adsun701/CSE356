// ... add imports and fill in the code
import * as Y from 'yjs';
//import QuillDeltaToHtmlConverter from 'quill-delta-to-html'
class CRDTFormat {
  public bold?: Boolean = false;
  public italic?: Boolean = false;
  public underline?: Boolean = false;
};

exports.CRDT = class {
  ydoc;
  cb;
  ytext;

  constructor(cb: (update: string, isLocal: Boolean) => void) {
    ['update', 'insert', 'delete', 'toHTML'].forEach(f => (this as any)[f] = (this as any)[f].bind(this));
    this.cb = cb;
    this.ydoc = new Y.Doc();
    this.ytext = this.ydoc.getText();
    this.ydoc.on('update', (update: Uint8Array) => {
      const u8 = Array.from(update);
      const array = JSON.stringify(u8);
      this.cb(array, true);
    })
  }

  update(update: string) {
    Y.applyUpdate(this.ydoc, Uint8Array.from(JSON.parse(update)));
  }

  insert(index: number, content: string, format: CRDTFormat) {
    this.ytext.insert(index, content, format)
  }

  insertImage(index: number, url: string) {
    this.ytext.applyDelta([{retain: index}, {insert: {image: url}}]);
  }

  delete(index: number, length: number) {
    this.ytext.delete(index, length);
  }
  
  toHTML() {
    var qd2hc = require('quill-delta-to-html').QuillDeltaToHtmlConverter;
    return (new qd2hc(this.ytext.toDelta())).convert();
  }
};