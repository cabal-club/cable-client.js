/* translation layer between old cabal-client api and the new library cable-client. 
 * this allows cabal-cli to operate on `cable-client` without needing to change a cabal-cli instance :) */
const EventEmitter = require("events").EventEmitter
const CableClient = require("./cable-client.js")
const { Level } = require("level")
const { MemoryLevel } = require("memory-level")


class User {
  constructor(key, name) {
    this.name = name
    this.key = key
  }
  isAdmin() { return false }
  isModerator() { return false }
  isHidden() { return false }
}

// TODO (2023-08-23): halt calls of cc's methods until cc.ready has fired
class CabalDetails extends EventEmitter {
  constructor(opts, done) {
    super()
    this.key = "1115a517c5922baa9594f5555c16e091ce4251579818fb4c4f301804c847f222"
    this.statusMessages = []
    this.chat = {"default": []}

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
    this.cc.getChat(this.getCurrentChannel(), {}, cb)
  }

  getTopic() { return this.cc.getTopic(this.getCurrentChannel()) }
  focusChannel(ch) {
    this.emit("update", this)
    this.cc.focus(ch)
    this.cc.getInformation(ch)
  }
  getLocalName() { 
    return this.cc.localUser.name
  }
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
  getChannelMembers() { return [this.cc.localUser] }
  addStatusMessage(m) {
    this.cc.addStatusMessage(m, this.getCurrentChannel()) 
  }
  processLine(line, cb) {
    this.cc.processLine(line, cb)
    /*
    if (line.length === 0) { return }
    if (line.startsWith("/")) {
      const delim = line.indexOf(" ")
      const command = line.slice(1, delim)
      const value = line.slice(delim).trim()
      switch (command) {
        case "nick":
        case "name":
          this.cc.setName(value, () => {
            this.emit("update", this)
          })
          return
          break
        case "j":
        case "join":
          if (!this.cc.getJoinedChannels().includes(value)) {
            this.cc.join(value)
          }
          break
        case "l":
        case "leave":
        // TODO (2023-08-07): add extra leave logic for picking current channel better
          if (this.cc.getJoinedChannels().includes(value)) {
            this.cc.leave(value)
          }
          break
        case "topic":
          this.cc.setTopic(value, this.getCurrentChannel(), () => {
            this.emit("update", this)
          })
          break
      }
      this.emit("update", this)
      return
    }
    // it was a chat message
    this.cc.postText(line, this.getCurrentChannel())
    // this.chat[this.getCurrentChannel()].push({ 
    //   key: this.cc.localUser.key, 
    //   value: { 
    //     timestamp: +(new Date()),
    //     type: "chat/text",
    //     content: {
    //       text: line
    //     }
    //   }
    // })
    setTimeout(() => {
      this.emit("update", this)
    }, 40)
    */
  }
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
    this.cabals = []
    this.cabalKeys = []
  }

  getJoinedChannels() { return this.details.getJoinedChannels() }

  /* methods where we punt to cabal details */
  getUsers() { return this.details.getUsers() }
  getMessages(opts, cb) { this.details.getChat(cb) }
  focusChannel(ch) { this.details.focusChannel(ch) }

  /* static methods */
  static getDatabaseVersion () { return "v1.3.37" }
  // TODO (2023-08-23): don't hardcode this :))
  static getCabalDirectory() { return "/home/cblgh/code/cabal-club/cable-town/cable-client/cable-client/cabal-test" }

  /* variations of the same: getting the cabal instance */
  // for cable-client, we'll only operate on a single cabal 
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
  addCabal(key) {}
  getCommands() {}
}

module.exports = {
  Client, 
  CabalDetails
}
