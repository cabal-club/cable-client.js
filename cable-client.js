const EventEmitter = require("events").EventEmitter
const debug = require("debug")("cable-client")
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
class CableClient extends EventEmitter {
  constructor() {
    super()
    debug("new cable client instance")
    this._initialize()
    this.channels = new Map()
    this._addChannel("default")
    this.localUser = new User(this.core.kp.publicKey.toString("hex"), "")
  }

  _addChannel(name) {
    this.channels.set(name, new ChannelDetails(this.core.getChat.bind(this.core), name))
  }

  create() {
    debug("create")
  }
  _initialize() {
    debug("_initialize")
    this.focus("default")
    this.core = new CableCore()
    // TODO (2023-08-02): get joined channels and populate this.channels
  }
  _initializeProtocol() {
    debug("initialize protocol")
  }
  focus(channel) {
    debug("focus channel %s", channel)
  }

  channelInformation(channel) {
    debug("channel information %s", channel)
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
    debug("get topic for %s", channel)
  }
  getUsers() {
    debug("get users")
  }
  getAllChannels() {
    debug("get all channels")
  }
  getJoinedChannels() {
    debug("get joined channels")
  }
  getCurrentChannel() {
    debug("get current channel")
  }

  /* post producing methods */
  join(channel) {
    debug("join channel %s", channel)
  }
  leave(channel) {
    debug("leave channel %s", channel)
  }
  postText(text, channel, cb) {
    debug("post %s to channel %s", text, channel)
    this.core.postText(channel, text, () => {
      if (cb) { cb() }
    })
  }
  addStatusMessage(statusMessage, channel) {
    debug("add status message %s to channel %s", statusMessage, channel)
  }
  setTopic(topic, channel) {
    debug("set topic %s for channel %s", topic, channel)
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
