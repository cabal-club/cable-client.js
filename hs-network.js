const lpstream = require("length-prefixed-stream")
const b4a = require("b4a")
const hyperswarm = require("hyperswarm")
const crypto = require('hypercore-crypto')
const debug = require("debug")("transport/hyperswarm")
const EventEmitter = require("events").EventEmitter

class Network extends EventEmitter {
  constructor(opts) {
    super()
    if (!opts) { 
      opts = {} 
    }

    this.port = opts.dhtPort || 13331
    this.peers = []

    const discoveryKey = crypto.discoveryKey(b4a.from(opts.key, 'hex'))

    const swarmOpts = { preferredPort: this.port }
    const swarm = hyperswarm(swarmOpts)
    swarm.join(discoveryKey, {
      lookup: true,
      announce: true
    })

    swarm.on('connection', (socket, info) => {
			this._setupPeer(socket)
    })
  }

  _setupPeer(socket) {
    const peer = { 
      id: (Math.random() + "").slice(2), 
      encode: lpstream.encode(), 
      decode: lpstream.decode(),
      socket
    }
    socket.pipe(peer.decode)
    peer.encode.pipe(socket)
    peer.decode.on("data", this._handleSocketData.bind(this))

    this.peers.push(peer)
    this.emit("peer-connected", socket)

    socket.on("end", () => {
      const index = this.peers.findIndex(p => p.id === peer.id)
      this.peers.splice(index, 1)
      debug("connection:end")
      this.emit("peer-disconnected", socket)
    })
  }

  _handleSocketData(msg) {
    const data = b4a.from(msg.toString("hex"), "hex")
    debug("data", data)
    this.emit("data", { address: "", data })
  }

  broadcast (data) {
    debug("broadcast data", data)
    this.peers.forEach(peer => {
      peer.encode.write(data)
    })
  }
}
module.exports = { Network }
