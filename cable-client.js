// SPDX-FileCopyrightText: 2023 the cable-client authors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

// internal deps
const constants = require("cable.js/constants.js")
const CableCore = require("cable-core/index.js").CableCore
const EventsManager = require("cable-core/index.js").EventsManager
const ChannelDetails = require("./channel.js").ChannelDetails
const replicationPolicy = require("./policy.js")
const HSNetwork = require("./hs-network.js").Network
const TCPNetwork = require("./tcp-network.js").Network
const LANNetwork = require("./network.js").Network
const defaultCommands = require("./commands.js")
const Pender = require("./pending")
// external deps
const EventEmitter = require("events").EventEmitter
const debugParent = "cable-client"
const debug = require("debug")(debugParent)
const startDebug = (name) => { return require("debug")(`${debugParent}:${name}`) }
const timestamp = require("monotonic-timestamp")
const b4a = require("b4a")
const path = require("path")

const DEFAULT_TTL = 3
const DEFAULT_CHANNEL_LIST_LIMIT = 100
const CHANNEL_LIST_RENEWAL_INTERVAL = 30 * 60 * 1000 // every 30 minutes

function noop () {}

class User {
  constructor(key, name, hiddenFn, blockedFn) {
    this.acceptRole = 1 // default value, changes on setting user info
    this.currentName = name
    this.key = key
    this.roles = new Map()
    // maps channel contexts to the user's state in that context (entire cabal or a specific channel)
    // TODO (2024-04-01): currently only covers hidden (as a boolean) 
    this.modState = new Map()

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
    this.queryHidden = hiddenFn
    this.queryBlocked = blockedFn
  }

  #checkRoleInChannel(ch, cmpRole) {
    if (this.roles.has(ch)) {
      if (this.roles.get(ch) === cmpRole) { return true }
    }
    if (this.roles.has(constants.CABAL_CONTEXT)) {
      if (this.roles.get(constants.CABAL_CONTEXT) === cmpRole) { return true }
    }
    return false
  }

  isAdmin(ch) { 
    return this.#checkRoleInChannel(ch, constants.ADMIN_FLAG)
  }
  isModerator(ch) { 
    return this.#checkRoleInChannel(ch, constants.MOD_FLAG)
  }
  isHidden(ch) {
    return this.queryHidden(this.key, ch)
  }
  isBlocked() {
    return this.queryBlocked(this.key)
  }
}

/* goals:
 * calls to cable client methods are synchronous as far as possible 
 * cable-client sets defaults, but users of cable-client can change them according to their needs
*/
// TODO (2023-08-09): figure out solution for connecting peers with requests and at what layer:
// * does cable-core have a list of peers? and when a new peer appears we send them our already issue set of requests
//
// TODO (2023-08-09): replication optimization: when we leave a channel, issue a new time range request with replication policy for unjoined channels
//
// TODO (2023-08-09): receive event from core when a time range request has reached end of life, enabling renewal of the request?
//
// TODO (2023-09-13): introduce !status channel
//
// TODO (2023-09-13): detect joining new cabal and join channel 'default'
function timeWindowFromOffset(offset) {
  return +(new Date()) - offset
}

