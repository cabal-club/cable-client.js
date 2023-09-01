const EventEmitter = require("events").EventEmitter
const createLanStream = require("dgram-broadcast")
const b4a = require("b4a")
const debug = require("debug")("transport/dgram-broadcast")
const lpstream = require("length-prefixed-stream")

// network events:
//  connection 
//  join - emit(peer)
//  leave - emit(peer)
//  data

class Network extends EventEmitter {
  constructor(opts) {
    super()
    if (!opts) { 
      opts = {}
    }

    const port = opts.lanPort || 13332
    this.encode = lpstream.encode()
    this.decode = lpstream.decode()
    this.stream = createLanStream(port, true)
    this.encode.pipe(this.stream)
    this.stream.pipe(this.decode)

    this.decode.on("data", this._handleSocketData.bind(this))
  }

  _handleSocketData (msg) {
    const data = b4a.from(msg.toString("hex"), "hex")
    debug("received from", msg.address)
    debug("actual data was", data)
    this.emit("data", { address: msg.address, data })
  }

  broadcast(data) {
    debug("broadcast data", data)
    this.encode.write(data)
    // this.stream.write(data)
  }
}

module.exports = { Network }
