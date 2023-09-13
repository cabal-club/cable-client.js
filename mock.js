/* translation layer between old cabal-client api and the new library cable-client. 
 *                                                                       ^ notice the "-le" suffix; cable, not cabal! :)
 * this allows cabal-cli to operate on `cable-client` with only minimal changes to the cabal-cli codebase :) */

// mock.js basically acts as a guide for how existing cabal clients can be updated, showing the api changes between the
// old cabal-client and the new cable-client

const EventEmitter = require("events").EventEmitter
const CableClient = require("./cable-client.js")
const { Level } = require("level")
const { MemoryLevel } = require("memory-level")

class CabalDetails extends EventEmitter {
  constructor(opts, done) {
    super()
    // hardcoded key for proof of concept :)
    this.key = "1115a517c5922baa9594f5555c16e091ce4251579818fb4c4f301804c847f222"

    let level = Level
    if (opts.config.temp) {
      level = MemoryLevel
    }
    opts.config.key = this.key

    this.cc = new CableClient(level, opts)
    this.cc.ready(() => { done() })
    this.cc.on("update", () => {
      this.emit("update", this)
    })
    // events for slash-command output
    this.cc.on("info", (payload) => {
      this.emit("info", payload)
      this.emit("update")
    })
    this.cc.on("error", (err) => {
      this.emit("error", err)
      this.emit("update")
    })
    this.cc.on("end", (obj) => {
      this.emit("end", obj)
      this.emit("update")
    })
    Object.defineProperty(this, "showIds", {
      get: () => { return this.cc.showIds }
    })
    Object.defineProperty(this, "showHashes", {
      get: () => { return this.cc.showHashes }
    })
    this.core = { adminKeys: [], modKeys: [] }
  }

  getChat(cb) {
    // gets chat stored in local database; this is different from requesting a time window of posts from peers
    this.cc.getChat(this.getCurrentChannel(), { tsNewerThan: 0 } , cb)
  }

  getTopic() { return this.cc.getTopic(this.getCurrentChannel()) }
  focusChannel(ch) {
    this.emit("update", this)
    this.cc.focus(ch)
  }
  getLocalName() { return this.cc.localUser.name }
  getChannels(opts) { 
    if (!opts) { opts = {} }
    if (opts.onlyJoined) { return this.getJoinedChannels() }
    return this.cc.getAllChannels() 
  }
  getJoinedChannels() { return this.cc.getJoinedChannels() }
  getCurrentChannel() { return this.cc.getCurrentChannel() }
  isChannelPrivate(ch) { return false }
  getUsers() { 
    const usersMap = this.cc.getUsers()
    const obj = {}
    for (const pair of usersMap) {
      obj[pair[0]] = pair[1]
    }
    return obj
  }
  getChannelMembers() { return this.cc.getChannelMembers() }
  addStatusMessage(m) { this.cc.addStatusMessage(m, this.getCurrentChannel())  }
  processLine(line, cb) { this.cc.processLine(line, cb) }
  publishMessage() { }
}

// TODO (2023-08-23): decomplicate the ready queuing lol
class Client {
  constructor(opts) {
    this._ready = false
    this._start = () => {
      this._ready = true
      for (let fn of this.queue) { fn() } 
    }
    this.queue = []
    this.details = new CabalDetails(opts, this._start)
  }

  /* methods where we punt to cabal details */
  getJoinedChannels() { return this.details.getJoinedChannels() }
  getUsers() { return this.details.getUsers() }
  getMessages(opts, cb) { this.details.getChat(cb) }
  focusChannel(ch) { this.details.focusChannel(ch) }

  /* static methods */
  static getDatabaseVersion () { return "v1.3.37" }
  // TODO (2023-08-23): don't hardcode this :))
  static getCabalDirectory() { return "/home/cblgh/code/cabal-club/cable-town/cable-client/cable-client/cabal-test" }

  /* variations of the same: getting the cabal instance */
  // for cable-client, we'll only operate on a single cabal instance (if you want more, instantiate more cable-clients)
  cabalToDetails () { return this.details }
  createCabal() {
    return (new Promise((res, rej) => {
      this.queue.push(() => {
        return res(this.details)
      })
    }))
  }
  getDetails (key) { return this.details }
  getCurrentCabal() { return this.details }
  focusCabal() { return this.details }
  _getCabalByKey(key) { return this.details }

  getCabalKeys() { return [this.details.key] }
  addStatusMessage(m) {
    this.details.addStatusMessage(m)
  }

  /* unimplemented/untouched methods */
  getNumberUnreadMessages() { return 0 }
  getMentions() { return [] }
  markChannelRead(ch) { }
  addCabal(key) {
    return new Promise((res, rej) => {
      this.queue.push(() => {
        return res(this.details)
      })
    })
  }
  getCommands() {}
}

module.exports = {
  Client, 
  CabalDetails
}