class CableClient extends EventEmitter {
  constructor(level, opts) {
    super()

    if (!opts) {
      opts = { 
        config: {
          temp: true,
          dbdir: "./data",
          preferredPort: 0
        }
      }
    }

    this.key = opts.key

    this.pender = new Pender()
    this.pender.on("ready", () => { this.emit("ready") })

    this.showHashes = false
    this.showIds = false

    this.commands = opts.commands || {}
    this.commands = Object.assign({}, this.commands, defaultCommands)
    this.aliases = {}
    // populate command aliases
    Object.keys(this.commands).forEach(key => {
      ;(this.commands[key].alias || []).forEach(alias => {
        this.aliases[alias] = key
      })
    })
    /* _res takes a command (cabal event type, a string) and returns an object with the functions: info, error, end */
    this._res = function (command) { // command: the type of event emitting information (e.g. channel-join, new-message, topic etc)
      let seq = 0 // tracks # of sent info messages
      const uid = `${timestamp()}` // id uniquely identifying this stream of events
      return {
        info: (msg, obj) => {
          let payload = (typeof msg === "string") ? { text: msg } : { ...msg }
          if (typeof obj !== "undefined") payload = { ...payload, ...obj }
          payload["meta"] = { uid, command, seq: seq++ }

          this.emit('info', payload)
        },
        error: (err) => {
          this.emit('error', err)
        },
        end: () => {
          // emits an event to indicate the command has finished 
          this.emit('end', { uid, command, seq })
        }
      }
    }

    const proceedNew = this.pender.wait("new cable client instance")
    this.events = new EventsManager()
    debug("new cable client instance")
    // TODO (2023-08-09): replication policies, accept defaults passed to cable client
    this.policies = {
      JOINED: new replicationPolicy.JoinedPolicy(),
      DROPPED: new replicationPolicy.DroppedPolicy(),
      UNJOINED: new replicationPolicy.UnjoinedPolicy()
    }
    // `this.moderation` is an instance of cable-core:ModerationSystem and it is populated and updated by cable-core
    // when the instance has been the following event is fired: `this.core.on("moderation/actions-update")
    Object.defineProperty(this, 'moderation', {
      get: () => {
        return this.core.moderationActions
      }
    })
    this.channels = new Map()
    // maps each user's public key to an instance of the User class
    this.users = new Map()
    this._initializeClient(level, opts.config)
    this.localUser = this._getUser(this.core.kp.publicKey.toString("hex"))
    // TODO (2024-02-27): use core.getName?
    this.users.set(this.localUser.key, this.localUser)
    setTimeout(() => {
      this._initializeProtocol()
      proceedNew()
    }, 150)
  }

  ready(cb) {
    this.pender.enqueue(cb)
  }

