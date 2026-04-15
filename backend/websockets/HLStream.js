import WebSocket from "ws";
import EventEmitter from "events";

class HLStream extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.ws = null;
    this.subs = new Map();
    this.backoffMs = 500;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on("open", () => {
      this.backoffMs = 500;
      for (const sub of this.subs.values()) this._sendSub(sub);
    });

    this.ws.on("message", (buf) => {
      const msg = JSON.parse(buf.toString());
      this.emit("raw", msg);
    });

    this.ws.on("close", () => this._reconnect());
    this.ws.on("error", () => {}); // close will follow in most cases
  }

  _reconnect() {
    setTimeout(
      () => {
        this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
        this.connect();
      },
      this.backoffMs + Math.floor(Math.random() * 250),
    );
  }

  subscribe(sub) {
    const key = JSON.stringify(sub);
    if (this.subs.has(key)) return;
    this.subs.set(key, sub);
    if (this.ws?.readyState === WebSocket.OPEN) this._sendSub(sub);
  }

  _sendSub(subscription) {
    this.ws.send(JSON.stringify({ method: "subscribe", subscription }));
  }
}

export default HLStream;
