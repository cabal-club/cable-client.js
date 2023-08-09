/* translation layer between old cabal-client api and the new library cable-client. 
 * this allows cabal-cli to operate on `cable-client` without needing to change a cabal-cli instance :) */
const EventEmitter = require("events").EventEmitter
const CableClient = require("./cable-client.js")

const cableclient = new CableClient()

class User {
  constructor(key, name) {
    this.name = name
    this.key = key
  }
  isAdmin() { return false }
  isModerator() { return false }
  isHidden() { return false }
}

class CabalDetails extends EventEmitter {
  constructor() {
    super()
    this.key = "a-cabal-key"
    this.statusMessages = []
    this.chat = {"default": []}
    this.cc = cableclient
    this.showIds = false
    this.channels = ["default"]
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
    const key = this.cc.localUser.key
    const users = {}
    users[key] = this.cc.localUser
    return users
  }
  getChannelMembers() { return [this.cc.localUser] }
  addStatusMessage(m) { 
    this.cc.addStatusMessage(m, this.getCurrentChannel()) 
  }
  processLine(line) {
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
          this.cc.join(value)
          if (!this.channels.includes(value)) {
            this.channels.push(value)
          }
          this.currentChannel = value
          break
        case "l":
        case "leave":
        // TODO (2023-08-07): add extra leave logic for picking current channel better
          if (this.channels.includes(value)) {
            let channelIndex = this.channels.indexOf(value)
            this.channels.splice(channelIndex, 1)
          }
          this.cc.leave(value)
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
  }
  publishMessage() { }
}

class Client {
  constructor() {
    this.details = new CabalDetails()
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
  static getCabalDirectory() { return "/home/cblgh/code/cabal-club/grant-work-2022/cable-client/cabal-test" }

  /* variations of the same: getting the cabal instance */
  // for cable-client, we'll only operate on a single cabal 
  cabalToDetails () { return this.getCurrentCabal() }
  createCabal() { return this.details }
  getDetails (key) { return this.details }
  getCurrentCabal() { return this.details }
  focusCabal() { return this.details }
  _getCabalByKey(key) { return this.details }

  getCabalKeys() { return [this.details.key] }

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
