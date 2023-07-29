/* translation layer between old cabal-client api and the new library cable-client. 
 * this allows cabal-cli to operate on `cable-client` without needing to change a cabal-cli instance :) */
const EventEmitter = require("events").EventEmitter

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
    this.key = "asdasd"
    this.statusMessages = []
    this.chat = {"default": []}
    this.localUser = new User("123412341234", "mock-user")
    this.showIds = false
    this.channels = ["default"]
    this.chindex = 0
    this.topics = {"default": "placeholder topic"}
    this.core = { adminKeys: [], modKeys: [] }
  }

  getChat() {
    return this.chat[this.getCurrentChannel()]
  }

  getTopic() { return this.topics[this.getCurrentChannel()] }
  focusChannel(ch) {
    this.chindex = this.channels.indexOf(ch)
    this.emit("update", this)
  }
  getLocalName() { return this.localUser.name }
  getChannels() { return this.channels }
  getCurrentChannel() { return this.channels[this.chindex] }
  isChannelPrivate(ch) { return false }
  getUsers() { 
    const key = this.localUser.key
    const users = {}
    users[key] = this.localUser
    return users
  }
  getChannelMembers() { return [this.localUser] }
  addStatusMessage(m) { 
    console.log(m);this.statusMessages.push(m) 
    this.chat[this.getCurrentChannel()].push({ 
      key: this.localUser.key, 
      value: { 
        timestamp: +(new Date()),
        type: "status",
        content: {
          text: m.text
        }
      }
    })
  }
  processLine(line) {
    if (line.startsWith("/")) {
      const delim = line.indexOf(" ")
      const command = line.slice(1, delim)
      const value = line.slice(delim)
      switch (command) {
        case "j":
        case "join":
          if (!this.channels.includes(value)) {
            this.channels.push(value)
            this.chat[value] = []
          }
          this.currentChannel = value
          break
        case "topic":
          this.topics[this.getCurrentChannel()] = value
          break
      }
      this.emit("update", this)
      return
    }
    this.chat[this.getCurrentChannel()].push({ 
      key: this.localUser.key, 
      value: { 
        timestamp: +(new Date()),
        type: "chat/text",
        content: {
          text: line
        }
      }
    })
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
  getJoinedChannels() { return ["default"] }

  /* methods where we punt to cabal details */
  getUsers() { return this.details.getUsers() }
  getMessages(opts, cb) { cb(this.details.getChat()) }
  focusChannel(ch) { this.details.focusChannel(ch) }

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

  /* unimplemented/touched methods */
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
