// SPDX-FileCopyrightText: 2023 the cable-client authors
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/* 
 * translation layer between old cabal-client api and the new library cable-client. 
 * this allows cabal-cli to operate on `cable-client` with only minimal changes to the cabal-cli codebase :) 
*/

// shim.js acts as a guide for how existing cabal clients (pre-cable) can be updated, demonstrating the api changes
// between the old cabal-client and the new cable-client

const EventEmitter = require("events").EventEmitter
const CableClient = require("./cable-client.js")
const crypto = require("cable.js/cryptography.js")
const b4a = require("b4a")
const xdg = require("xdg-portable") // note: xdg-portable uses `path` which also works after being browserfied 
const path = require("path")
const { Level } = require("level")
const { MemoryLevel } = require("memory-level")
const readOrGenerateKeypair = require("./keypair.js")
const raf = require("random-access-file")
const mkdirp = require('mkdirp') // note: check to make sure this module doesn't throw after browserify

class CabalDetails extends EventEmitter {
  constructor(opts, done) {
    super()
    this.core = { adminKeys: [], modKeys: [] } // shim for compatibility reasons
    this.key = opts.key

    let level = Level
    if (opts.config.temp) {
      level = MemoryLevel
    }
    opts.config.key = this.key

    const keypath = path.join(opts.config.dbdir, opts.key, "keypair.json")
    mkdirp.sync(path.dirname(keypath))
   
    readOrGenerateKeypair(raf, keypath, opts.config.temp, (keypair) => {
      opts.config.keypair = keypair
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
    })
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
  publishNick(nick, done) { this.cc.setName(nick, done) }
  publishMessage() { }
}

class Client {
  constructor(opts) {
    this._ready = false
    this._start = () => {
      this._ready = true
      for (let fn of this.queue) { fn() } 
    }
    this.opts = opts
    this.queue = []
  }

  /* methods where we punt to cabal details */
  getJoinedChannels() { return this.details.getJoinedChannels() }
  getUsers() { return this.details.getUsers() }
  getMessages(opts, cb) { this.details.getChat(cb) }
  focusChannel(ch) { this.details.focusChannel(ch) }

  /* static methods */
  static getDatabaseVersion () { return "1" }
  static getCabalDirectory() {
    return path.join(xdg.config(), ".cable", `v${Client.getDatabaseVersion()}`)
  }

  /* variations of the same: getting the cabal instance */
  // for cable-client, we'll only operate on a single cabal instance (if you want more, instantiate more cable-clients)
  cabalToDetails () { return this.details }
  createCabal() {
    return (new Promise((res, rej) => {
      const key = generateJoiningKey()
      this.__setKey(key)
      this.details = new CabalDetails(this.opts, this._start)
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

  __setKey (key) {
    if (!this.opts) {
      this.opts = {}
    }
    if (this.opts.key) {
      console.error("mock: already had opts.key!", this.opts.key, "overwriting old key")
    }
    this.opts.key = key
  }

  static scrubKey (key) {
    if (!key || typeof key !== 'string') return ''
    // remove url search params; indexOf returns -1 if no params => would chop off the last character if used w/ slice
    if (key.indexOf("?") >= 0) {
      return key.slice(0, key.indexOf("?")).replace('cabal://', '').replace('cbl://', '').replace(/\//g, '')
    }
    return key.replace('cabal://', '').replace('cbl://', '').replace(/\//g, '')
  }


  /* unimplemented/untouched methods */
  getNumberUnreadMessages() { return 0 }
  getMentions() { return [] }
  markChannelRead(ch) { }
  // 2023-09-19 note: only supports one cabal instance; rename to "startCabal(key)" once this shim phase is concluded
  addCabal(key) {
    return new Promise((res, rej) => {
      this.__setKey(key)
      this.details = new CabalDetails(this.opts, this._start)
      this.queue.push(() => {
        return res(this.details)
      })
    })
  }
  getCommands() {}
}

// aka cabal key
function generateJoiningKey() {
  const buf = crypto.randomBytes(32)
  return b4a.toString(buf, "hex")
}

module.exports = {
  Client, 
  CabalDetails
}
