const EventEmitter = require("events").EventEmitter
const debugParent = "cable-client"
const debug = require("debug")(debugParent)
const startDebug = (name) => { return require("debug")(`${debugParent}/${name}`) }
const CableCore = require("cable-core/index.js").CableCore
const ChannelDetails = require("./channel.js").ChannelDetails

function noop () {}

class User {
  constructor(key, name) {
    this.currentName = name
    this.key = key

    Object.defineProperty(this, 'name', {
      set: (name) => {
        this.currentName = name
      },
      get: () => {
        if (this.currentName.length > 0) {
          return this.currentName
        }
        return this.key.slice(0,8)
      }
    })
  }

  isAdmin() { return false }
  isModerator() { return false }
  isHidden() { return false }
}

/* goals:
 * calls to cable client methods are synchronous as far as possible 
*/
// TODO (2023-08-07): introduce some notion of a "ready" event, which is when cable-client has finished intializing
// everything and is ready to have its functions called
class CableClient extends EventEmitter {
  constructor() {
    super()
    debug("new cable client instance")
    this.channels = new Map()
    this._initialize()
    this._addChannel("default", true)
    this.currentChannel = "default"
    this.localUser = new User(this.core.kp.publicKey.toString("hex"), "")
  }

  _addChannel(name, joined=false) {
    debug("joined", joined)
    if (this.channels.has(name)) { return }
    const channel = new ChannelDetails(this.core.getChat.bind(this.core), name)
    if (joined) { channel.join() }
    this.channels.set(name, channel)
  }

  create() {
    debug("create")
  }

  // TODO (2023-08-07): add to ready queu
  _initialize() {
    const log = startDebug("_initialize")
    this.focus("default")
    this.core = new CableCore()
    // get joined channels and populate this.channels
    this.core.getJoinedChannels((err, channels) => {
      if (err) { 
        log("had err %s when getting joined channels from core", err)
        return 
      }
      channels.forEach(ch => this._addChannel(channel, true))
    })
  }
  _initializeProtocol() {
    debug("initialize protocol")
  }
  focus(channel) {
    if (!this.channels.has(channel)) { return }
    this.channels.get(this.currentChannel).unfocus()
    this.channels.get(channel).focus()
    this.currentChannel = channel
    debug("focus channel %s", channel)
    debug(this.channels)
  }

  // get channel information
  getInformation(channel) {
    if (!this.channels.has(channel)) { return null }
    const info = this.channels.get(channel).getInfo()
    debug("channel information %s", info)
    return info
  }
  _causalSort() {
    debug("causal sort")
  }

  /* getting information */
  getChat(channel, opts, cb) {
    if (!opts) { opts = {} }
    debug("get chat %s", channel)
    if (this.channels.has(channel)) {
      return this.channels.get(channel).getPage(opts, cb)
    }
    cb([])
  }
  getLocalUser() {
    debug("get local user")
    return this.localUser
  }
  getTopic(channel) {
    if (!this.channels.has(channel)) { return "" }
    debug("get topic for %s", channel)
    return this.channels.get(channel).topic
  }
  getUsers() {
    debug("get users")
  }
  getAllChannels() {
    debug("get all channels")
  }
  getJoinedChannels() {
    const joined = []
    for (let [name, details] of this.channels) {
      if (details.joined) {
        joined.push(name)
      }
    }
    debug("get joined channels %s", joined)
    return joined.sort()
  }
  getCurrentChannel() {
    return this.currentChannel
    debug("get current channel")
  }

  /* post producing methods */
  join(channel, focus=true) {
    debug("join channel %s", channel)
    this._addChannel(channel, true)
    if (focus) { this.focus(channel) }
    this.core.join(channel)
  }
  leave(channel) {
    if (!this.channels.has(channel)) { return }
    this.channels.get(channel).leave()
    this.core.leave(channel)
    debug("leave channel %s", channel)
  }
  postText(text, channel, cb) {
    if (!cb) { cb = noop }
    debug("post %s to channel %s", text, channel)
    this.core.postText(channel, text, () => {
      if (cb) { cb() }
    })
  }
  addStatusMessage(statusMessage, channel) {
    if (!this.channels.has(channel)) { return }
    this.channels.get(channel).addVirtualMessage(statusMessage)
    debug("add status message %s to channel %s", statusMessage, channel)
  }
  // TODO (2023-08-07): emit event
  setTopic(topic, channel, cb) {
    if (!cb) { cb = noop }
    this.core.setTopic(channel, topic, () => {
      debug("set topic %s for channel %s", topic, channel)
      this.channels.get(channel).topic = topic
      cb()
    })
  }
  // TODO (2023-08-01): change to core.setName
  setName(name, done) {
    if (!done) { done = noop }
    debug("set name to %s", name)
    this.core.setNick(name, () => {
      this.localUser.name = name
    })
  }

  /* storage management related methods (delete also produces posts) */
  deleteSingle(hash) {
    debug("request single delete for hash %s", hash)
  }
  deleteMany(hashes) {
    debug("request many deletes for hashes %s", hashes.join("\n"))
  }
  dropSingle(hash) {
    debug("drop single hash %s from local database", hash)
  }
  dropMany() {
    debug("drop many hashes hashes %s", hashes.join("\n"))
  }
}

/*
// alt 1: ts-based
getChat(channel, { limit: 200 })
getChat(channel, { tsOlderThan: 1hourago, limit: 200 })
getChat(channel, { tsOlderThan: 0, tsNewerThan: 2hoursAgo, limit: 200 })
getChat(channel, { tsNewerThan: 2hoursAgo, limit: 200 })

// alt 2: hash-based
getChat(channel, { limit: 200 })
getChat(channel, { olderThanHash: hash, limit: 200 })
getChat(channel, { newerThanHash: hash, olderThanHash: hash, limit: 200 })
// use links + ts info to causally sort postArray and return sorted 
const sorted = _causalSort(postArray)
*/

// paginate is still speculative; unsure how to make it work good in practice
// i think get chat with time+hash anchors and limits is better?

// scroll up
// details.paginate({clientOptions, direction: intoHistory}).render(messages)
// scroll down
// details.paginate({clientOptions, direction: intoFuture}).render(messages)

// details.on("chat-message", render(channel, hash, msg))
// details.on("topic", setTopic(channel, hash, msg))
// details.on("message-removed", updateRender(channel, hash, { remove:true }))
// details.on("name-changed", updateRender(pubkey, newName))
// details.on("new-channel", (channel))

// // Q: should we render deleted post as "*this post was deleted*"? e.g. with a virtual message `type: deleted`
// details.deleteSingle(hashMsg)
module.exports = CableClient