  /**
   * Interpret a line of input from the user.
   * This may involve running a command or publishing a message to the current
   * channel.
   * @param {string} [line] input from the user
   * @param {function} [cb] callback called when the input is processed
   */
  processLine (line, cb) {
    debug("processLine %s", line)
    if (!cb) { cb = noop }
    var m = /^\/\s*(\w+)(?:\s+(.*))?/.exec(line.trimRight())
    if (m && this.commands[m[1]] && typeof this.commands[m[1]].call === 'function') {
      this.commands[m[1]].call(this, this._res(m[1]), m[2])
    } else if (m && this.aliases[m[1]]) {
      var key = this.aliases[m[1]]
      if (this.commands[key]) {
        this.commands[key].call(this, this._res(key), m[2])
      } else {
        this._res("warn").info(`command for alias ${m[1]} => ${key} not found`)
        cb()
      }
    } else if (m) {
      this._res("warn").info(`${m[1]} is not a command. type /help for commands`)
    } else if (this.chname !== '!status' && /\S/.test(line)) { // disallow typing to !status
      this.postText(line.trimRight(), this.currentChannel, cb)
    } else {
      debug("processLine: no matches")
    }
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

  _initializeClient(level, opts) {
    const log = startDebug("_initialize")
    this.focus("default")
    const network = []
    if (!opts.disableDHT) { network.push(HSNetwork) }
    if (!opts.disableTCP) { network.push(TCPNetwork) }
    if (!opts.disableLAN) { network.push(LANNetwork) }
    opts = { ...opts, network }
    if (!opts.dbdir) { opts.dbdir = "./data" }
    if (opts.dbdir) {
      opts.storage = path.join(opts.dbdir, opts.key)
    }
    this.core = new CableCore(level, opts)
    this._registerEvents()
    // get joined channels and populate this.channels
    const proceedInit = this.pender.wait("initialize client")
    new Promise((res, rej) => {
      debug("inside created prom")
      this.core.getJoinedChannels((err, channels) => {
        if (err) { 
          log("had err %s when getting joined channels from core", err)
          return res() && proceedInit()
        }

        // if we have joined no channels, then join the default channel
        if (channels.length === 0) {
          this.join("default")
          channels.push("default")
        }

        // initialize the focused channel to "default" if it exists among the joined channels, else to the
        // lexicographically first channel
        if (channels.includes("default")) {
          this.currentChannel = "default"
        } else {
          this.currentChannel = channels.sort()[0]
        }

        const channelPromises = channels.map(ch => {
          return new Promise((channelRes, rej) => {
            this._addChannel(ch, true)
            const proceedCh = this.pender.wait("joined channel " + ch)
            this.core.getTopic(ch, (err, topic) => {
              if (err) { return proceedCh() && channelRes() }
              this.channels.get(ch).topic = topic
            })

            this.core.getUsersInChannel(ch, (err, users) => {
              debug("users in channel", users)
              if (err) { 
                debug("users in channel had err, returning early")
                return proceedCh() && channelRes()
              }
              for (const [userKey, info] of users) {
                this._updateUser(userKey, info)
                this.channels.get(ch).addMember(userKey)
              }
              this.emit("update")
              debug("proceed and channelRes()")
              proceedCh()
              channelRes()
            })
          })
        })
        Promise.all(channelPromises).then(res)
      })
    }).then(() => {
      // TODO (2024-03-15): register moderation/actions-update + moderation/roles-update and perform the same
      // operations there
      const modPromises = []

      modPromises.push(new Promise((res, rej) => { 
        this.core.getAllModerationActions((err, actions) => {
          debug("mod actions", actions)
          return res()
        })
      }))
      // userRoleMap is a map of [publicKey][channel|cabal_context] = <role in channel>
      modPromises.push(new Promise((res, rej) => { 
        this.core.getAllRoles((err, userRoleMap) => {
          debug("all mod roles", userRoleMap)
          this._setRoles(userRoleMap)
          return res()
        })
      }))
      Promise.all(modPromises).then(proceedInit)
    })
  }

  // userRoleMap maps a user's public key to another map. this second map contains the users roles in each channel as
  // [channel] =>  { role: int constant, since: int timestamp, precedence: boolean }
  _setRoles(userRoleMap) {
    debug("incoming userRoleMap %O", userRoleMap)
    for (const [userkey, rolesMap] of userRoleMap) {
      debug("key %s rolesMap %O", userkey, rolesMap)
      this._getUser(userkey).roles = rolesMap
    }
  }

  _getUser(publicKey) {
    // ensures we always have a user instantiation ready
    this._addUser(publicKey)
    return this.users.get(publicKey)
  }

  _addUser(publicKey) {
    if (!this.users.has(publicKey)) {
      const u = new User(publicKey, "", (pubkey, ch) => { return this.moderation.isUserHidden(pubkey, ch) }, (pubkey) => { return this.moderation.isUserBlocked(pubkey) })
      this.users.set(publicKey, u)
    }
  }

  _updateUser(publicKey, info) {
    debug("add user, new name %s", info.name)
    const u = this._getUser(publicKey)
    u.name = info.name
    u.acceptRole = info.acceptRole
  }

  // listen for events that are emitted from cable-core when it has processed new posts
  _registerEvents() {
    const proceedEvents = this.pender.wait("register events")
    const log = startDebug("events")
    // post/text
    this.events.register("chat", this.core, "chat/add", ({ channel, hash, post, publicKey }) => {
      this._addUser(publicKey)
      this._addChannel(channel)
      log("chat/add: new post in %s %O (hash %s) by %s", channel, post, hash, publicKey)
      this.emit("update")
    })

    // post/delete
    // TODO (2023-08-23): add toggle to show post hashes in cli + command to delete by hash
    this.events.register("chat", this.core, "chat/remove", ({ channel, hash, topic, publicKey }) => {
      this._addUser(publicKey)
      this._addChannel(channel)
      log("chat/remove: (TODO in cli view) %s removed post with hash %s from channel", publicKey, hash, channel)
      this.emit("update")
    })

    // post/topic
    this.events.register("channels", this.core, "channels/topic", ({ channel, topic, publicKey }) => {
      this._addUser(publicKey)
      this._addChannel(channel)
      this.channels.get(channel).topic = topic
      log("channels/topic: %s topic set to %s by %s", channel, topic, publicKey)
      this.emit("update")
    })

    // post/join
    this.events.register("channels", this.core, "channels/join", ({ channel, publicKey }) => {
      this._addUser(publicKey)
      this._addChannel(channel)
      this.channels.get(channel).addMember(publicKey)
      log("channels/join: %s joined by %s", channel, publicKey)
      this.emit("update")
    })

    // post/leave
    this.events.register("channels", this.core, "channels/leave", ({ channel, publicKey }) => {
      this._addUser(publicKey)
      this._addChannel(channel)
      this.channels.get(channel).removeMember(publicKey)
      log("channels/leave: %s left by %s", channel, publicKey)
      this.emit("update")
    })
    
    // channel list response
    this.events.register("channels", this.core, "channels/add", ({ channels }) => {
      channels.forEach(channel => { 
        this._handleNewChannel(channel, false)
      })
      log("channels/add: %O", channels)
      this.emit("update")
    })

    // post/info key:name
    this.events.register("users", this.core, "users/name-changed", ({ publicKey, name }) => {
      this._getUser(publicKey).name = name
      log("users/name-changed: %s set name to %s", publicKey, name)
      this.emit("update")
    })

    this.events.register("moderation", this.core, "moderation/actions-update", (post) => {
      debug("mod/actions-update: %O", post)
      this.emit("update")
    })
    this.events.register("moderation", this.core, "moderation/roles-update", (userRoleMap) => {
      this._setRoles(userRoleMap)
      this.emit("update")
    })
    this.events.register("moderation", this.core, "moderation/action", ({ publicKey, action, recipients, reason, channel }) => {
      debug(`mod/action: ${action} recps ${recipients}`)
      // note: do not take any actions based on this event, that is tracked and handled by `this.moderation` 
      if (publicKey === this.localUser.key) { 
        // if the author is the local user, return early and don't a status message (they've already received a prompt from executing the command)
        return 
      }
      let verb
      switch (action) {
        case constants.ACTION_HIDE_USER:
          verb = "hid"
          break
        case constants.ACTION_UNHIDE_USER:
          verb = "unhid"
          break
      }
      this._addModerationMessage(publicKey, verb, recipients, reason, channel)
    })
    this.events.register("moderation", this.core, "moderation/role", () => {
    })
    this.events.register("moderation", this.core, "moderation/block", ({ publicKey, reason, recipients }) => {
      if (publicKey === this.localUser.key) { 
        // if the author is the local user, return early and don't a status message (they've already received a prompt from executing the command)
        return 
      }
      this._addModerationMessage(publicKey, "blocked", recipients, reason, null)
    })
    this.events.register("moderation", this.core, "moderation/unblock", ({ publicKey, reason, recipients }) => {
      if (publicKey === this.localUser.key) { 
        // if the author is the local user, return early and don't a status message (they've already received a prompt from executing the command)
        return 
      }
      this._addModerationMessage(publicKey, "unblocked", recipients, reason, null)
    })

    // post/moderation + post/block + post/unblock initialized
    this.events.register("moderation", this.core, "moderation/init", () => {
      log("moderation/init fired")
      this.emit("update")
      // moderation/init only fires once so we don't need to keep the listener around
      this.events.deregister("moderation", "moderation/init")
    })
    proceedEvents()
  }

  _addModerationMessage(authorKey, verb, recipients, reason, channel) {
      const names = recipients.map(pubkey => this.users.get(pubkey).name)
      const author = this.users.get(authorKey).name
      debug("zchannel '%s'", channel)
      debug("zreason '%s'", reason)
      const reasonString = (reason.length > 0) ? `(reason: "${reason}")` : ''
      const channelString = (channel && channel.length > 0 && channel !== constants.CABAL_CONTEXT) ? `in channel ${channel} `: ''
      let text
      if (recipients.length > 4) {
        text = `${author} ${verb} ${recipients.length} users ${channelString}${reasonString}`
      } else {
        text = `${author} ${verb} ${names.join(',')} ${channelString}${reasonString}`
      }
      this.addStatusMessage({ text }, this.currentChannel)

      this.emit("update")
  }

  // handles all initial cable-specific protocol bootstrapping
  _initializeProtocol() {
    const log = startDebug("initialize-protocol")
    log("get joined channels")

    // TODO (2024-03-20): initialize moderation state request
    
    // operate on joined channels
    const proceedProtocolJoined = this.pender.wait("init protocol: joined")
    this.core.getJoinedChannels((err, channels) => {
      if (err) { 
        log("had err %s when getting joined channels from core", err)
        return proceedProtocolJoined()
      }
      log("joined channels: %s", channels)
      const policy = this.policies.JOINED
      channels.forEach(ch => {
        log("request posts for joined channel %s", ch)
        const postsReq = this.core.requestPosts(ch, timeWindowFromOffset(policy.windowSize), 0, DEFAULT_TTL, policy.limit)
        log(postsReq)
      })

      // request moderation state (post/{moderation, role, block, unblock} for all joined channels
      // TODO (2024-03-25): use larger time window
      const modReq = this.core.requestModeration(DEFAULT_TTL, channels, 1, timeWindowFromOffset(policy.windowSize))
      log("request moderation state for all joined channels", modReq)

      proceedProtocolJoined()
    })

    const proceedProtocolChannels = this.pender.wait("init protocol: all channels")
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
      proceedProtocolChannels()
    })
    // TODO (2023-08-09): operate on dropped channels
   
