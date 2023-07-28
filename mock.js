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
    this.channels = ["default"]
    this.chindex = 0
    this.topics = {"default": "placeholder topic"}
    this.core = { adminKeys: [], modKeys: [] }
  }

  getChat() {
    return this.chat[this.getCurrentChannel()]
  }
  getUsers() { return [] }
  getTopic() { return this.topics[this.getCurrentChannel()] }
  focusChannel(ch) {
    this.chindex = this.channels.indexOf(ch)
    this.emit("update", this)
  }
  getLocalName() { return this.localUser.name }
  getChannels() { return this.channels }
  getCurrentChannel() { return this.channels[this.chindex] }
  isChannelPrivate(ch) { return false }
  getChannelMembers() { return [this.localUser] }
  addStatusMessage(m) { this.statusMessages.push(m) }
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
  showIds() { this.chat.push("show ids") }
}

class Client {
  constructor() {
    this.details = new CabalDetails()
    this.cabals = []
    this.cabalKeys = []
  }
  createCabal() { return this.details }
  getCommands() {}
  getUsers() { return [this.details.localUser] }
  getJoinedChannels() { return ["default"] }
  getNumberUnreadMessages() { return 0 }
  getMentions() { return [] }
  getDetails (key) { return this.details }
  getMessages(opts, cb) { cb(this.details.getChat()) }
  focusChannel(ch) { this.details.focusChannel(ch) }
  static getDatabaseVersion () { return "v1.3.37" }
  static getCabalDirectory() { return "/home/cblgh/code/cabal-club/grant-work-2022/cable-client/cabal-test" }
  markChannelRead(ch) { }
  getCurrentCabal() { return this.details }
  cabalToDetails () { return this.getCurrentCabal() }
  focusCabal() { return this.details }
  getCabalKeys() { return [this.details.key] }
  addCabal(key) {}
  _getCabalByKey(key) {return this.details}
}

module.exports = {
  Client, 
  CabalDetails
}
