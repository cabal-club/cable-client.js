const EventEmitter = require("events").EventEmitter
const debugParent = "cable-client"
const debug = require("debug")(debugParent)
const startDebug = (name) => { return require("debug")(`${debugParent}/${name}`) }
const CableCore = require("cable-core/index.js").CableCore
const EventsManager = require("cable-core/index.js").EventsManager
const ChannelDetails = require("./channel.js").ChannelDetails
const replicationPolicy = require("./policy.js")
const Network = require("./network.js").Network

const DEFAULT_TTL = 3
const DEFAULT_CHANNEL_LIST_LIMIT = 100
const CHANNEL_LIST_RENEWAL_INTERVAL = 30 * 60 * 1000 // every 30 minutes

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
 * cable-client sets defaults, but users of cable-client can change them according to their needs
*/
// TODO (2023-08-07): introduce some notion of a "ready" event, which is when cable-client has finished intializing
// everything and is ready to have its functions called
//
// TODO (2023-08-09): figure out solution for connecting peers with requests and at what layer:
// * does cable-core have a list of peers? and when a new peer appears we send them our already issue set of requests
//
// TODO (2023-08-09): replication optimization: when we leave a channel, issue a new time range request with replication policy for unjoined channels
//
// TODO (2023-08-09): receive event from core when a time range request has reached end of life, enabling renewal of the request?

function timeWindowFromOffset(offset) {
  return +(new Date()) - offset
}

class CableClient extends EventEmitter {
  constructor(opts) {
    super()
    if (!opts) { opts = {} }
    this.events = new EventsManager()
    debug("new cable client instance")
    // TODO (2023-08-09): replication policies, accept defaults passed to cable client
    this.policies = {
      JOINED: new replicationPolicy.JoinedPolicy(),
      DROPPPED: new replicationPolicy.DroppedPolicy(),
      UNJOINED: new replicationPolicy.UnjoinedPolicy()
    }
    this.channels = new Map()
    // maps each user's public key to an instance of the User class
    this.users = new Map()
    this._initializeClient()
    this.join("default")
    this.currentChannel = "default"
    this.localUser = new User(this.core.kp.publicKey.toString("hex"), "")
    this.users.set(this.localUser.key, this.localUser)
    setTimeout(() => {
      this._initializeProtocol()
    }, 150)
  }

  _addChannel(name, join=false) {
    if (this.channels.has(name)) { return }
    const channel = new ChannelDetails(this.core.getChat.bind(this.core), name)
    // set channel instance's join boolean to true
    if (join) { channel.join() }
    this.channels.set(name, channel)
  }

  create() {
    debug("create")
  }

  // TODO (2023-08-07): add to ready queue
  _initializeClient() {
    const log = startDebug("_initialize")
    this.focus("default")
    this.core = new CableCore({ network: Network })
    this._registerEvents()
    // get joined channels and populate this.channels
    this.core.getJoinedChannels((err, channels) => {
      if (err) { 
        log("had err %s when getting joined channels from core", err)
        return 
      }
      channels.forEach(ch => {
        this._addChannel(channel, true)
        // TODO (2023-08-09): pipeline a set of promises to resolve
        // when all promises are resolved, tick one less on the ready queue
        this.core.getTopic(ch, (err, topic) => {
          if (err) { return }
          this.channels.get(channel).topic = topic
        })

        this.core.getUsersInChannel(ch, (err, users) => {
          if (err) { return }
          // TODO (2023-08-09): change structure of data returned by core?
          for (let userKey of users.keys()) {
            let name = users.get(userKey)
            if (name.length === 64) { name = "" }
            const u = new User(userKey, name)
            this.users.set(userKey, u)
          }
        })
      })
    })
  }

  _addUserIfNew(publicKey) {
    if (!this.users.has(publicKey)) {
      const u = new User(publicKey, "")
      this.users.set(publicKey, u)
    }
  }

  // listen for events that are emitted from cable-core when it has processed new posts
  _registerEvents() {
    const log = startDebug("events")
    // post/text
    this.events.register("chat", this.core, "chat/add", ({ channel, hash, post, publicKey }) => {
      this._addUserIfNew(publicKey)
      log("chat/add: new post in %s %O (hash %s) by %s", channel, post, hash, publicKey)
      this.emit("update")
    })

    // post/delete
    // TODO (2023-08-23): add toggle to show post hashes in cli + command to delete by hash
    this.events.register("chat", this.core, "chat/remove", ({ channel, topic, publicKey }) => {
      this._addUserIfNew(publicKey)
      log("chat/remove: (TODO in cli view) %s removed post with hash %s from channel", publicKey, hash, channel)
      this.emit("update")
    })

    // post/topic
    this.events.register("channels", this.core, "channels/topic", ({ channel, topic, publicKey }) => {
      this._addUserIfNew(publicKey)
      if (!this.channels.has(channel)) { 
        log("channels/topic: can't find channel %s", channel)
        return 
      }
      this.channels.get(channel).topic = topic
      log("channels/topic: %s topic set to %s by %s", channel, topic, publicKey)
      this.emit("update")
    })

    // post/join
    this.events.register("channels", this.core, "channels/join", ({ channel, publicKey }) => {
      this._addUserIfNew(publicKey)
      if (!this.channels.has(channel)) { 
        log("channels/join: can't find channel %s", channel)
        return 
      }
      this.channels.get(channel).addMember(publicKey)
      log("channels/join: %s joined by %s", channel, publicKey)
    })

    // post/leave
    this.events.register("channels", this.core, "channels/leave", ({ channel, publicKey }) => {
      this._addUserIfNew(publicKey)
      if (!this.channels.has(channel)) { 
        log("channels/leave: can't find channel %s", channel)
        return 
      }
      this.channels.get(channel).removeMember(publicKey)
      log("channels/leave: %s left by %s", channel, publicKey)
    })

    // post/info key:name
    this.events.register("users", this.core, "users/name-changed", ({ publicKey, name }) => {
      this._addUserIfNew(publicKey)
      this.users.get(publicKey).name = name
      log("users/name-changed: %s set name to %s", publicKey, name)
      this.emit("update")
    })
  }