    // request channel list, in case new channels have been created while offline, keep intermittently requesting for
    // new channels as well
    const proceedListRequest = this.pender.wait("init protocol: channel list request")
    const channelsReq = this.core.requestChannels(DEFAULT_TTL, 0, DEFAULT_CHANNEL_LIST_LIMIT)
    log("request channels")
    // TODO (2023-08-09): save this timer in case we need to cancel it
    setInterval(() => {
      const channelsReq = this.core.requestChannels(DEFAULT_TTL, 0, DEFAULT_CHANNEL_LIST_LIMIT)
      log("periodic channel list request")
    }, CHANNEL_LIST_RENEWAL_INTERVAL)
    proceedListRequest()
  }

  // we received notice of a new channel, do cable-client book keeping and some protocol stuff
  // TODO (2023-08-09): hook up to future event like `this.core.on("new-channel")`
  _handleNewChannel (channel, joined) {
    if (this.channels.has(channel)) { return }
    debug("handle new channel %s (joined %s)", channel, joined)
    this._addChannel(channel)
    // request basic state for the channel such as its members and the current topic
    const stateReq = this.core.requestState(channel, DEFAULT_TTL, 1)
    // despite not having joined the channel, we make sure to requests some posts to make sure it has some backlog if we
    // do decide to join it
    const policy = joined ? this.policies.JOINED : this.policies.UNJOINED 
    const postsReq = this.core.requestPosts(channel, timeWindowFromOffset(policy.windowSize), 0, DEFAULT_TTL, policy.limit)
    const modReq = this.core.requestModeration(DEFAULT_TTL, [channel], 1, timeWindowFromOffset(policy.windowSize))
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

  _causalSort(posts, cb) {
    const log = startDebug("causalSort")
    const postsMap = new Map()
    posts.forEach(post => { postsMap.set(post.postHash, post) })

    function popNext(stack) {
      let best = stack[0], besti = 0
      for (let i = 1; i < stack.length; i++) {
        let s = stack[i]
        if (s.timestamp < best.timestamp) {
          besti = i
          best = s
        }
      }
      // swap the found element to the end of the stack and pop it
      // this avoids an in-place splice that would copy or re-allocate the array
      let tmp = stack[stack.length-1]
      stack[besti] = tmp
      stack.pop()
      return best
    }

    this.core.getReverseLinks(postsMap.keys(), (err, rlinks) => {
      log("reverse links", rlinks)
      let stack = []
      // initialize the stack with posts that have no available links
      // i.e. get the heads of the current interval
      for (let post of postsMap.values()) {
        let count = 0
        for (let link of post.links ?? []) {
          count += postsMap.has(link) ? 1 : 0
          if (count > 0) break
        }
        if (count === 0) stack.push(post)
      }

      let seen = new Set()
      let results = []
      loop: while (stack.length > 0) {
        let post = popNext(stack)
        for (let link of post.links ?? []) {
          // first condition: we have the post locally which is referred to by the link id
          // second condition: we have not processed it yet
          if (postsMap.has(link) && !seen.has(link)) {
            // the post links to an available post that has not yet been seen,
            // so it's too early to yield this post.
            // don't worry, it will get pushed to the stack again when the
            // linked post appears on the stack because post is reverse linked.
            continue loop
          }
        }
        // we've already added this post to the results, next pls!
        if (seen.has(post.postHash)) continue
        seen.add(post.postHash)
        // add to results / output we'll return at the end
        results.push(post)
        // for each link that references the current post
        for (let link of rlinks.get(post.postHash) ?? []) {
          // we've already processed a particular link; skip it
          if (seen.has(link)) continue
          // get post from database using the link hash (TODO?)
          let post = postsMap.get(link)
          // push new post to the working stack if we have the data referred by the link hash
          if (post !== undefined) stack.push(post)
        }
      }
      log("results", results)
      cb(results)
    })
  }

  /* getting information */
  getChat(channel, opts, cb) {
    if (!opts) { opts = {} }
    debug("get chat %s", channel)
    if (!this.channels.has(channel)) {
      return cb([])
    }
    this.channels.get(channel).getPage(opts, this._causalSort.bind(this), cb)
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
  getChannelMembers(channel=this.currentChannel) {
    const obj = {}
    this.channels.get(channel).getMembers().forEach(userKey => {
      obj[userKey] = this.users.get(userKey)
    })
    debug("get channel (%s) members", channel)
    return obj
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
    // TODO (2024-04-03): replace channel time range request on newly joined channel with a ctr using policy.JOINED's params
    if (focus) { this.focus(channel) }
    this.core.join(channel)

    // make sure we populate our channels object with the current members of the channel we are joining
    this.core.getUsersInChannel(channel, (err, users) => {
      debug("users %O", users)
      debug("users err %O", err)
      for (const [userKey, obj] of users) {
        debug("info", obj)
        this._updateUser(userKey, obj)
      }
    })
    this.emit("update")
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
      this.emit("update")
      if (cb) { cb() }
    })
  }
  addStatusMessage(statusMessage, channel=this.currentChannel) {
    if (!this.channels.has(channel)) { return }
    this.channels.get(channel).addVirtualMessage(statusMessage)
    debug("add status message %s to channel %s", statusMessage, channel)
    this.emit("update")
  }
  clearStatusMessages(channel) {
    if (!this.channels.has(channel)) { return }
    this.channels.get(channel).clearVirtualMessages()
    debug("clear status message for channel %s", channel)
    this.emit("update")
  }
  // TODO (2023-08-07): emit event
  setTopic(topic, channel, cb) {
    if (!cb) { cb = noop }
    this.core.setTopic(channel, topic, () => {
      debug("set topic %s for channel %s", topic, channel)
      if (!this.channels.has(channel)) { this._addChannel(channel) }
      this.channels.get(channel).topic = topic
      cb()
    })
  }
  setName(name, done) {
    if (!done) { done = noop }
    debug("set name to %s", name)
    this.core.setName(name, (err) => {
      if (err) {
        return done(err)
      }
      this.localUser.name = name
			done()
    })
  }

  /* storage management related methods (delete also produces posts) */
  deleteSingle(hash, done) {
    if (!done) { done = noop }
    debug("request single delete for hash %s", hash)
    this.core.del(b4a.from(hash, "hex"), done)
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

module.exports = CableClient