  // handles all initial cable-specific protocol bootstrapping
  _initializeProtocol() {
    const log = startDebug("initialize-protocol")
    log("get joined channels")
    // operate on joined channels
    this.core.getJoinedChannels((err, channels) => {
      if (err) { 
        log("had err %s when getting joined channels from core", err)
        return 
      }
      log("joined channels: %s", channels)
      const policy = this.policies.JOINED
      channels.forEach(ch => {
        log("request posts for joined channel %s", ch)
        const postsReq = this.core.requestPosts(ch, timeWindowFromOffset(policy.windowSize), 0, DEFAULT_TTL, policy.limit)
        log(postsReq)
      })
    })
    this.core.getChannels((err, channels) => {
      log("get all channels", err, channels)
      const policy = this.policies.UNJOINED
      channels.forEach(ch => {
        // TODO (2023-08-09): how to cancel requests previously issued e.g. channelStateRequest, or channelTimeRangeRequest. 
        // use channel name to keep track in cable-core if a new request comes cancel the old one and replace with the new one?
        
        // request posts for unjoined channels
        if (this.channels.has(ch) && !this.channels.get(ch).joined) {
          const postsReq = this.core.requestPosts(ch, timeWindowFromOffset(policy.windowSize), 0, DEFAULT_TTL, policy.limit)
          log("request posts for unjoined channel %s", ch)
        }
        // for all channels, request channel state
        const stateReq = this.core.requestState(ch, DEFAULT_TTL, 1)
        log("request state for %s", ch)
      })
    })
    // TODO (2023-08-09): operate on dropped channels
   
    // request channel list, in case new channels have been created while offline, keep intermittently requesting for
    // new channels as well
    const channelsReq = this.core.requestChannels(DEFAULT_TTL, 0, DEFAULT_CHANNEL_LIST_LIMIT)
    log("request channels")
    // TODO (2023-08-09): save this timer in case we need to cancel it
    setInterval(() => {
      const channelsReq = this.core.requestChannels(DEFAULT_TTL, 0, DEFAULT_CHANNEL_LIST_LIMIT)
      log("periodic request channels")
    }, CHANNEL_LIST_RENEWAL_INTERVAL)
  }

  // we received notice of a new channel, do cable-client book keeping and some protocol stuff
  // TODO (2023-08-09): hook up to future event like `this.core.on("new-channel")`
  _handleNewChannel (channel) {
    this._addChannel(channel)
    // request basic state for the channel such as its members and the current topic
    const stateReq = this.core.requestState(ch, DEFAULT_TTL, 1)
    // despite not having joined the channel, we make sure to requests some posts to make sure it has some backlog if we
    // do decide to join it
    const policy = this.policies.UNJOINED 
    const postsReq = this.core.requestPosts(ch, timeWindowFromOffset(policy.windowSize), 0, DEFAULT_TTL, policy.limit)
  }

  focus(channel) {
    if (!this.channels.has(channel)) { return }
    if (this.channels.get(this.currentChannel)) {
      this.channels.get(this.currentChannel).unfocus()
    }
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
    if (!this.channels.has(channel)) {
      return cb([])
    }
    this.channels.get(channel).getPage(opts, cb)
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
    debug("getUsers")
    return new Map(this.users)
  }
  getAllChannels() {
    debug("get all channels")
    const channels = []
    for (let channel of this.channels.values()) {
      channels.push(channel.name)
    }
    return channels.sort()
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
    debug("get current channel", this.currentChannel)
    return this.currentChannel
  }

  /* post producing methods */
  join(channel, focus=true) {
    // already joined the channel, exit early
    if (this.channels.has(channel) && this.channels.get(channel).joined) { return }
    debug("join channel %s", channel)
    this._addChannel(channel, true)
    if (focus) { this.focus(channel) }
    this.core.join(channel)
    const postsReq = this.core.requestPosts(channel, timeWindowFromOffset(this.policies.JOINED.windowSize), 0, DEFAULT_TTL, this.policies.JOINED.limit)
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
